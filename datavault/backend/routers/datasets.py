import os
import io
import re
import json
import logging
import unicodedata
import uuid
from dataclasses import dataclass
from collections import defaultdict
from datetime import datetime, timezone, date as date_type
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update, and_, or_, not_, text
from database import get_db
from models import Dataset, User, Record, ColumnDefinition, DatasetPermission, DatasetGroupPermission, UserGroupMember, WorkspaceMember
from schemas import DatasetCreate, DatasetUpdate, DatasetOut, ComputeResult, ColumnOut
from auth import get_current_user, require_admin, ds_require_editor, ds_require_viewer, effective_workspace_role, effective_role
from limiter import limiter
from templates import TEMPLATES, find_template
from billing_plans import assert_can
from lambda_executor import (
    run_executor, LambdaNotConfigured, LambdaInvocationError, LambdaExecutionError,
)

logger = logging.getLogger("datavault.datasets")

router = APIRouter(prefix="/datasets", tags=["datasets"])


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DatasetOut])
async def list_datasets(
    workspace_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Reglas de visibilidad (mismo orden de prioridad que `effective_role`):

      1. admin global → ve todos.
      2. Permiso directo en `dataset_permissions` con role != 'none' → visible.
         Permiso directo con role == 'none' → oculto (overrides explícito).
      3. Sin permiso directo: permiso de grupo con role != 'none' → visible.
         Permiso de grupo con role == 'none' → oculto.
      4. Sin permisos directos ni de grupo:
         - Si el dataset pertenece a un workspace y el usuario es miembro → visible.
         - Si el dataset NO tiene workspace (legacy) → visible solo si el rol
           global del usuario no es 'viewer' (datasets huérfanos solo para
           editores/admins). Antes eran visibles a todos.
    """
    ws_filter = Dataset.workspace_id == workspace_id if workspace_id else True
    result = await db.execute(
        select(Dataset)
        .where(and_(accessible_datasets_filter(current_user), ws_filter))
        .order_by(Dataset.created_at.desc())
    )
    return result.scalars().all()


# ── Helpers ───────────────────────────────────────────────────────────────────

def accessible_datasets_filter(user: User):
    """Expresión SQL booleana de visibilidad de datasets para `user`.

    Mismo orden de prioridad que `effective_role`:
      1. permiso directo (role != 'none') gana sobre todo; role == 'none' oculta.
      2. sin permiso directo → permiso de grupo decide igual.
      3. sin permisos directos ni de grupo → membresía de workspace.

    Para admin global devuelve `True` (ve todos). Usar combinado con el filtro de
    workspace: `select(Dataset).where(and_(accessible_datasets_filter(u), ws_filter))`.
    """
    if user.role == "admin":
        return True

    direct_perm_any = select(DatasetPermission.dataset_id).where(
        DatasetPermission.user_id == user.id,
    )
    direct_perm_granted = select(DatasetPermission.dataset_id).where(
        DatasetPermission.user_id == user.id,
        DatasetPermission.role != "none",
    )
    user_group_ids = select(UserGroupMember.group_id).where(
        UserGroupMember.user_id == user.id,
    )
    group_perm_any = select(DatasetGroupPermission.dataset_id).where(
        DatasetGroupPermission.group_id.in_(user_group_ids),
    )
    group_perm_granted = select(DatasetGroupPermission.dataset_id).where(
        DatasetGroupPermission.group_id.in_(user_group_ids),
        DatasetGroupPermission.role != "none",
    )
    user_workspace_ids = select(WorkspaceMember.workspace_id).where(
        WorkspaceMember.user_id == user.id,
    )

    has_direct = Dataset.id.in_(direct_perm_any)
    has_group  = Dataset.id.in_(group_perm_any)
    return or_(
        Dataset.id.in_(direct_perm_granted),                                  # capa 1
        and_(not_(has_direct), Dataset.id.in_(group_perm_granted)),           # capa 2
        and_(not_(has_direct), not_(has_group),                               # capa 3
             Dataset.workspace_id.in_(user_workspace_ids)),
    )


async def _require_ws_manager(user: User, workspace_id: uuid.UUID | None, db: AsyncSession):
    """Permite admin global, o owner/admin_ws del workspace."""
    if user.role == "admin":
        return
    if not workspace_id:
        raise HTTPException(status_code=403, detail="Se requiere workspace para esta operación")
    ws_role = await effective_workspace_role(user, workspace_id, db)
    if ws_role not in ("owner", "admin_ws"):
        raise HTTPException(status_code=403, detail="Requiere rol owner o admin_ws en el workspace")


async def _validate_source_datasets(
    source_ids: list[str],
    user: User,
    db: AsyncSession,
    exclude_id: uuid.UUID | None,
) -> None:
    """Verifica que cada source dataset exista, no sea el propio dataset y que el usuario tenga acceso de lectura."""
    if not source_ids:
        return
    parsed: list[uuid.UUID] = []
    for raw in source_ids:
        try:
            parsed.append(uuid.UUID(str(raw)))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=400, detail=f"ID de dataset fuente inválido: {raw}")

    if exclude_id and exclude_id in parsed:
        raise HTTPException(status_code=400, detail="Un dataset calculado no puede referirse a sí mismo")

    result = await db.execute(select(Dataset.id).where(Dataset.id.in_(parsed)))
    existing = {row[0] for row in result.all()}
    missing = [str(i) for i in parsed if i not in existing]
    if missing:
        raise HTTPException(status_code=400, detail=f"Datasets fuente no encontrados: {missing}")

    if user.role != "admin":
        for src_id in parsed:
            role = await effective_role(user, src_id, db)
            if role in (None, "none"):
                raise HTTPException(
                    status_code=403,
                    detail=f"Sin acceso al dataset fuente {src_id}",
                )


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=DatasetOut, status_code=201)
@limiter.limit("20/minute")
async def create_dataset(
    request: Request,
    body: DatasetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_ws_manager(current_user, body.workspace_id, db)

    # Límites del plan: cantidad de datasets + feature de scripts (computed)
    await assert_can(body.workspace_id, "dataset", db)
    if body.is_computed:
        await assert_can(body.workspace_id, "script", db)

    # Validar source_dataset_ids (computed): existencia + acceso + no auto-referencia
    if body.is_computed and body.source_dataset_ids:
        await _validate_source_datasets(body.source_dataset_ids, current_user, db, exclude_id=None)

    dataset = Dataset(
        name=body.name,
        description=body.description,
        workspace_id=body.workspace_id,
        is_computed=body.is_computed,
        source_code=body.source_code,
        source_dataset_ids=body.source_dataset_ids,
    )
    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)
    return dataset


# ── Update ────────────────────────────────────────────────────────────────────

@router.patch("/{dataset_id}", response_model=DatasetOut)
async def update_dataset(
    dataset_id: uuid.UUID,
    body: DatasetUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    await _require_ws_manager(current_user, dataset.workspace_id, db)

    updates = body.model_dump(exclude_unset=True)
    if "source_dataset_ids" in updates and updates["source_dataset_ids"] is not None:
        await _validate_source_datasets(updates["source_dataset_ids"], current_user, db, exclude_id=dataset.id)

    for field, value in updates.items():
        setattr(dataset, field, value)
    await db.commit()
    await db.refresh(dataset)
    return dataset


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(
    dataset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    await _require_ws_manager(current_user, dataset.workspace_id, db)
    await db.delete(dataset)
    await db.commit()


# ── Compute (Lambda executor) ─────────────────────────────────────────────────

@router.post("/{dataset_id}/compute", response_model=ComputeResult)
@limiter.limit("10/minute")
async def compute_dataset(
    request: Request,
    dataset_id: uuid.UUID,
    current_user: User = Depends(ds_require_editor),
    db: AsyncSession = Depends(get_db),
):
    ds_result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = ds_result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset no encontrado")
    if not dataset.is_computed:
        raise HTTPException(status_code=400, detail="Este dataset no es calculado")
    await assert_can(dataset.workspace_id, "script", db)  # feature de plan
    if not dataset.source_code or not dataset.source_code.strip():
        raise HTTPException(status_code=400, detail="El dataset no tiene código fuente")
    if not dataset.source_dataset_ids:
        raise HTTPException(status_code=400, detail="El dataset no tiene datasets fuente configurados")

    # Revalidar source datasets en cada compute (algún source pudo borrarse / permisos cambiaron)
    await _validate_source_datasets(dataset.source_dataset_ids, current_user, db, exclude_id=dataset.id)

    dataframes: dict[str, list[dict]] = {}
    for src_id_str in dataset.source_dataset_ids:
        src_id = uuid.UUID(src_id_str)
        src_ds_result = await db.execute(select(Dataset).where(Dataset.id == src_id))
        src_ds = src_ds_result.scalar_one_or_none()
        if not src_ds:
            raise HTTPException(status_code=400, detail=f"Dataset fuente {src_id_str} no encontrado")

        records_result = await db.execute(
            select(Record).where(
                Record.dataset_id == src_id,
                Record.deleted_at.is_(None),
            )
        )
        records = records_result.scalars().all()
        df_name = src_ds.name.lower().replace(" ", "_").replace("-", "_")
        df_name = "".join(c if c.isalnum() or c == "_" else "_" for c in df_name)
        dataframes[df_name] = [{"__id__": str(r.id), **r.data} for r in records]

    try:
        columns_data, records_data = run_executor(dataset.source_code, dataframes)
    except LambdaNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except LambdaInvocationError as e:
        raise HTTPException(status_code=502, detail=f"Error invocando Lambda: {e}")
    except LambdaExecutionError as e:
        detail = {"error": e.message, "traceback": e.traceback} if e.traceback else f"Error en Lambda: {e.message}"
        raise HTTPException(status_code=422, detail=detail)

    await db.execute(delete(ColumnDefinition).where(ColumnDefinition.dataset_id == dataset_id))
    await db.execute(delete(Record).where(Record.dataset_id == dataset_id))

    for i, col_def in enumerate(columns_data):
        col = ColumnDefinition(
            dataset_id=dataset_id,
            name=col_def["name"],
            field_key=col_def["field_key"],
            data_type=col_def.get("data_type", "text"),
            position=i,
        )
        db.add(col)

    for rec_data in records_data:
        rec = Record(dataset_id=dataset_id, data=rec_data)
        db.add(rec)

    dataset.last_computed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(dataset)

    return ComputeResult(
        records_created=len(records_data),
        columns_created=len(columns_data),
        last_computed_at=dataset.last_computed_at,
    )


# ── Import dataset from Excel ─────────────────────────────────────────────────

def _slugify_key(s: str) -> str:
    s = re.sub(r"[^\w\s]", "", str(s), flags=re.UNICODE)
    s = re.sub(r"\s+", "_", s.strip()).lower()
    s = re.sub(r"[^a-z0-9_]", "", s)
    return s[:40] or "col"


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$|^\d{1,2}/\d{1,2}/\d{4}$")


def _infer_col_type(values: list) -> tuple[str, list | None]:
    """Return (data_type, options_list_or_None) from a sample of cell values."""
    non_empty = [v for v in values if v is not None and str(v).strip() != ""]
    if not non_empty:
        return "text", None

    # Datetime objects (openpyxl parses date cells automatically)
    if all(isinstance(v, (datetime, date_type)) for v in non_empty):
        return "date", None

    # String dates: "YYYY-MM-DD" or "DD/MM/YYYY"
    if all(_DATE_RE.match(str(v).strip()) for v in non_empty):
        return "date", None

    # Boolean
    bool_pool = {"true", "false", "yes", "no", "sí", "si", "1", "0", "verdadero", "falso"}
    if all(str(v).lower().strip() in bool_pool for v in non_empty):
        return "boolean", None

    # Numeric detection
    def _is_num(v: object) -> bool:
        try:
            float(str(v).replace(",", ".").replace(" ", "").replace("%", ""))
            return True
        except ValueError:
            return False

    if all(_is_num(v) for v in non_empty):
        # Phone/DNI heuristic: integer-like 6-15 digit values with high uniqueness → store as text
        def _as_int_str(v: object) -> str | None:
            try:
                f = float(str(v).replace(",", ".").replace(" ", ""))
                if f == int(f) and 99_999 < abs(f) < 10**15:
                    return str(int(f))
            except (ValueError, OverflowError):
                pass
            return None

        int_strs = [_as_int_str(v) for v in non_empty]
        if all(s is not None for s in int_strs):
            avg_len = sum(len(s) for s in int_strs) / len(int_strs)  # type: ignore[arg-type]
            unique_ratio = len(set(int_strs)) / len(int_strs)
            if 6 <= avg_len <= 15 and unique_ratio > 0.6:
                return "text", None  # phone / DNI / identifier

        return "number", None

    # Enum: ≤ 10 unique values, repetitions present
    unique = list(dict.fromkeys(str(v).strip() for v in non_empty))
    if len(unique) <= 10 and len(non_empty) >= max(len(unique) * 2, 4):
        return "enum", unique

    return "text", None


def _strip_rows(rows: list[tuple]) -> list[tuple]:
    """Remove trailing all-empty rows."""
    while rows and all(v is None or str(v).strip() == "" for v in rows[-1]):
        rows.pop()
    return [r for r in rows if any(v is not None and str(v).strip() != "" for v in r)]


def _build_headers(raw_headers: list) -> tuple[list[str], list[str]]:
    """Return (display_names, field_keys) with de-duplicated slugs."""
    names = [str(h).strip() if h is not None else f"col_{i}" for i, h in enumerate(raw_headers)]
    seen: dict[str, int] = {}
    keys: list[str] = []
    for h in names:
        base = _slugify_key(h)
        count = seen.get(base, 0)
        seen[base] = count + 1
        keys.append(base if count == 0 else f"{base}_{count}")
    return names, keys


def _load_workbook_safe(content: bytes, filename: str):
    ext = (filename or "").lower().rsplit(".", 1)[-1]
    if ext not in ("xlsx", "xlsm", "xls"):
        raise HTTPException(status_code=400, detail="Formato no soportado. Use .xlsx")
    try:
        import openpyxl
        return openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="No se pudo leer el archivo Excel")


def _sheet_preview(wb, sheet_name: str) -> dict:
    """Return column metadata for a single sheet without creating DB objects."""
    ws_sheet = wb[sheet_name]
    rows = list(ws_sheet.iter_rows(values_only=True))
    if not rows:
        return {"name": sheet_name, "row_count": 0, "columns": []}

    raw_header_row = rows[0]
    data_rows = _strip_rows(list(rows[1:]))
    names, keys = _build_headers(list(raw_header_row))
    n_cols = len(names)

    def col_has_data(i: int) -> bool:
        return any(
            (row[i] if i < len(row) else None) is not None
            and str(row[i] if i < len(row) else "").strip() != ""
            for row in data_rows
        )

    columns = []
    for i, (header, fk) in enumerate(zip(names, keys)):
        if raw_header_row[i] is None or not col_has_data(i):
            continue
        sample = [row[i] if i < len(row) else None for row in data_rows]
        dtype, opts = _infer_col_type(sample)
        col_info: dict = {"header": header, "field_key": fk, "data_type": dtype}
        if opts:
            col_info["options"] = opts
        columns.append(col_info)

    return {"name": sheet_name, "row_count": len(data_rows), "columns": columns}


@router.post("/import-from-excel/preview")
@limiter.limit("20/minute")
async def preview_excel_import(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Archivo muy grande (máximo 10 MB)")
    wb = _load_workbook_safe(content, file.filename or "")
    sheets = [_sheet_preview(wb, name) for name in wb.sheetnames]
    return {"filename": file.filename or "file.xlsx", "sheets": sheets}


async def _import_sheet_into_db(
    wb,
    sheet_name: str | None,
    ds_name: str,
    workspace_id: uuid.UUID | None,
    db: AsyncSession,
) -> dict:
    """Crea un Dataset (+columnas +registros) leyendo una hoja del workbook.

    No hace commit: el llamador decide cuándo confirmar para agrupar varias hojas
    en una sola transacción. Devuelve la metadata del dataset creado.
    """
    if sheet_name and sheet_name in wb.sheetnames:
        ws_sheet = wb[sheet_name]
    else:
        ws_sheet = wb.active

    rows = list(ws_sheet.iter_rows(values_only=True))
    raw_header_row = list(rows[0]) if rows else []
    data_rows = _strip_rows(list(rows[1:])) if len(rows) >= 2 else []

    names, field_keys = _build_headers(raw_header_row)
    n_cols = len(names)

    def col_has_data(i: int) -> bool:
        if i >= len(raw_header_row) or raw_header_row[i] is None:
            return False
        return any(
            (row[i] if i < len(row) else None) is not None
            and str(row[i] if i < len(row) else "").strip() != ""
            for row in data_rows
        )

    active_indices = [i for i in range(n_cols) if col_has_data(i)]
    col_specs: dict[int, tuple[str, list | None]] = {
        i: _infer_col_type([row[i] if i < len(row) else None for row in data_rows])
        for i in active_indices
    }

    dataset = Dataset(name=ds_name, workspace_id=workspace_id)
    db.add(dataset)
    await db.flush()

    pos = 0
    for i in active_indices:
        dtype, opts = col_specs[i]
        rules: dict = {}
        if opts:
            rules["options"] = opts
        db.add(ColumnDefinition(
            dataset_id=dataset.id,
            name=names[i],
            field_key=field_keys[i],
            data_type=dtype,
            rules=rules,
            position=pos,
        ))
        pos += 1

    records_created = 0
    for row in data_rows:
        row_data: dict = {}
        for i in active_indices:
            raw = row[i] if i < len(row) else None
            if raw is None or str(raw).strip() == "":
                continue
            dtype, _ = col_specs[i]
            fk = field_keys[i]
            if isinstance(raw, (datetime, date_type)):
                row_data[fk] = raw.date().isoformat() if isinstance(raw, datetime) else raw.isoformat()
            elif dtype == "number":
                try:
                    f = float(str(raw).replace(",", ".").replace(" ", ""))
                    row_data[fk] = int(f) if f == int(f) else f
                except ValueError:
                    row_data[fk] = str(raw).strip()
            elif dtype == "boolean":
                row_data[fk] = str(raw).lower() in ("true", "yes", "sí", "si", "1", "verdadero")
            else:
                if isinstance(raw, float) and raw.is_integer():
                    row_data[fk] = str(int(raw))
                else:
                    row_data[fk] = str(raw).strip()
        db.add(Record(dataset_id=dataset.id, data=row_data))
        records_created += 1

    return {
        "sheet": ws_sheet.title,
        "dataset_id": str(dataset.id),
        "dataset_name": ds_name,
        "columns_created": len(active_indices),
        "records_created": records_created,
    }


@router.post("/import-from-excel", status_code=201)
@limiter.limit("10/minute")
async def import_dataset_from_excel(
    request: Request,
    file: UploadFile = File(...),
    workspace_id: uuid.UUID | None = Query(None),
    name: str | None = Query(None),
    sheet: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_ws_manager(current_user, workspace_id, db)

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Archivo muy grande (máximo 10 MB)")

    wb = _load_workbook_safe(content, file.filename or "")
    sheet_title = sheet if (sheet and sheet in wb.sheetnames) else wb.active.title
    ds_name = (name or "").strip() or (file.filename or "dataset").rsplit(".", 1)[0]
    result = await _import_sheet_into_db(wb, sheet_title, ds_name, workspace_id, db)
    await db.commit()
    logger.info(
        "Imported dataset '%s' (%d cols, %d rows) by user %s",
        result["dataset_name"], result["columns_created"], result["records_created"], current_user.id,
    )
    return {
        "dataset_id": result["dataset_id"],
        "dataset_name": result["dataset_name"],
        "columns_created": result["columns_created"],
        "records_created": result["records_created"],
    }


@router.post("/import-from-excel/multi", status_code=201)
@limiter.limit("5/minute")
async def import_datasets_from_excel_multi(
    request: Request,
    file: UploadFile = File(...),
    payload: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Importa varias hojas en una sola pasada, cada una como dataset propio.

    payload: JSON con {"workspace_id": "uuid|null", "sheets": [{"sheet": "...", "name": "..."}, ...]}.
    Todo se commitea junto: si falla una hoja, no se crea ninguna.
    """
    try:
        spec = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="payload no es JSON válido")

    ws_id_raw = spec.get("workspace_id")
    try:
        workspace_id = uuid.UUID(ws_id_raw) if ws_id_raw else None
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="workspace_id inválido (no es un UUID)")
    sheets_spec = spec.get("sheets") or []
    if not isinstance(sheets_spec, list) or not sheets_spec:
        raise HTTPException(status_code=400, detail="Debe enviar al menos una hoja en sheets[]")

    await _require_ws_manager(current_user, workspace_id, db)

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Archivo muy grande (máximo 10 MB)")

    wb = _load_workbook_safe(content, file.filename or "")

    imported: list[dict] = []
    for item in sheets_spec:
        sheet_name = (item.get("sheet") or "").strip()
        if not sheet_name or sheet_name not in wb.sheetnames:
            raise HTTPException(status_code=400, detail=f"Hoja '{sheet_name}' no existe en el archivo")
        ds_name = (item.get("name") or "").strip() or sheet_name
        result = await _import_sheet_into_db(wb, sheet_name, ds_name, workspace_id, db)
        imported.append(result)

    await db.commit()
    logger.info(
        "Imported %d datasets from Excel (%s) by user %s",
        len(imported), file.filename, current_user.id,
    )
    return {"imported": imported}


# ── Templates ─────────────────────────────────────────────────────────────────

@router.get("/templates/catalog")
async def list_templates(current_user: User = Depends(get_current_user)):
    """Lista de plantillas disponibles (sin sample data, solo metadatos para el selector)."""
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "description": t["description"],
            "icon": t["icon"],
            "color": t["color"],
            "columns_count": len(t["columns"]),
            "sample_rows_count": len(t["sample_rows"]),
        }
        for t in TEMPLATES
    ]


@router.post("/templates/{template_id}", response_model=DatasetOut, status_code=201)
@limiter.limit("20/minute")
async def create_from_template(
    request: Request,
    template_id: str,
    workspace_id: uuid.UUID | None = Query(None),
    name: str | None = Query(None, description="Nombre custom; por defecto usa el de la plantilla"),
    include_sample: bool = Query(True, description="Incluir filas de ejemplo"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tpl = find_template(template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail=f"Plantilla '{template_id}' no encontrada")

    await _require_ws_manager(current_user, workspace_id, db)

    ds_name = (name or "").strip() or tpl["name"]
    dataset = Dataset(name=ds_name, description=tpl["description"], workspace_id=workspace_id)
    db.add(dataset)
    await db.flush()

    for col_spec in tpl["columns"]:
        db.add(ColumnDefinition(
            dataset_id=dataset.id,
            name=col_spec["name"],
            field_key=col_spec["field_key"],
            data_type=col_spec["data_type"],
            rules=col_spec.get("rules", {}),
            position=col_spec.get("position", 0),
        ))

    if include_sample:
        for row in tpl["sample_rows"]:
            db.add(Record(dataset_id=dataset.id, data=row))

    await db.commit()
    await db.refresh(dataset)
    logger.info(
        "Created dataset '%s' from template '%s' by user %s",
        ds_name, template_id, current_user.id,
    )
    return dataset


# ── Relationship scanner ──────────────────────────────────────────────────────

_FK_PREFIXES = ("id_", "cod_", "codigo_", "ref_", "fk_")
_FK_SUFFIXES = ("_id", "_cod", "_codigo", "_ref", "_fk")


def _norm(s: str) -> str:
    """Normaliza un string para comparación insensible a acentos/case/whitespace.
    "Construcción" → "construccion", "  COMERCIO " → "comercio"."""
    s = unicodedata.normalize("NFD", s.strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def _iter_cell_values(v):
    """Itera los valores de una celda. Para relation (array), itera cada item.
    Para escalares, yields el valor. Devuelve siempre strings (luego se normalizan)."""
    if v is None:
        return
    if isinstance(v, list):
        for item in v:
            if item is None:
                continue
            yield str(item)
    else:
        yield str(v)


def _extract_target_keyword(field_key: str) -> str | None:
    """Devuelve el 'keyword' candidato (lo que quedaría después de quitar el prefijo/sufijo de FK)."""
    k = field_key.lower().strip()
    for p in _FK_PREFIXES:
        if k.startswith(p) and len(k) > len(p):
            return k[len(p):].strip("_") or None
    for s in _FK_SUFFIXES:
        if k.endswith(s) and len(k) > len(s):
            return k[:-len(s)].strip("_") or None
    return None


def _normalize_name(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _name_matches(keyword: str, dataset_name: str) -> bool:
    kw = _normalize_name(keyword)
    name = _normalize_name(dataset_name)
    if not kw or not name:
        return False
    # singular/plural lenient match
    kws = {kw, kw[:-1] if kw.endswith("s") else kw + "s"}
    names = {name, name[:-1] if name.endswith("s") else name + "s"}
    for k in kws:
        for n in names:
            if k == n or k in n or n in k:
                return True
    return False


# Tope alto para valores únicos por columna candidata (cubre tablas reales sin OOM)
_SCAN_DISTINCT_LIMIT = 50000
# Cardinalidad mínima para que una columna clave sea destino de relación. Por debajo
# de esto es un dominio enum (sexo=2, estado_civil=5, tipo_documento=3), no una llave
# de entidad — relacionarse contra un enum no es una FK útil. Distritos (~25), códigos
# (cientos) y catálogos reales quedan por encima del piso.
_MIN_KEY_CARDINALITY = 8
# Penalización para datasets que parezcan respaldos / copias / versiones antiguas —
# un humano espera vincular contra el dataset principal, no contra su backup.
_BACKUP_HINTS = ("backup", "_bak", "_old", "copy", "_copia", "draft", "_v0", "_v1", "archivo", "_archived")


def _backup_penalty(name: str) -> float:
    return -0.15 if any(h in name.lower() for h in _BACKUP_HINTS) else 0.0


@dataclass
class _ScanData:
    """Datos pre-cargados por dataset que alimentan la construcción de candidatos."""
    cols_by_ds: dict[uuid.UUID, list[ColumnDefinition]]
    ids_by_ds: dict[uuid.UUID, set[str]]
    # field_key → set de valores normalizados (para matching por contenido)
    col_values_by_ds: dict[uuid.UUID, dict[str, set[str]]]
    # columnas "tipo clave" (alta cardinalidad / casi únicas en el sample)
    key_cols_by_ds: dict[uuid.UUID, list[str]]
    # field_key → {normalized → {original → count}} para detectar variantes sucias
    variants_by_ds: dict[uuid.UUID, dict[str, dict[str, dict[str, int]]]]


async def _load_scan_data(datasets, db: AsyncSession, sample_size: int) -> _ScanData:
    """Carga columnas, muestras de valores y columnas-clave de cada dataset.

    Las columnas de TODOS los datasets se cargan en una sola query (evita N+1);
    las muestras de registros se cargan por dataset porque el `LIMIT` de muestreo
    es por tabla.
    """
    ds_ids = [ds.id for ds in datasets]
    cols_by_ds: dict[uuid.UUID, list[ColumnDefinition]] = {ds.id: [] for ds in datasets}
    cols_res = await db.execute(
        select(ColumnDefinition).where(ColumnDefinition.dataset_id.in_(ds_ids))
    )
    for col in cols_res.scalars().all():
        cols_by_ds[col.dataset_id].append(col)

    ids_by_ds: dict[uuid.UUID, set[str]] = {}
    col_values_by_ds: dict[uuid.UUID, dict[str, set[str]]] = {}
    key_cols_by_ds: dict[uuid.UUID, list[str]] = {}
    variants_by_ds: dict[uuid.UUID, dict[str, dict[str, dict[str, int]]]] = {}

    for ds in datasets:
        rec_res = await db.execute(
            select(Record.id, Record.data)
            .where(Record.dataset_id == ds.id)
            .limit(sample_size)
        )
        rec_rows = rec_res.all()

        # Por columna: lista normalizada (matching) + variantes con conteo.
        # _iter_cell_values maneja escalares y arrays (relation N:N).
        per_col_raw: dict[str, list[str]] = {c.field_key: [] for c in cols_by_ds[ds.id]}
        per_col_variants: dict[str, dict[str, dict[str, int]]] = {fk: {} for fk in per_col_raw}
        for _rec_id, data in rec_rows:
            if not isinstance(data, dict):
                continue
            for fk in per_col_raw:
                for raw in _iter_cell_values(data.get(fk)):
                    original = raw.strip()
                    if not original:
                        continue
                    n = _norm(original)
                    if not n:
                        continue
                    per_col_raw[fk].append(n)
                    group = per_col_variants[fk].setdefault(n, {})
                    group[original] = group.get(original, 0) + 1

        per_col: dict[str, set[str]] = {}
        key_cols: list[str] = []
        for fk, raw_vals in per_col_raw.items():
            uniq = set(raw_vals)
            per_col[fk] = uniq
            if len(raw_vals) >= 3 and uniq and len(uniq) / len(raw_vals) >= 0.8:
                key_cols.append(fk)

        # Carga completa de key cols vía SQL. data->>fk serializa el JSON cuando la
        # columna es un array (relation N:N): detectamos ese caso y expandimos cada item.
        for fk in key_cols:
            full_res = await db.execute(
                text(
                    "SELECT DISTINCT data->>:fk AS v "
                    "FROM records "
                    "WHERE dataset_id = :dsid AND data->>:fk IS NOT NULL "
                    "LIMIT :lim"
                ),
                {"fk": fk, "dsid": str(ds.id), "lim": _SCAN_DISTINCT_LIMIT},
            )
            full_vals: set[str] = set()
            for (v,) in full_res.all():
                if v is None:
                    continue
                items: list[str] = []
                if isinstance(v, str) and v.startswith("[") and v.endswith("]"):
                    try:
                        parsed = json.loads(v)
                        if isinstance(parsed, list):
                            items = [str(x) for x in parsed if x is not None]
                    except json.JSONDecodeError:
                        items = [v]
                else:
                    items = [str(v)]
                for raw in items:
                    original = raw.strip()
                    if not original:
                        continue
                    n = _norm(original)
                    if not n:
                        continue
                    full_vals.add(n)
                    group = per_col_variants[fk].setdefault(n, {})
                    group[original] = group.get(original, 0) + 1
            if full_vals:
                per_col[fk] = full_vals

        id_res = await db.execute(
            select(Record.id).where(Record.dataset_id == ds.id).limit(_SCAN_DISTINCT_LIMIT)
        )
        ids_by_ds[ds.id] = {str(r[0]) for r in id_res.all()}
        col_values_by_ds[ds.id] = per_col
        key_cols_by_ds[ds.id] = key_cols
        variants_by_ds[ds.id] = per_col_variants

    return _ScanData(cols_by_ds, ids_by_ds, col_values_by_ds, key_cols_by_ds, variants_by_ds)


def _build_relation_candidates(datasets, sd: _ScanData, min_content_ratio: float) -> list[dict]:
    """Cruza cada columna de cada dataset contra las columnas de los demás
    (y self-FK) y emite candidatos de relación con score nombre+contenido."""
    candidates: list[dict] = []

    def _code_like_field(tgt_obj, target_keyword: str | None) -> str | None:
        """Columna 'código/PK' del target — útil cuando hay match por nombre pero
        no por contenido (sugerimos esa columna en vez de __id__)."""
        cands = []
        for tc in sd.cols_by_ds[tgt_obj.id]:
            fk_low = tc.field_key.lower()
            score = 0
            if any(tok in fk_low for tok in ("codigo", "código", "_code", "code_", "cod_", "_cod")):
                score += 3
            if fk_low.startswith("id_") or fk_low.endswith("_id") or fk_low == "id":
                score += 2
            if target_keyword and _name_matches(fk_low, target_keyword):
                score += 2
            if tc.position == 0:  # PK natural: primera columna
                score += 1
            if score > 0 and tc.field_key in sd.key_cols_by_ds[tgt_obj.id]:
                cands.append((score, tc.field_key))
        if not cands:
            return None
        cands.sort(reverse=True)
        return cands[0][1]

    for src in datasets:
        for col in sd.cols_by_ds[src.id]:
            src_vals = sd.col_values_by_ds[src.id].get(col.field_key, set())
            if not src_vals:
                continue
            keyword = _extract_target_keyword(col.field_key)

            for tgt in datasets:
                # Self-FK permitido (ej. Operaciones.prestamo_origen → Operaciones).
                is_self = tgt.id == src.id

                name_match = bool(
                    (keyword and _name_matches(keyword, tgt.name))
                    or _name_matches(col.field_key, tgt.name)
                )

                # Self-FK sin name_match: aceptar solo si hay overlap de contenido fuerte
                # (50%+) contra otra key_col del mismo dataset (auto-referencia real).
                if is_self and not name_match:
                    self_match_max = 0.0
                    for tgt_col in sd.key_cols_by_ds[tgt.id]:
                        if tgt_col == col.field_key:
                            continue
                        tgt_vals_pre = sd.col_values_by_ds[tgt.id].get(tgt_col, set())
                        if not tgt_vals_pre:
                            continue
                        r = sum(1 for v in src_vals if v in tgt_vals_pre) / len(src_vals)
                        self_match_max = max(self_match_max, r)
                    if self_match_max < 0.5:
                        continue

                best_ratio = 0.0
                best_matched = 0
                best_field = "__id__"

                target_ids = sd.ids_by_ds[tgt.id]
                if target_ids and not is_self:
                    matched_id = sum(1 for v in src_vals if v in target_ids)
                    ratio_id = matched_id / len(src_vals)
                    if ratio_id > best_ratio:
                        best_ratio, best_matched, best_field = ratio_id, matched_id, "__id__"

                # Solo las columnas CLAVE (únicas/casi-únicas) del target cuentan como
                # destino de relación: una FK referencia un identificador único. Matchear
                # contra una columna NO-clave (sexo, estado_civil, distrito) es vocabulario
                # compartido, no una relación → se ignora. Los catálogos legítimos tienen su
                # columna de nombre casi-única, así que igual caen en key_cols y se detectan.
                for tgt_col in sd.key_cols_by_ds[tgt.id]:
                    if is_self and tgt_col == col.field_key:
                        continue
                    tgt_vals = sd.col_values_by_ds[tgt.id].get(tgt_col, set())
                    if len(tgt_vals) < _MIN_KEY_CARDINALITY:  # enum, no entidad
                        continue
                    matched = sum(1 for v in src_vals if v in tgt_vals)
                    if matched == 0:
                        continue
                    # ratio_src (FK clásica: source ⊆ target) vs ratio_min (catálogo pequeño).
                    ratio = max(matched / len(src_vals), matched / min(len(src_vals), len(tgt_vals)))
                    if ratio > best_ratio:
                        best_ratio, best_matched, best_field = ratio, matched, tgt_col

                # Nombre fuerte pero sin overlap: sugerir code-like en vez de __id__
                if name_match and best_ratio == 0.0 and best_field == "__id__":
                    fallback = _code_like_field(tgt, keyword)
                    if fallback:
                        best_field = fallback

                if not name_match and best_ratio < min_content_ratio:
                    continue

                # El CONTENIDO manda (0.85): es la evidencia real de que dos columnas
                # se relacionan. El nombre es solo un refuerzo menor (0.15) y SOLO si
                # hay respaldo de datos — en Excels los nombres de columna suelen ser
                # malos/genéricos, así que un match de puro nombre (sin overlap de
                # valores) vale casi nada y queda al fondo del ranking.
                name_only = name_match and best_ratio == 0.0
                name_bonus = 0.0
                if name_match:
                    name_bonus = 0.05 if name_only else 0.15
                score = round(
                    0.85 * best_ratio
                    + name_bonus
                    + _backup_penalty(tgt.name),
                    3,
                )
                candidates.append({
                    "from_dataset_id": str(src.id),
                    "from_dataset_name": src.name,
                    "from_column_id": str(col.id),
                    "from_column": col.field_key,
                    "from_column_label": col.name,
                    "from_column_type": col.data_type,
                    "to_dataset_id": str(tgt.id),
                    "to_dataset_name": tgt.name,
                    "to_field": best_field,
                    "name_match": name_match,
                    "name_only": name_only,
                    "content_match_ratio": round(best_ratio, 3),
                    "content_matched": best_matched,
                    "values_sampled": len(src_vals),
                    "score": score,
                    "sample_values": list(src_vals)[:3],
                })

    return candidates


def _dedupe_top_candidates(candidates: list[dict]) -> list[dict]:
    """Agrupa por (src_dataset, src_column), conserva TOP-3 por score y ordena global."""
    by_src: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for c in candidates:
        by_src[(c["from_dataset_id"], c["from_column"])].append(c)

    result: list[dict] = []
    for cs in by_src.values():
        cs.sort(key=lambda x: x["score"], reverse=True)
        result.extend(cs[:3])
    result.sort(key=lambda x: x["score"], reverse=True)
    return result


def _build_cleanup_suggestions(datasets, sd: _ScanData) -> list[dict]:
    """Una columna necesita limpieza si tiene valores que solo difieren por
    mayúsculas/tildes/espacios (ej. "Comercio" / "COMERCIO" / "comercio")."""
    suggestions: list[dict] = []

    def _example(n: str, counts: dict[str, int]) -> dict:
        canonical = max(counts.items(), key=lambda kv: kv[1])[0]
        ordered = sorted(counts.items(), key=lambda kv: -kv[1])
        return {"normalized": n, "variants": [v for v, _ in ordered], "canonical": canonical}

    for ds in datasets:
        per_col_variants = sd.variants_by_ds[ds.id]
        for fk, variants in per_col_variants.items():
            dirty_groups = {n: oc for n, oc in variants.items() if len(oc) > 1}
            if not dirty_groups:
                continue
            col_obj = next((c for c in sd.cols_by_ds[ds.id] if c.field_key == fk), None)
            if col_obj is None:
                continue
            examples = sorted(
                (_example(n, oc) for n, oc in dirty_groups.items()),
                key=lambda x: -len(x["variants"]),
            )[:5]
            suggestions.append({
                "dataset_id": str(ds.id),
                "dataset_name": ds.name,
                "column_id": str(col_obj.id),
                "column": fk,
                "column_label": col_obj.name,
                "raw_unique": sum(len(o) for o in variants.values()),
                "normalized_unique": len(variants),
                "dirty_groups": len(dirty_groups),
                "examples": examples,
            })

    suggestions.sort(key=lambda x: -x["dirty_groups"])
    return suggestions


@router.get("/relationships/scan")
@limiter.limit("10/minute")
async def scan_relationships(
    request: Request,
    workspace_id: uuid.UUID | None = Query(None),
    sample_size: int = Query(2000, ge=10, le=10000),
    min_content_ratio: float = Query(0.1, ge=0.0, le=1.0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Escanea datasets accesibles del workspace en busca de relaciones candidatas.

    Escanea TODAS las columnas (no solo las que se llaman id_*) y verifica
    matching por contenido contra:
      - `__id__` (id de fila) de cada otra tabla
      - columnas "tipo clave" (alta cardinalidad, sin repetidos) de cada otra tabla

    Si una columna tiene mucho match de contenido pero no su nombre no sugiere FK,
    igual se reporta. El score combina coincidencia por nombre + por contenido.
    """
    # Datasets accesibles (misma lógica que list_datasets)
    ws_filter = Dataset.workspace_id == workspace_id if workspace_id else True
    ds_q = select(Dataset).where(and_(accessible_datasets_filter(current_user), ws_filter))

    datasets = (await db.execute(ds_q)).scalars().all()
    if len(datasets) < 2:
        return {"scanned": len(datasets), "candidates": []}

    sd = await _load_scan_data(datasets, db, sample_size)
    candidates = _build_relation_candidates(datasets, sd, min_content_ratio)
    result = _dedupe_top_candidates(candidates)
    cleanup_suggestions = _build_cleanup_suggestions(datasets, sd)

    return {
        "scanned": len(datasets),
        "candidates": result,
        "cleanup_suggestions": cleanup_suggestions,
    }


# ── Normalización de valores ───────────────────────────────────────────────────

@router.post("/{dataset_id}/columns/{column_id}/normalize-values")
@limiter.limit("10/minute")
async def normalize_column_values(
    request: Request,
    dataset_id: uuid.UUID,
    column_id: uuid.UUID,
    current_user: User = Depends(ds_require_editor),
    db: AsyncSession = Depends(get_db),
):
    """Unifica variantes de una columna sustituyendo cada valor por la forma
    más común dentro de su grupo normalizado (lowercase + sin tildes + trim).

    Ej: "Comercio" (50), "COMERCIO" (5), "comercio" (3) → todas se vuelven "Comercio".
    """
    col_res = await db.execute(
        select(ColumnDefinition).where(
            ColumnDefinition.id == column_id,
            ColumnDefinition.dataset_id == dataset_id,
        )
    )
    col = col_res.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Columna no encontrada en el dataset")

    fk = col.field_key

    rec_res = await db.execute(
        select(Record.id, Record.data).where(Record.dataset_id == dataset_id)
    )
    rec_rows = rec_res.all()

    # Contar variantes por grupo normalizado
    variant_counts: dict[str, dict[str, int]] = {}
    for _rid, data in rec_rows:
        if not isinstance(data, dict):
            continue
        v = data.get(fk)
        if v is None:
            continue
        original = str(v).strip()
        if not original:
            continue
        n = _norm(original)
        if not n:
            continue
        variant_counts.setdefault(n, {})
        variant_counts[n][original] = variant_counts[n].get(original, 0) + 1

    # Mapa: variante_no_canonica → forma_canonica (la más frecuente del grupo)
    canonical_map: dict[str, str] = {}
    for n, counts in variant_counts.items():
        if len(counts) <= 1:
            continue
        canonical = max(counts.items(), key=lambda kv: kv[1])[0]
        for variant in counts:
            if variant != canonical:
                canonical_map[variant] = canonical

    if not canonical_map:
        return {"updated": 0, "groups_unified": 0, "canonical_map": {}}

    # Aplicar reemplazo (actualizamos por record, manteniendo el resto del JSONB)
    updated = 0
    groups_unified = sum(1 for n, c in variant_counts.items() if len(c) > 1)
    for rid, data in rec_rows:
        if not isinstance(data, dict):
            continue
        v = data.get(fk)
        if v is None:
            continue
        original = str(v).strip()
        if original in canonical_map:
            new_data = dict(data)
            new_data[fk] = canonical_map[original]
            await db.execute(
                update(Record).where(Record.id == rid).values(data=new_data)
            )
            updated += 1

    await db.commit()
    logger.info(
        "Normalized column %s.%s: %d records updated, %d groups unified",
        dataset_id, fk, updated, groups_unified,
    )
    return {
        "updated": updated,
        "groups_unified": groups_unified,
        "canonical_map": canonical_map,
    }

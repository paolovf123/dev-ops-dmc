import os
import io
import re
import json
import logging
import uuid
import boto3
from datetime import datetime, timezone, date as date_type
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_, or_, not_
from database import get_db
from models import Dataset, User, Record, ColumnDefinition, DatasetPermission, DatasetGroupPermission, UserGroupMember, WorkspaceMember
from schemas import DatasetCreate, DatasetUpdate, DatasetOut, ComputeResult, ColumnOut
from auth import get_current_user, require_admin, ds_require_editor, ds_require_viewer, effective_workspace_role, effective_role
from limiter import limiter
from templates import TEMPLATES, find_template

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

    if current_user.role == "admin":
        result = await db.execute(select(Dataset).where(ws_filter).order_by(Dataset.created_at.desc()))
        return result.scalars().all()

    # Subqueries reutilizables
    direct_perm_any = select(DatasetPermission.dataset_id).where(
        DatasetPermission.user_id == current_user.id,
    )
    direct_perm_granted = select(DatasetPermission.dataset_id).where(
        DatasetPermission.user_id == current_user.id,
        DatasetPermission.role != "none",
    )
    user_group_ids = select(UserGroupMember.group_id).where(
        UserGroupMember.user_id == current_user.id,
    )
    group_perm_any = select(DatasetGroupPermission.dataset_id).where(
        DatasetGroupPermission.group_id.in_(user_group_ids),
    )
    group_perm_granted = select(DatasetGroupPermission.dataset_id).where(
        DatasetGroupPermission.group_id.in_(user_group_ids),
        DatasetGroupPermission.role != "none",
    )
    user_workspace_ids = select(WorkspaceMember.workspace_id).where(
        WorkspaceMember.user_id == current_user.id,
    )

    has_direct       = Dataset.id.in_(direct_perm_any)
    granted_direct   = Dataset.id.in_(direct_perm_granted)
    has_group        = Dataset.id.in_(group_perm_any)
    granted_group    = Dataset.id.in_(group_perm_granted)
    in_user_ws       = Dataset.workspace_id.in_(user_workspace_ids)

    # Capa 1: permiso directo decide (gana sobre todo lo demás)
    layer_direct = granted_direct  # role != 'none'
    # Capa 2: sin permiso directo, permiso de grupo decide
    layer_group  = and_(not_(has_direct), granted_group)
    # Capa 3: sin permisos directos ni de grupo → workspace membership
    layer_ws     = and_(not_(has_direct), not_(has_group), in_user_ws)

    visible = or_(layer_direct, layer_group, layer_ws)

    result = await db.execute(
        select(Dataset).where(and_(visible, ws_filter)).order_by(Dataset.created_at.desc())
    )
    return result.scalars().all()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _require_ws_manager(user: User, workspace_id: uuid.UUID | None, db: AsyncSession):
    """Permite admin global, o owner/manager del workspace."""
    if user.role == "admin":
        return
    if not workspace_id:
        raise HTTPException(status_code=403, detail="Se requiere workspace para esta operación")
    ws_role = await effective_workspace_role(user, workspace_id, db)
    if ws_role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Requiere rol owner o manager en el workspace")


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

    lambda_arn = os.getenv("LAMBDA_EXECUTOR_ARN")
    if not lambda_arn:
        raise HTTPException(
            status_code=503,
            detail="Lambda executor no configurado. Define la variable de entorno LAMBDA_EXECUTOR_ARN.",
        )

    try:
        client = boto3.client("lambda", region_name=os.getenv("AWS_REGION", "us-east-1"))
        response = client.invoke(
            FunctionName=lambda_arn,
            InvocationType="RequestResponse",
            Payload=json.dumps({"code": dataset.source_code, "dataframes": dataframes}),
        )
        payload_bytes = response["Payload"].read()
        result = json.loads(payload_bytes)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error invocando Lambda: {str(e)}")

    if response.get("FunctionError"):
        detail = result.get("errorMessage", str(result))
        raise HTTPException(status_code=422, detail=f"Error en Lambda: {detail}")

    if result.get("error"):
        raise HTTPException(
            status_code=422,
            detail={"error": result["error"], "traceback": result.get("traceback", "")},
        )

    columns_data: list[dict] = result.get("columns", [])
    records_data: list[dict] = result.get("records", [])

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
    if not rows or len(rows) < 2:
        raise HTTPException(
            status_code=400,
            detail=f"La hoja '{ws_sheet.title}' debe tener cabeceras y al menos una fila de datos",
        )

    raw_header_row = rows[0]
    data_rows = _strip_rows(list(rows[1:]))
    if not data_rows:
        raise HTTPException(
            status_code=400,
            detail=f"La hoja '{ws_sheet.title}' no tiene filas con datos",
        )

    names, field_keys = _build_headers(list(raw_header_row))
    n_cols = len(names)

    def col_has_data(i: int) -> bool:
        if raw_header_row[i] is None:
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
    workspace_id = uuid.UUID(ws_id_raw) if ws_id_raw else None
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


@router.get("/relationships/scan")
@limiter.limit("10/minute")
async def scan_relationships(
    request: Request,
    workspace_id: uuid.UUID | None = Query(None),
    sample_size: int = Query(200, ge=10, le=1000),
    min_content_ratio: float = Query(0.3, ge=0.0, le=1.0),
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
    if current_user.role == "admin":
        ds_q = select(Dataset).where(ws_filter)
    else:
        direct_perm_any = select(DatasetPermission.dataset_id).where(
            DatasetPermission.user_id == current_user.id,
        )
        direct_perm_granted = select(DatasetPermission.dataset_id).where(
            DatasetPermission.user_id == current_user.id,
            DatasetPermission.role != "none",
        )
        user_group_ids = select(UserGroupMember.group_id).where(
            UserGroupMember.user_id == current_user.id,
        )
        group_perm_any = select(DatasetGroupPermission.dataset_id).where(
            DatasetGroupPermission.group_id.in_(user_group_ids),
        )
        group_perm_granted = select(DatasetGroupPermission.dataset_id).where(
            DatasetGroupPermission.group_id.in_(user_group_ids),
            DatasetGroupPermission.role != "none",
        )
        user_workspace_ids = select(WorkspaceMember.workspace_id).where(
            WorkspaceMember.user_id == current_user.id,
        )
        visible = or_(
            Dataset.id.in_(direct_perm_granted),
            and_(not_(Dataset.id.in_(direct_perm_any)), Dataset.id.in_(group_perm_granted)),
            and_(
                not_(Dataset.id.in_(direct_perm_any)),
                not_(Dataset.id.in_(group_perm_any)),
                Dataset.workspace_id.in_(user_workspace_ids),
            ),
        )
        ds_q = select(Dataset).where(and_(visible, ws_filter))

    datasets = (await db.execute(ds_q)).scalars().all()
    if len(datasets) < 2:
        return {"scanned": len(datasets), "candidates": []}

    # ── Pre-cargar columnas y muestras por dataset ───────────────────────────
    cols_by_ds: dict[uuid.UUID, list[ColumnDefinition]] = {}
    ids_by_ds: dict[uuid.UUID, set[str]] = {}
    col_values_by_ds: dict[uuid.UUID, dict[str, set[str]]] = {}
    # Columnas "tipo clave" por dataset: aquellas que en el sample son únicas o casi únicas
    key_cols_by_ds: dict[uuid.UUID, list[str]] = {}

    for ds in datasets:
        cols_res = await db.execute(
            select(ColumnDefinition).where(ColumnDefinition.dataset_id == ds.id)
        )
        cols_by_ds[ds.id] = list(cols_res.scalars().all())

        # Traer ids + data en una sola query
        rec_res = await db.execute(
            select(Record.id, Record.data)
            .where(Record.dataset_id == ds.id)
            .limit(sample_size)
        )
        rec_rows = rec_res.all()
        ids_by_ds[ds.id] = {str(r[0]) for r in rec_rows}

        # Construir el sample por columna leyendo Record.data en Python
        per_col_raw: dict[str, list[str]] = {fk: [] for fk in (c.field_key for c in cols_by_ds[ds.id])}
        for _rec_id, data in rec_rows:
            if not isinstance(data, dict):
                continue
            for fk in per_col_raw:
                v = data.get(fk)
                if v is None:
                    continue
                s = str(v).strip()
                if s == "":
                    continue
                per_col_raw[fk].append(s)

        per_col: dict[str, set[str]] = {}
        key_cols: list[str] = []
        for fk, raw_vals in per_col_raw.items():
            uniq = set(raw_vals)
            per_col[fk] = uniq
            # "Tipo clave" = al menos 5 valores y la unicidad ≥ 95% del sample
            if len(raw_vals) >= 5 and uniq and len(uniq) / len(raw_vals) >= 0.95:
                key_cols.append(fk)

        col_values_by_ds[ds.id] = per_col
        key_cols_by_ds[ds.id] = key_cols

    # ── Construcción de candidatos ───────────────────────────────────────────
    candidates: list[dict] = []

    for src in datasets:
        for col in cols_by_ds[src.id]:
            src_vals = col_values_by_ds[src.id].get(col.field_key, set())
            if not src_vals:
                continue
            keyword = _extract_target_keyword(col.field_key)

            for tgt in datasets:
                if tgt.id == src.id:
                    continue

                # name match: si la columna tenía keyword extraíble y matchea con el nombre
                # de la tabla destino, o si el nombre de la columna matchea con el nombre
                # de la tabla (ej. columna "cliente" → tabla "clientes")
                name_match = False
                if keyword and _name_matches(keyword, tgt.name):
                    name_match = True
                elif _name_matches(col.field_key, tgt.name):
                    name_match = True

                # Intentar matching contra __id__ y contra cada columna clave de la tabla destino
                best_ratio = 0.0
                best_matched = 0
                best_field = "__id__"

                target_ids = ids_by_ds[tgt.id]
                if target_ids:
                    matched_id = sum(1 for v in src_vals if v in target_ids)
                    ratio_id = matched_id / len(src_vals)
                    if ratio_id > best_ratio:
                        best_ratio = ratio_id
                        best_matched = matched_id
                        best_field = "__id__"

                for tgt_col in key_cols_by_ds[tgt.id]:
                    tgt_vals = col_values_by_ds[tgt.id].get(tgt_col, set())
                    if not tgt_vals:
                        continue
                    matched = sum(1 for v in src_vals if v in tgt_vals)
                    ratio = matched / len(src_vals)
                    if ratio > best_ratio:
                        best_ratio = ratio
                        best_matched = matched
                        best_field = tgt_col

                # Filtro de emisión: hay match de nombre fuerte, o el contenido coincide bien
                if not name_match and best_ratio < min_content_ratio:
                    continue
                # Si solo el nombre matchea pero no hay datos en común, exigir al menos algún signo
                if name_match and best_ratio == 0.0 and len(target_ids) > 0:
                    # nombre indica relación pero sin overlap real → score bajo, lo dejamos pasar
                    pass

                score = round(
                    0.5 * (1.0 if name_match else 0.0) + 0.5 * best_ratio,
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
                    "content_match_ratio": round(best_ratio, 3),
                    "content_matched": best_matched,
                    "values_sampled": len(src_vals),
                    "score": score,
                    "sample_values": list(src_vals)[:3],
                })

    # Quédate con el mejor candidato por (src_dataset, src_column)
    best: dict[tuple[str, str], dict] = {}
    for c in candidates:
        key = (c["from_dataset_id"], c["from_column"])
        if key not in best or c["score"] > best[key]["score"]:
            best[key] = c

    result = sorted(best.values(), key=lambda x: x["score"], reverse=True)
    return {"scanned": len(datasets), "candidates": result}

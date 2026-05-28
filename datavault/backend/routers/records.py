from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, cast, Text, func, and_, or_
from datetime import datetime, timezone
from database import get_db
from models import Dataset, ColumnDefinition, Record, ChangeHistory, User
from schemas import RecordCreate, RecordUpdate, RecordOut, BulkDeleteBody
from auth import get_current_user, require_editor, require_viewer, ds_require_editor, ds_require_viewer
from pagination import MAX_RECORDS_PER_REQUEST, DEFAULT_PAGE_SIZE
from limiter import limiter
import base64
import json
import logging
import uuid
import io

logger = logging.getLogger("datavault.records")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXCEL_MIME = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",  # algunos navegadores envían esto
}

router = APIRouter(prefix="/datasets/{dataset_id}/records", tags=["records"])


async def _get_columns(dataset_id: uuid.UUID, db: AsyncSession) -> list[ColumnDefinition]:
    result = await db.execute(
        select(ColumnDefinition).where(ColumnDefinition.dataset_id == dataset_id)
    )
    return result.scalars().all()


import re as _re

_REGEX_CACHE: dict[str, "_re.Pattern[str]"] = {}


def _compile_regex(pat: str) -> "_re.Pattern[str] | None":
    if pat in _REGEX_CACHE:
        return _REGEX_CACHE[pat]
    try:
        compiled = _re.compile(pat)
    except _re.error:
        return None
    _REGEX_CACHE[pat] = compiled
    return compiled


async def _validate(
    data: dict,
    columns: list[ColumnDefinition],
    db: AsyncSession,
    dataset_id: uuid.UUID,
    skip_required: bool = False,
    exclude_record_id: uuid.UUID | None = None,
) -> list[str]:
    errors = []
    for col in columns:
        value = data.get(col.field_key)
        rules = col.rules or {}

        if not skip_required and rules.get("required") and (value is None or value == "" or value == []):
            errors.append(f"'{col.name}' is required")
            continue

        if value is None or value == "" or value == []:
            continue

        # ── Regex (cualquier tipo de string) ─────────────────────────────────
        regex_pat = rules.get("regex")
        if regex_pat:
            compiled = _compile_regex(str(regex_pat))
            if compiled is None:
                errors.append(f"'{col.name}' tiene una regex inválida en su configuración")
            elif not compiled.search(str(value)):
                msg = rules.get("regex_message") or f"'{col.name}' no cumple el patrón requerido"
                errors.append(msg)

        # ── Único (no puede repetirse en este dataset) ──────────────────────
        if rules.get("unique"):
            # Traer ids + data para comparar en Python (evita problemas
            # de cast en JSON/JSONB que aparecen en algunos drivers)
            stmt = select(Record.id, Record.data).where(
                Record.dataset_id == dataset_id,
                Record.deleted_at.is_(None),
            )
            if exclude_record_id:
                stmt = stmt.where(Record.id != exclude_record_id)
            target = str(value).strip().lower()
            for rid, rdata in (await db.execute(stmt)).all():
                if not isinstance(rdata, dict):
                    continue
                other = rdata.get(col.field_key)
                if other is None:
                    continue
                if str(other).strip().lower() == target:
                    errors.append(
                        f"'{col.name}' ya existe con el valor '{value}' (debe ser único)"
                    )
                    break

        if col.data_type in ("number", "currency"):
            try:
                num = float(value)
            except (TypeError, ValueError):
                errors.append(f"'{col.name}' must be a number")
                continue
            if "min" in rules and num < rules["min"]:
                errors.append(f"'{col.name}' must be >= {rules['min']}")
            if "max" in rules and num > rules["max"]:
                errors.append(f"'{col.name}' must be <= {rules['max']}")

        elif col.data_type == "percent":
            try:
                num = float(value)
            except (TypeError, ValueError):
                errors.append(f"'{col.name}' must be a number")
                continue
            if num < 0 or num > 100:
                errors.append(f"'{col.name}' must be between 0 and 100")

        elif col.data_type == "rating":
            try:
                num = int(float(value))
            except (TypeError, ValueError):
                errors.append(f"'{col.name}' must be a number")
                continue
            max_rating = rules.get("max_rating", 5)
            if num < 1 or num > max_rating:
                errors.append(f"'{col.name}' must be between 1 and {max_rating}")

        elif col.data_type == "enum":
            options = rules.get("options", [])
            if options and value not in options:
                errors.append(f"'{col.name}' must be one of {options}")

        elif col.data_type == "multiselect":
            options = rules.get("options", [])
            if options:
                vals = value if isinstance(value, list) else [v.strip() for v in str(value).split(",") if v.strip()]
                invalid = [v for v in vals if v not in options]
                if invalid:
                    errors.append(f"'{col.name}' invalid options: {invalid}")

        elif col.data_type == "boolean":
            if not isinstance(value, bool) and str(value).lower() not in ("true", "false", "1", "0"):
                errors.append(f"'{col.name}' must be true or false")

        elif col.data_type == "email":
            s = str(value)
            if "@" not in s or "." not in s.split("@")[-1]:
                errors.append(f"'{col.name}' must be a valid email")

        elif col.data_type == "url":
            if not str(value).startswith(("http://", "https://")):
                errors.append(f"'{col.name}' must start with http:// or https://")

    return errors


def _encode_cursor(created_at: datetime, rec_id: uuid.UUID) -> str:
    """Codifica created_at + id como cursor opaco (URL-safe base64)."""
    payload = {"c": created_at.isoformat(), "i": str(rec_id)}
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    pad = "=" * (-len(cursor) % 4)
    payload = json.loads(base64.urlsafe_b64decode(cursor + pad))
    return datetime.fromisoformat(payload["c"]), uuid.UUID(payload["i"])


@router.get("", response_model=list[RecordOut])
async def list_records(
    dataset_id: uuid.UUID,
    response: Response,
    search: str | None = Query(None),
    include_deleted: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, le=MAX_RECORDS_PER_REQUEST),
    cursor: str | None = Query(None, description="Paginación basada en cursor (estable y rápida con muchas filas). Si se pasa, ignora skip."),
    _: User = Depends(ds_require_viewer),
    db: AsyncSession = Depends(get_db),
):
    base = select(Record).where(Record.dataset_id == dataset_id)
    if not include_deleted:
        base = base.where(Record.deleted_at.is_(None))
    if search:
        base = base.where(cast(Record.data, Text).ilike(f"%{search}%"))

    # Total count para mostrar X de Y (cuesta más; lo dejamos por compat)
    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()
    response.headers["X-Total-Count"] = str(total)

    # Modo cursor: estable bajo inserts, O(log n) en lugar de O(n) del offset
    if cursor:
        try:
            c_created, c_id = _decode_cursor(cursor)
        except Exception:
            raise HTTPException(status_code=400, detail="Cursor inválido")
        # Ordenamos DESC por (created_at, id) para tener un cursor único
        base = base.where(
            or_(
                Record.created_at < c_created,
                and_(Record.created_at == c_created, Record.id < c_id),
            )
        )
        result = await db.execute(
            base.order_by(Record.created_at.desc(), Record.id.desc()).limit(limit)
        )
    else:
        result = await db.execute(
            base.order_by(Record.created_at.desc(), Record.id.desc()).offset(skip).limit(limit)
        )

    items = result.scalars().all()

    # Si llenamos el page size, emitimos cursor para la siguiente página
    if len(items) == limit and items:
        last = items[-1]
        response.headers["X-Next-Cursor"] = _encode_cursor(last.created_at, last.id)
        response.headers["Access-Control-Expose-Headers"] = "X-Total-Count, X-Next-Cursor"
    else:
        response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"

    return items


@router.post("", response_model=RecordOut, status_code=201)
@limiter.limit("60/minute")
async def create_record(
    request: Request,
    dataset_id: uuid.UUID,
    body: RecordCreate,
    current_user: User = Depends(ds_require_editor),
    db: AsyncSession = Depends(get_db),
):
    from main import manager  # import here to avoid circular
    columns = await _get_columns(dataset_id, db)
    # `required` se exige solo cuando se envían datos (formulario / import). Un payload
    # vacío {} es la "fila en blanco" del grid (botón +), que sí se permite crear.
    errors = await _validate(body.data, columns, db, dataset_id, skip_required=not body.data)
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    record = Record(dataset_id=dataset_id, data=body.data)
    db.add(record)
    await db.flush()
    db.add(ChangeHistory(
        record_id=record.id, action="create",
        user_id=current_user.id, user_name=current_user.username,
    ))
    await db.commit()
    await db.refresh(record)
    await manager.broadcast(str(dataset_id), {
        "type": "record_create", "dataset_id": str(dataset_id), "record_id": str(record.id),
    })
    # Fire-and-forget webhooks
    from routers.webhooks import dispatch_event
    ds_res = await db.execute(select(Dataset.workspace_id).where(Dataset.id == dataset_id))
    ws_id = ds_res.scalar_one_or_none()
    await dispatch_event(db, "record.create", ws_id, dataset_id, {
        "dataset_id": str(dataset_id), "record_id": str(record.id), "data": record.data,
        "by_user_id": str(current_user.id), "by_user_name": current_user.username,
    })
    return record


@router.patch("/{record_id}", response_model=RecordOut)
@limiter.limit("120/minute")
async def update_record(
    request: Request,
    dataset_id: uuid.UUID,
    record_id: uuid.UUID,
    body: RecordUpdate,
    current_user: User = Depends(ds_require_editor),
    db: AsyncSession = Depends(get_db),
):
    from main import manager
    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.dataset_id == dataset_id, Record.deleted_at.is_(None))
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    columns = await _get_columns(dataset_id, db)
    merged = {**record.data, **body.data}
    errors = await _validate(merged, columns, db, dataset_id, exclude_record_id=record_id)
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    for key, new_val in body.data.items():
        old_val = record.data.get(key)
        if old_val != new_val:
            db.add(ChangeHistory(
                record_id=record.id, field_key=key,
                old_value=str(old_val), new_value=str(new_val), action="update",
                user_id=current_user.id, user_name=current_user.username,
            ))

    record.data = merged
    record.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(record)
    await manager.broadcast(str(dataset_id), {
        "type": "record_update", "dataset_id": str(dataset_id), "record_id": str(record_id),
    })
    from routers.webhooks import dispatch_event
    ds_res = await db.execute(select(Dataset.workspace_id).where(Dataset.id == dataset_id))
    ws_id = ds_res.scalar_one_or_none()
    await dispatch_event(db, "record.update", ws_id, dataset_id, {
        "dataset_id": str(dataset_id), "record_id": str(record_id), "data": record.data,
        "by_user_id": str(current_user.id), "by_user_name": current_user.username,
    })
    return record


@router.delete("/{record_id}", status_code=204)
async def delete_record(
    dataset_id: uuid.UUID,
    record_id: uuid.UUID,
    current_user: User = Depends(ds_require_editor),
    db: AsyncSession = Depends(get_db),
):
    from main import manager
    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.dataset_id == dataset_id, Record.deleted_at.is_(None))
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    record.deleted_at = datetime.now(timezone.utc)
    db.add(ChangeHistory(
        record_id=record.id, action="delete",
        user_id=current_user.id, user_name=current_user.username,
    ))
    await db.commit()
    from routers.webhooks import dispatch_event
    ds_res = await db.execute(select(Dataset.workspace_id).where(Dataset.id == dataset_id))
    ws_id = ds_res.scalar_one_or_none()
    await dispatch_event(db, "record.delete", ws_id, dataset_id, {
        "dataset_id": str(dataset_id), "record_id": str(record_id),
        "by_user_id": str(current_user.id), "by_user_name": current_user.username,
    })
    await manager.broadcast(str(dataset_id), {
        "type": "record_delete", "dataset_id": str(dataset_id), "record_id": str(record_id),
    })


@router.get("/{record_id}/history")
async def get_record_history(
    dataset_id: uuid.UUID,
    record_id: uuid.UUID,
    _: User = Depends(ds_require_viewer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChangeHistory)
        .where(ChangeHistory.record_id == record_id)
        .order_by(ChangeHistory.changed_at.desc())
    )
    history = result.scalars().all()
    return [
        {
            "id": str(h.id), "field_key": h.field_key,
            "old_value": h.old_value, "new_value": h.new_value,
            "action": h.action, "changed_at": h.changed_at.isoformat(),
            "user_name": h.user_name,
        }
        for h in history
    ]


@router.post("/bulk-delete")
@limiter.limit("20/minute")
async def bulk_delete(
    request: Request,
    dataset_id: uuid.UUID,
    body: BulkDeleteBody,
    current_user: User = Depends(ds_require_editor),
    db: AsyncSession = Depends(get_db),
):
    from main import manager

    parsed_ids: list[uuid.UUID] = []
    invalid_ids: list[str] = []
    for raw in body.ids:
        try:
            parsed_ids.append(uuid.UUID(str(raw)))
        except (ValueError, AttributeError):
            invalid_ids.append(str(raw))

    if not parsed_ids:
        raise HTTPException(status_code=400, detail={"message": "Ningún ID válido", "invalid": invalid_ids})

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Record).where(
            Record.id.in_(parsed_ids),
            Record.dataset_id == dataset_id,
            Record.deleted_at.is_(None),
        )
    )
    records = result.scalars().all()
    found_ids = {r.id for r in records}
    for record in records:
        record.deleted_at = now
        db.add(ChangeHistory(
            record_id=record.id, action="delete",
            user_id=current_user.id, user_name=current_user.username,
        ))

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error("bulk_delete commit failed for dataset %s: %s", dataset_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error al eliminar registros")

    not_found = [str(i) for i in parsed_ids if i not in found_ids]
    await manager.broadcast(str(dataset_id), {"type": "record_delete", "dataset_id": str(dataset_id)})
    return {
        "deleted": len(records),
        "not_found": not_found,
        "invalid": invalid_ids,
    }


@router.post("/{record_id}/restore", response_model=RecordOut)
async def restore_record(
    dataset_id: uuid.UUID,
    record_id: uuid.UUID,
    _: User = Depends(ds_require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.dataset_id == dataset_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    record.deleted_at = None
    await db.commit()
    await db.refresh(record)
    return record


@router.post("/import-excel", status_code=201)
@limiter.limit("10/minute")
async def import_excel(
    request: Request,
    dataset_id: uuid.UUID,
    file: UploadFile = File(...),
    dedupe_on: str | None = Query(
        None,
        description=(
            "Lista comma-separated de field_keys a usar como clave de duplicación. "
            "Las filas cuya combinación de valores ya exista en el dataset (o "
            "previamente dentro del mismo import) se omitirán silenciosamente."
        ),
    ),
    _: User = Depends(ds_require_editor),
    db: AsyncSession = Depends(get_db),
):
    import openpyxl

    # ── Validate file metadata before reading ─────────────────────────────────
    if file.content_type and file.content_type not in ALLOWED_EXCEL_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de archivo no soportado: {file.content_type}. Se espera .xlsx",
        )
    if file.filename and not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="El archivo debe tener extensión .xlsx")

    # ── Stream-bounded read so a giant upload never fills memory ──────────────
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"Archivo demasiado grande (límite {MAX_UPLOAD_BYTES // (1024*1024)} MB)")
        chunks.append(chunk)
    content = b"".join(chunks)

    columns = await _get_columns(dataset_id, db)
    field_map = {col.name.lower(): col.field_key for col in columns}
    col_by_key = {col.field_key: col for col in columns}

    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as e:
        logger.warning("Excel parse failed for dataset %s: %s", dataset_id, e)
        raise HTTPException(status_code=400, detail="Archivo Excel inválido o corrupto")
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    headers = [str(h).lower().strip() if h else "" for h in rows[0]]
    errors: list[dict] = []
    new_records: list[Record] = []

    # ── Dedupe setup ──────────────────────────────────────────────────────────
    dedupe_keys: list[str] = [k.strip() for k in (dedupe_on or "").split(",") if k.strip()]
    seen_keys: set[tuple] = set()
    skipped_duplicates = 0
    if dedupe_keys:
        # Validar que las columnas existen
        valid_keys = {col.field_key for col in columns}
        invalid = [k for k in dedupe_keys if k not in valid_keys]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"dedupe_on contiene columnas inexistentes: {invalid}",
            )
        # Cargar registros existentes y poblar el set inicial
        existing_res = await db.execute(
            select(Record.data).where(
                Record.dataset_id == dataset_id,
                Record.deleted_at.is_(None),
            )
        )
        for (rdata,) in existing_res.all():
            if not isinstance(rdata, dict):
                continue
            key = tuple(str(rdata.get(k, "")).strip().lower() for k in dedupe_keys)
            seen_keys.add(key)

    def _row_key(d: dict) -> tuple:
        return tuple(str(d.get(k, "")).strip().lower() for k in dedupe_keys)

    for i, row in enumerate(rows[1:], start=2):
        data = {}
        for j, cell in enumerate(row):
            if j >= len(headers) or headers[j] not in field_map:
                continue
            field_key = field_map[headers[j]]
            col = col_by_key.get(field_key)
            if col and col.data_type == "text" and cell is not None:
                if isinstance(cell, float) and cell.is_integer():
                    cell = str(int(cell))
                else:
                    cell = str(cell)
            data[field_key] = cell

        # Dedupe check (silencioso, antes de validar para que no se cuente como error)
        if dedupe_keys:
            key = _row_key(data)
            if key in seen_keys:
                skipped_duplicates += 1
                continue
            seen_keys.add(key)

        row_errors = await _validate(data, columns, db, dataset_id)
        if row_errors:
            errors.append({"row": i, "errors": row_errors})
            continue

        new_records.append(Record(dataset_id=dataset_id, data=data))

    # ── Atomic: import all-or-nothing if any row had validation errors ────────
    if errors:
        return {"created": 0, "skipped_duplicates": skipped_duplicates, "errors": errors}

    for record in new_records:
        db.add(record)
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error("import_excel commit failed for dataset %s: %s", dataset_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error al insertar registros importados")

    return {"created": len(new_records), "skipped_duplicates": skipped_duplicates, "errors": []}

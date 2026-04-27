from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, cast, Text, func
from datetime import datetime, timezone
from database import get_db
from models import Dataset, ColumnDefinition, Record, ChangeHistory, User
from schemas import RecordCreate, RecordUpdate, RecordOut
from auth import get_current_user, require_editor, require_viewer, ds_require_editor, ds_require_viewer
import uuid
import io

router = APIRouter(prefix="/datasets/{dataset_id}/records", tags=["records"])


async def _get_columns(dataset_id: uuid.UUID, db: AsyncSession) -> list[ColumnDefinition]:
    result = await db.execute(
        select(ColumnDefinition).where(ColumnDefinition.dataset_id == dataset_id)
    )
    return result.scalars().all()


def _validate(data: dict, columns: list[ColumnDefinition], skip_required: bool = False) -> list[str]:
    errors = []
    for col in columns:
        value = data.get(col.field_key)
        rules = col.rules or {}

        if not skip_required and rules.get("required") and (value is None or value == ""):
            errors.append(f"'{col.name}' is required")
            continue

        if value is None or value == "":
            continue

        if col.data_type == "number":
            try:
                num = float(value)
            except (TypeError, ValueError):
                errors.append(f"'{col.name}' must be a number")
                continue
            if "min" in rules and num < rules["min"]:
                errors.append(f"'{col.name}' must be >= {rules['min']}")
            if "max" in rules and num > rules["max"]:
                errors.append(f"'{col.name}' must be <= {rules['max']}")

        if col.data_type == "enum":
            options = rules.get("options", [])
            if value not in options:
                errors.append(f"'{col.name}' must be one of {options}")

        if col.data_type == "boolean":
            if not isinstance(value, bool) and str(value).lower() not in ("true", "false", "1", "0"):
                errors.append(f"'{col.name}' must be true or false")

    return errors


@router.get("", response_model=list[RecordOut])
async def list_records(
    dataset_id: uuid.UUID,
    response: Response,
    search: str | None = Query(None),
    include_deleted: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    _: User = Depends(ds_require_viewer),
    db: AsyncSession = Depends(get_db),
):
    base = select(Record).where(Record.dataset_id == dataset_id)
    if not include_deleted:
        base = base.where(Record.deleted_at.is_(None))
    if search:
        base = base.where(cast(Record.data, Text).ilike(f"%{search}%"))

    # Total count for pagination
    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"

    result = await db.execute(base.offset(skip).limit(limit).order_by(Record.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=RecordOut, status_code=201)
async def create_record(
    dataset_id: uuid.UUID,
    body: RecordCreate,
    current_user: User = Depends(ds_require_editor),
    db: AsyncSession = Depends(get_db),
):
    from main import manager  # import here to avoid circular
    columns = await _get_columns(dataset_id, db)
    errors = _validate(body.data, columns, skip_required=True)
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
    return record


@router.patch("/{record_id}", response_model=RecordOut)
async def update_record(
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
    errors = _validate(merged, columns)
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


@router.post("/bulk-delete", status_code=204)
async def bulk_delete(
    dataset_id: uuid.UUID,
    body: dict,
    current_user: User = Depends(ds_require_editor),
    db: AsyncSession = Depends(get_db),
):
    from main import manager
    ids = body.get("ids", [])
    for rid in ids:
        try:
            result = await db.execute(
                select(Record).where(
                    Record.id == uuid.UUID(str(rid)),
                    Record.dataset_id == dataset_id,
                    Record.deleted_at.is_(None),
                )
            )
            record = result.scalar_one_or_none()
            if record:
                record.deleted_at = datetime.now(timezone.utc)
                db.add(ChangeHistory(
                    record_id=record.id, action="delete",
                    user_id=current_user.id, user_name=current_user.username,
                ))
        except Exception:
            pass
    await db.commit()
    await manager.broadcast(str(dataset_id), {"type": "record_delete", "dataset_id": str(dataset_id)})


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
async def import_excel(
    dataset_id: uuid.UUID,
    file: UploadFile = File(...),
    _: User = Depends(ds_require_editor),
    db: AsyncSession = Depends(get_db),
):
    import openpyxl
    columns = await _get_columns(dataset_id, db)
    field_map = {col.name.lower(): col.field_key for col in columns}

    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="Empty file")

    headers = [str(h).lower().strip() if h else "" for h in rows[0]]
    created = 0
    errors = []
    col_by_key = {col.field_key: col for col in columns}

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

        row_errors = _validate(data, columns)
        if row_errors:
            errors.append({"row": i, "errors": row_errors})
            continue

        record = Record(dataset_id=dataset_id, data=data)
        db.add(record)
        created += 1

    if created:
        await db.commit()

    return {"created": created, "errors": errors}

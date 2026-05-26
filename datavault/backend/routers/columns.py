from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from database import get_db
from models import Dataset, ColumnDefinition, Record, User
from schemas import ColumnCreate, ColumnUpdate, ColumnOut
from auth import require_admin, ds_require_viewer
from pagination import MAX_COLUMNS_PER_DATASET, DEFAULT_PAGE_SIZE
import json
import uuid

router = APIRouter(prefix="/datasets/{dataset_id}/columns", tags=["columns"])


async def _get_dataset(dataset_id: uuid.UUID, db: AsyncSession):
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.get("", response_model=list[ColumnOut])
async def list_columns(
    dataset_id: uuid.UUID,
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, le=MAX_COLUMNS_PER_DATASET),
    _: User = Depends(ds_require_viewer),
    db: AsyncSession = Depends(get_db),
):
    await _get_dataset(dataset_id, db)
    from sqlalchemy import func as sqlfunc
    total_result = await db.execute(
        select(sqlfunc.count()).where(ColumnDefinition.dataset_id == dataset_id)
    )
    total = total_result.scalar_one()
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"

    result = await db.execute(
        select(ColumnDefinition)
        .where(ColumnDefinition.dataset_id == dataset_id)
        .order_by(ColumnDefinition.position)
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.post("", response_model=ColumnOut, status_code=201)
async def create_column(
    dataset_id: uuid.UUID,
    body: ColumnCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await _get_dataset(dataset_id, db)
    col = ColumnDefinition(dataset_id=dataset_id, **body.model_dump())
    db.add(col)
    await db.commit()
    await db.refresh(col)
    return col


@router.patch("/{column_id}", response_model=ColumnOut)
async def update_column(
    dataset_id: uuid.UUID,
    column_id: uuid.UUID,
    body: ColumnUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ColumnDefinition).where(
            ColumnDefinition.id == column_id,
            ColumnDefinition.dataset_id == dataset_id,
        )
    )
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")

    previous_type = col.data_type
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(col, field, value)

    # Si la columna pasa a data_type=relation (modelo N:N unificado),
    # migramos los valores escalares existentes a arrays de 1 elemento.
    became_relation = (
        previous_type != "relation"
        and col.data_type == "relation"
    )
    if became_relation:
        rec_res = await db.execute(
            select(Record.id, Record.data).where(Record.dataset_id == dataset_id)
        )
        fk = col.field_key
        migrated = 0
        for rid, data in rec_res.all():
            if not isinstance(data, dict):
                continue
            v = data.get(fk)
            if v is None or isinstance(v, list):
                continue
            s = str(v).strip()
            new_data = dict(data)
            new_data[fk] = [s] if s else []
            await db.execute(
                text("UPDATE records SET data = :data WHERE id = :id"),
                {"data": json.dumps(new_data), "id": str(rid)},
            )
            migrated += 1
        if migrated:
            # Comentario informativo en el log; no rompe el flujo.
            pass

    await db.commit()
    await db.refresh(col)
    return col


@router.delete("/{column_id}", status_code=204)
async def delete_column(
    dataset_id: uuid.UUID,
    column_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ColumnDefinition).where(
            ColumnDefinition.id == column_id,
            ColumnDefinition.dataset_id == dataset_id,
        )
    )
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    await db.delete(col)
    await db.commit()

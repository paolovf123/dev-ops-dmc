from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Dataset, User
from schemas import DatasetCreate, DatasetUpdate, DatasetOut
from auth import get_current_user, require_admin, require_viewer
import uuid

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("", response_model=list[DatasetOut])
async def list_datasets(
    _: User = Depends(require_viewer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Dataset).order_by(Dataset.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=DatasetOut, status_code=201)
async def create_dataset(
    body: DatasetCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    dataset = Dataset(**body.model_dump())
    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)
    return dataset


@router.patch("/{dataset_id}", response_model=DatasetOut)
async def update_dataset(
    dataset_id: uuid.UUID,
    body: DatasetUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(dataset, field, value)
    await db.commit()
    await db.refresh(dataset)
    return dataset


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(
    dataset_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    await db.delete(dataset)
    await db.commit()

from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import DatasetPermission, User, Dataset
from auth import get_current_user, require_admin, effective_role
from pydantic import BaseModel

router = APIRouter(prefix="/datasets/{dataset_id}/permissions", tags=["permissions"])

VALID_ROLES = {"admin", "editor", "viewer", "none"}


class PermissionBody(BaseModel):
    user_id: uuid.UUID
    role: str


class PermissionOut(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    user_email: str | None = None
    user_name: str | None = None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[PermissionOut])
async def list_permissions(
    dataset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Only admin or dataset admin can view permissions
    role = await effective_role(current_user, dataset_id, db)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Solo admins pueden ver permisos")

    result = await db.execute(
        select(DatasetPermission, User)
        .join(User, DatasetPermission.user_id == User.id)
        .where(DatasetPermission.dataset_id == dataset_id)
    )
    rows = result.all()
    return [
        PermissionOut(
            id=perm.id,
            dataset_id=perm.dataset_id,
            user_id=perm.user_id,
            role=perm.role,
            user_email=user.email,
            user_name=user.username,
        )
        for perm, user in rows
    ]


@router.put("", response_model=PermissionOut)
async def set_permission(
    dataset_id: uuid.UUID,
    body: PermissionBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await effective_role(current_user, dataset_id, db)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Solo admins pueden cambiar permisos")
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Rol inválido. Opciones: {', '.join(VALID_ROLES)}")

    # Verify dataset and target user exist
    ds = await db.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset no encontrado")
    target = await db.get(User, body.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    result = await db.execute(
        select(DatasetPermission).where(
            DatasetPermission.dataset_id == dataset_id,
            DatasetPermission.user_id == body.user_id,
        )
    )
    perm = result.scalar_one_or_none()

    if perm:
        perm.role = body.role
    else:
        perm = DatasetPermission(dataset_id=dataset_id, user_id=body.user_id, role=body.role)
        db.add(perm)

    await db.commit()
    await db.refresh(perm)
    return PermissionOut(
        id=perm.id, dataset_id=perm.dataset_id, user_id=perm.user_id,
        role=perm.role, user_email=target.email, user_name=target.username,
    )


@router.delete("/{user_id}", status_code=204)
async def remove_permission(
    dataset_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await effective_role(current_user, dataset_id, db)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Solo admins pueden cambiar permisos")

    result = await db.execute(
        select(DatasetPermission).where(
            DatasetPermission.dataset_id == dataset_id,
            DatasetPermission.user_id == user_id,
        )
    )
    perm = result.scalar_one_or_none()
    if perm:
        await db.delete(perm)
        await db.commit()

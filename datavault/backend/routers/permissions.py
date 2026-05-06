from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import DatasetPermission, DatasetGroupPermission, User, Dataset, UserGroup
from auth import get_current_user, effective_role
from pydantic import BaseModel
from schemas import GroupPermissionBody, GroupPermissionOut

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


async def _require_dataset_admin(dataset_id: uuid.UUID, current_user: User, db: AsyncSession):
    role = await effective_role(current_user, dataset_id, db)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Solo admins pueden gestionar permisos")


# ── User permissions ──────────────────────────────────────────────────────────

@router.get("", response_model=list[PermissionOut])
async def list_permissions(
    dataset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_dataset_admin(dataset_id, current_user, db)
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
    await _require_dataset_admin(dataset_id, current_user, db)
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Rol inválido. Opciones: {', '.join(VALID_ROLES)}")

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
    await _require_dataset_admin(dataset_id, current_user, db)
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


# ── Group permissions ─────────────────────────────────────────────────────────

@router.get("/groups", response_model=list[GroupPermissionOut])
async def list_group_permissions(
    dataset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_dataset_admin(dataset_id, current_user, db)
    result = await db.execute(
        select(DatasetGroupPermission, UserGroup)
        .join(UserGroup, DatasetGroupPermission.group_id == UserGroup.id)
        .where(DatasetGroupPermission.dataset_id == dataset_id)
    )
    rows = result.all()
    return [
        GroupPermissionOut(
            id=perm.id,
            dataset_id=perm.dataset_id,
            group_id=perm.group_id,
            role=perm.role,
            group_name=group.name,
        )
        for perm, group in rows
    ]


@router.put("/groups", response_model=GroupPermissionOut)
async def set_group_permission(
    dataset_id: uuid.UUID,
    body: GroupPermissionBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_dataset_admin(dataset_id, current_user, db)
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Rol inválido. Opciones: {', '.join(VALID_ROLES)}")

    ds = await db.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset no encontrado")
    group = await db.get(UserGroup, body.group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    result = await db.execute(
        select(DatasetGroupPermission).where(
            DatasetGroupPermission.dataset_id == dataset_id,
            DatasetGroupPermission.group_id == body.group_id,
        )
    )
    perm = result.scalar_one_or_none()
    if perm:
        perm.role = body.role
    else:
        perm = DatasetGroupPermission(dataset_id=dataset_id, group_id=body.group_id, role=body.role)
        db.add(perm)

    await db.commit()
    await db.refresh(perm)
    return GroupPermissionOut(
        id=perm.id, dataset_id=perm.dataset_id, group_id=perm.group_id,
        role=perm.role, group_name=group.name,
    )


@router.delete("/groups/{group_id}", status_code=204)
async def remove_group_permission(
    dataset_id: uuid.UUID,
    group_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_dataset_admin(dataset_id, current_user, db)
    result = await db.execute(
        select(DatasetGroupPermission).where(
            DatasetGroupPermission.dataset_id == dataset_id,
            DatasetGroupPermission.group_id == group_id,
        )
    )
    perm = result.scalar_one_or_none()
    if perm:
        await db.delete(perm)
        await db.commit()

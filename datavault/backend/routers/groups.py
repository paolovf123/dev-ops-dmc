from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from models import UserGroup, UserGroupMember, User
from schemas import GroupCreate, GroupUpdate, GroupOut, GroupMemberOut, AddMemberBody
from auth import require_admin, get_current_user

router = APIRouter(prefix="/groups", tags=["groups"])


# ── Groups CRUD ───────────────────────────────────────────────────────────────

@router.get("", response_model=list[GroupOut])
async def list_groups(
    workspace_id: uuid.UUID | None = None,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(UserGroup).order_by(UserGroup.name)
    if workspace_id is not None:
        q = q.where(UserGroup.workspace_id == workspace_id)
    result = await db.execute(q)
    groups = result.scalars().all()

    # Count members per group
    counts_result = await db.execute(
        select(UserGroupMember.group_id, func.count().label("cnt"))
        .group_by(UserGroupMember.group_id)
    )
    counts = {row.group_id: row.cnt for row in counts_result}

    out = []
    for g in groups:
        out.append(GroupOut(
            id=g.id,
            name=g.name,
            description=g.description,
            workspace_id=g.workspace_id,
            created_at=g.created_at,
            member_count=counts.get(g.id, 0),
        ))
    return out


@router.post("", response_model=GroupOut, status_code=201)
async def create_group(
    body: GroupCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(UserGroup).where(
            UserGroup.name == body.name,
            UserGroup.workspace_id == body.workspace_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe un grupo con ese nombre en este workspace")
    group = UserGroup(name=body.name, description=body.description, workspace_id=body.workspace_id)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return GroupOut(id=group.id, name=group.name, description=group.description,
                    created_at=group.created_at, member_count=0)


@router.patch("/{group_id}", response_model=GroupOut)
async def update_group(
    group_id: uuid.UUID,
    body: GroupUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    group = await db.get(UserGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    if body.name is not None:
        group.name = body.name
    if body.description is not None:
        group.description = body.description
    await db.commit()
    await db.refresh(group)

    count_result = await db.execute(
        select(func.count()).select_from(UserGroupMember).where(UserGroupMember.group_id == group_id)
    )
    count = count_result.scalar_one()
    return GroupOut(id=group.id, name=group.name, description=group.description,
                    created_at=group.created_at, member_count=count)


@router.delete("/{group_id}", status_code=204)
async def delete_group(
    group_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    group = await db.get(UserGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    await db.delete(group)
    await db.commit()


# ── Membership ────────────────────────────────────────────────────────────────

@router.get("/{group_id}/members", response_model=list[GroupMemberOut])
async def list_members(
    group_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    group = await db.get(UserGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    result = await db.execute(
        select(User)
        .join(UserGroupMember, User.id == UserGroupMember.user_id)
        .where(UserGroupMember.group_id == group_id)
        .order_by(User.username)
    )
    users = result.scalars().all()
    return [GroupMemberOut(user_id=u.id, email=u.email, username=u.username, role=u.role) for u in users]


@router.post("/{group_id}/members", status_code=204)
async def add_member(
    group_id: uuid.UUID,
    body: AddMemberBody,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    group = await db.get(UserGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    user = await db.get(User, body.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    existing = await db.execute(
        select(UserGroupMember).where(
            UserGroupMember.group_id == group_id,
            UserGroupMember.user_id == body.user_id,
        )
    )
    if existing.scalar_one_or_none():
        return  # Already a member — idempotent

    db.add(UserGroupMember(group_id=group_id, user_id=body.user_id))
    await db.commit()


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserGroupMember).where(
            UserGroupMember.group_id == group_id,
            UserGroupMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member:
        await db.delete(member)
        await db.commit()

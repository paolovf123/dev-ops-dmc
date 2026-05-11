from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from models import UserGroup, UserGroupMember, User
from schemas import GroupCreate, GroupUpdate, GroupOut, GroupMemberOut, AddMemberBody
from auth import require_admin, get_current_user, effective_workspace_role

router = APIRouter(prefix="/groups", tags=["groups"])


async def _can_manage_group(user: User, group: UserGroup, db: AsyncSession) -> bool:
    """True si el usuario puede gestionar este grupo.

    Condiciones: admin global, O owner/admin_ws del workspace al que pertenece el grupo.
    """
    if user.role == "admin":
        return True
    if group.workspace_id is None:
        return False
    ws_role = await effective_workspace_role(user, group.workspace_id, db)
    return ws_role in ("owner", "admin_ws")


async def _get_group_or_404(group_id: uuid.UUID, db: AsyncSession) -> UserGroup:
    group = await db.get(UserGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    return group


# ── Groups CRUD ───────────────────────────────────────────────────────────────

@router.get("", response_model=list[GroupOut])
async def list_groups(
    workspace_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista grupos. Admin global ve todos; owner/admin_ws solo ven los de su workspace."""
    if current_user.role == "admin":
        q = select(UserGroup).order_by(UserGroup.name)
        if workspace_id is not None:
            q = q.where(UserGroup.workspace_id == workspace_id)
    else:
        # Obtener workspaces donde el usuario es owner o admin_ws
        ws_result = await db.execute(
            select(UserGroup.workspace_id.distinct())
            .where(UserGroup.workspace_id.isnot(None))
        )
        all_ws_ids = [r[0] for r in ws_result]
        allowed_ws_ids = []
        for wsid in all_ws_ids:
            role = await effective_workspace_role(current_user, wsid, db)
            if role in ("owner", "admin_ws"):
                allowed_ws_ids.append(wsid)

        if not allowed_ws_ids:
            raise HTTPException(status_code=403, detail="Sin acceso a grupos")

        q = select(UserGroup).where(UserGroup.workspace_id.in_(allowed_ws_ids)).order_by(UserGroup.name)
        if workspace_id is not None:
            q = q.where(UserGroup.workspace_id == workspace_id)

    result = await db.execute(q)
    groups = result.scalars().all()

    counts_result = await db.execute(
        select(UserGroupMember.group_id, func.count().label("cnt"))
        .group_by(UserGroupMember.group_id)
    )
    counts = {row.group_id: row.cnt for row in counts_result}

    return [
        GroupOut(
            id=g.id, name=g.name, description=g.description,
            workspace_id=g.workspace_id, created_at=g.created_at,
            member_count=counts.get(g.id, 0),
        )
        for g in groups
    ]


@router.post("", response_model=GroupOut, status_code=201)
async def create_group(
    body: GroupCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Admin global puede crear en cualquier workspace; owner/admin_ws solo en el suyo
    if current_user.role != "admin":
        if body.workspace_id is None:
            raise HTTPException(status_code=403, detail="Debes especificar el workspace del grupo")
        ws_role = await effective_workspace_role(current_user, body.workspace_id, db)
        if ws_role not in ("owner", "admin_ws"):
            raise HTTPException(status_code=403, detail="Solo owner o admin_ws pueden crear grupos en este workspace")

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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await _get_group_or_404(group_id, db)
    if not await _can_manage_group(current_user, group, db):
        raise HTTPException(status_code=403, detail="Sin permisos para editar este grupo")

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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await _get_group_or_404(group_id, db)
    if not await _can_manage_group(current_user, group, db):
        raise HTTPException(status_code=403, detail="Sin permisos para eliminar este grupo")
    await db.delete(group)
    await db.commit()


# ── Membership ────────────────────────────────────────────────────────────────

@router.get("/{group_id}/members", response_model=list[GroupMemberOut])
async def list_members(
    group_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await _get_group_or_404(group_id, db)
    if not await _can_manage_group(current_user, group, db):
        raise HTTPException(status_code=403, detail="Sin permisos para ver miembros de este grupo")

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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await _get_group_or_404(group_id, db)
    if not await _can_manage_group(current_user, group, db):
        raise HTTPException(status_code=403, detail="Sin permisos para agregar miembros a este grupo")

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
        return  # Ya es miembro — idempotente

    db.add(UserGroupMember(group_id=group_id, user_id=body.user_id))
    await db.commit()


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await _get_group_or_404(group_id, db)
    if not await _can_manage_group(current_user, group, db):
        raise HTTPException(status_code=403, detail="Sin permisos para quitar miembros de este grupo")

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

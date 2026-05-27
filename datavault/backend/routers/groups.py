import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from database import get_db
from models import UserGroup, UserGroupMember, User, Dataset, DatasetGroupPermission, WorkspaceMember
from schemas import GroupCreate, GroupUpdate, GroupOut, GroupMemberOut, AddMemberBody
from auth import require_admin, get_current_user, effective_workspace_role

logger = logging.getLogger("datavault.groups")
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
        # Workspaces donde el usuario es owner/admin_ws — una sola query
        # (antes: una query de rol por cada workspace con grupos → N+1).
        mem_result = await db.execute(
            select(WorkspaceMember.workspace_id).where(
                WorkspaceMember.user_id == current_user.id,
                WorkspaceMember.role.in_(("owner", "admin_ws")),
            )
        )
        allowed_ws_ids = [r[0] for r in mem_result]

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
    logger.info("group_member_added group=%s user=%s by=%s", group_id, body.user_id, current_user.id)


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
        logger.info("group_member_removed group=%s user=%s by=%s", group_id, user_id, current_user.id)


# ── Matriz invertida: datasets accesibles por grupo ────────────────────────────

class GroupDatasetAccessOut(BaseModel):
    dataset_id: uuid.UUID
    dataset_name: str
    workspace_id: uuid.UUID | None
    workspace_name: str | None
    role: str  # "admin" | "editor" | "viewer" | "none"
    is_bridge: bool = False


@router.get("/{group_id}/dataset-access", response_model=list[GroupDatasetAccessOut])
async def list_group_dataset_access(
    group_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista todos los datasets a los que este grupo tiene permiso explícito.
    Incluye el rol concreto (admin/editor/viewer/none) y el workspace al que pertenece cada dataset.
    Admin global ve todo. Miembros del grupo (o admins de su workspace) pueden verla."""
    group = await _get_group_or_404(group_id, db)
    # Permisos para ver: admin global, miembros del grupo, owners/admins del workspace del grupo
    if current_user.role != "admin":
        is_member = await db.execute(
            select(UserGroupMember).where(
                UserGroupMember.group_id == group_id,
                UserGroupMember.user_id == current_user.id,
            )
        )
        ok = is_member.scalar_one_or_none() is not None
        if not ok and group.workspace_id:
            ws_role = await effective_workspace_role(current_user, group.workspace_id, db)
            ok = ws_role in ("owner", "admin_ws")
        if not ok:
            raise HTTPException(status_code=403, detail="Sin acceso a este grupo")

    # Join: dataset_group_permissions + datasets
    rows = await db.execute(
        select(DatasetGroupPermission, Dataset)
        .join(Dataset, DatasetGroupPermission.dataset_id == Dataset.id)
        .where(DatasetGroupPermission.group_id == group_id)
        .order_by(Dataset.name)
    )
    pairs = rows.all()
    # Lookup workspaces para nombres
    from models import Workspace
    ws_ids = {d.workspace_id for _, d in pairs if d.workspace_id}
    ws_map = {}
    if ws_ids:
        ws_rows = await db.execute(select(Workspace).where(Workspace.id.in_(ws_ids)))
        ws_map = {w.id: w.name for w in ws_rows.scalars().all()}

    out: list[GroupDatasetAccessOut] = []
    for perm, ds in pairs:
        out.append(GroupDatasetAccessOut(
            dataset_id=ds.id,
            dataset_name=ds.name,
            workspace_id=ds.workspace_id,
            workspace_name=ws_map.get(ds.workspace_id) if ds.workspace_id else None,
            role=perm.role,
            is_bridge=ds.is_bridge,
        ))
    return out

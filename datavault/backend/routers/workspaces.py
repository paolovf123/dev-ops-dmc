import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import (
    Workspace, WorkspaceMember, User, Dataset, UserGroup,
    DatasetPermission, DatasetGroupPermission, UserGroupMember,
)
from auth import (
    get_current_user, require_admin, effective_workspace_role, ws_require_owner,
    WS_ROLE_TO_DS_ROLE, DS_ROLE_RANK,
)
from billing_plans import assert_can

logger = logging.getLogger("datavault.workspaces")
router = APIRouter(prefix="/workspaces", tags=["workspaces"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_sandbox: Optional[bool] = False


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class WorkspaceOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    created_at: datetime
    my_role: Optional[str] = None

    model_config = {"from_attributes": True}


class MemberAdd(BaseModel):
    user_id: uuid.UUID
    role: str = "member"  # owner | admin_ws | member


class MemberOut(BaseModel):
    user_id: uuid.UUID
    username: str
    email: str
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[WorkspaceOut])
async def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista los workspaces a los que pertenece el usuario (admin global ve todos)."""
    if current_user.role == "admin":
        result = await db.execute(select(Workspace))
        workspaces = result.scalars().all()
    else:
        result = await db.execute(
            select(Workspace)
            .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
            .where(WorkspaceMember.user_id == current_user.id)
        )
        workspaces = result.scalars().all()

    out = []
    for ws in workspaces:
        role = await effective_workspace_role(current_user, ws.id, db)
        out.append(WorkspaceOut(
            id=ws.id,
            name=ws.name,
            description=ws.description,
            created_at=ws.created_at,
            my_role=role,
        ))
    return out


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    body: WorkspaceCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    ws = Workspace(
        name=body.name,
        description=body.description,
        is_sandbox=bool(getattr(body, "is_sandbox", False)),
        created_at=datetime.now(timezone.utc),
    )
    db.add(ws)
    await db.flush()

    # El creador es automáticamente owner
    db.add(WorkspaceMember(
        workspace_id=ws.id,
        user_id=current_user.id,
        role="owner",
        joined_at=datetime.now(timezone.utc),
    ))

    # Si es sandbox, pre-poblar con las 4 plantillas + sus sample_rows
    if ws.is_sandbox:
        from templates import TEMPLATES
        from models import Dataset, ColumnDefinition, Record
        for tpl in TEMPLATES:
            ds = Dataset(name=tpl["name"], description=tpl["description"], workspace_id=ws.id)
            db.add(ds)
            await db.flush()
            for col_spec in tpl["columns"]:
                db.add(ColumnDefinition(
                    dataset_id=ds.id,
                    name=col_spec["name"],
                    field_key=col_spec["field_key"],
                    data_type=col_spec["data_type"],
                    rules=col_spec.get("rules", {}),
                    position=col_spec.get("position", 0),
                ))
            for row in tpl["sample_rows"]:
                db.add(Record(dataset_id=ds.id, data=row))

    await db.commit()
    await db.refresh(ws)
    return WorkspaceOut(id=ws.id, name=ws.name, description=ws.description,
                        created_at=ws.created_at, my_role="owner")


@router.get("/{workspace_id}", response_model=WorkspaceOut)
async def get_workspace(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await _get_or_404(workspace_id, db)
    role = await effective_workspace_role(current_user, workspace_id, db)
    if role is None:
        raise HTTPException(status_code=403, detail="Sin acceso a este workspace")
    return WorkspaceOut(id=ws.id, name=ws.name, description=ws.description,
                        created_at=ws.created_at, my_role=role)


@router.patch("/{workspace_id}", response_model=WorkspaceOut)
async def update_workspace(
    workspace_id: uuid.UUID,
    body: WorkspaceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await _get_or_404(workspace_id, db)
    role = await effective_workspace_role(current_user, workspace_id, db)
    if role not in ("owner", "admin_ws"):
        raise HTTPException(status_code=403, detail="Solo owner o admin_ws pueden editar el workspace")
    if body.name is not None:
        ws.name = body.name
    if body.description is not None:
        ws.description = body.description
    await db.commit()
    await db.refresh(ws)
    return WorkspaceOut(id=ws.id, name=ws.name, description=ws.description,
                        created_at=ws.created_at, my_role=role)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    ws = await _get_or_404(workspace_id, db)
    await db.delete(ws)
    await db.commit()


# ── Miembros ──────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}/members", response_model=list[MemberOut])
async def list_members(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await effective_workspace_role(current_user, workspace_id, db)
    if role is None:
        raise HTTPException(status_code=403, detail="Sin acceso a este workspace")

    result = await db.execute(
        select(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == workspace_id)
    )
    rows = result.all()
    return [
        MemberOut(
            user_id=member.user_id,
            username=user.username,
            email=user.email,
            role=member.role,
            joined_at=member.joined_at,
        )
        for member, user in rows
    ]


@router.post("/{workspace_id}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def add_member(
    workspace_id: uuid.UUID,
    body: MemberAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await effective_workspace_role(current_user, workspace_id, db)
    if role not in ("owner", "admin_ws"):
        raise HTTPException(status_code=403, detail="Solo owner o admin_ws pueden agregar miembros")

    user_result = await db.execute(select(User).where(User.id == body.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    existing = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == body.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="El usuario ya es miembro")

    if body.role not in ("owner", "admin_ws", "member"):
        raise HTTPException(status_code=400, detail="Rol inválido. Usa: owner, admin_ws, member")

    await assert_can(workspace_id, "member", db)  # límite de asientos del plan

    member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=body.user_id,
        role=body.role,
        joined_at=datetime.now(timezone.utc),
    )
    db.add(member)
    await db.commit()
    logger.info("ws_member_added ws=%s user=%s role=%s by=%s", workspace_id, body.user_id, body.role, current_user.id)

    return MemberOut(
        user_id=member.user_id,
        username=user.username,
        email=user.email,
        role=member.role,
        joined_at=member.joined_at,
    )


@router.patch("/{workspace_id}/members/{user_id}", response_model=MemberOut)
async def update_member_role(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    body: MemberAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await effective_workspace_role(current_user, workspace_id, db)
    if role not in ("owner", "admin_ws"):
        raise HTTPException(status_code=403, detail="Solo owner o admin_ws pueden cambiar roles")

    result = await db.execute(
        select(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    member, user = row
    if body.role not in ("owner", "admin_ws", "member"):
        raise HTTPException(status_code=400, detail="Rol inválido. Usa: owner, admin_ws, member")

    member.role = body.role
    await db.commit()
    logger.info("ws_member_role_changed ws=%s user=%s new_role=%s by=%s", workspace_id, user_id, body.role, current_user.id)

    return MemberOut(
        user_id=member.user_id,
        username=user.username,
        email=user.email,
        role=member.role,
        joined_at=member.joined_at,
    )


@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await effective_workspace_role(current_user, workspace_id, db)
    if role not in ("owner", "admin_ws") and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Sin permisos para remover este miembro")

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    await db.delete(member)
    await db.commit()
    logger.info("ws_member_removed ws=%s user=%s by=%s", workspace_id, user_id, current_user.id)


# ── Matriz de accesos (batch) ──────────────────────────────────────────────────

class AccessMatrixEntry(BaseModel):
    dataset_id: uuid.UUID
    subject_id: uuid.UUID  # group_id (mode=groups) o user_id (mode=users)
    role: str              # admin/editor/viewer


class AccessMatrixOut(BaseModel):
    mode: str
    entries: list[AccessMatrixEntry]


@router.get("/{workspace_id}/access-matrix", response_model=AccessMatrixOut)
async def workspace_access_matrix(
    workspace_id: uuid.UUID,
    mode: str = "groups",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Matriz de accesos del workspace en UNA sola request (reemplaza el N+1 que
    pedía el acceso de cada grupo/miembro por separado).

    - mode=groups → permisos explícitos de cada grupo del workspace.
    - mode=users  → rol efectivo de cada miembro (directo > grupo > workspace).

    Solo se incluyen roles con acceso (se omite 'none', que en la matriz = celda vacía).
    """
    await _get_or_404(workspace_id, db)
    if current_user.role != "admin":
        ws_role = await effective_workspace_role(current_user, workspace_id, db)
        if ws_role not in ("owner", "admin_ws"):
            raise HTTPException(status_code=403, detail="Requiere owner o admin_ws del workspace")

    if mode not in ("groups", "users"):
        raise HTTPException(status_code=400, detail="mode debe ser 'groups' o 'users'")

    entries: list[AccessMatrixEntry] = []

    if mode == "groups":
        # Permisos explícitos de todos los grupos del workspace — 1 query.
        group_ids = select(UserGroup.id).where(UserGroup.workspace_id == workspace_id)
        rows = await db.execute(
            select(DatasetGroupPermission.dataset_id, DatasetGroupPermission.group_id, DatasetGroupPermission.role)
            .where(DatasetGroupPermission.group_id.in_(group_ids))
        )
        for dataset_id, group_id, role in rows.all():
            if role and role != "none":
                entries.append(AccessMatrixEntry(dataset_id=dataset_id, subject_id=group_id, role=role))
        return AccessMatrixOut(mode=mode, entries=entries)

    # mode == "users": rol efectivo por miembro × dataset del workspace.
    members = (await db.execute(
        select(WorkspaceMember.user_id, WorkspaceMember.role).where(WorkspaceMember.workspace_id == workspace_id)
    )).all()
    ws_dataset_ids = [r[0] for r in (await db.execute(
        select(Dataset.id).where(Dataset.workspace_id == workspace_id)
    )).all()]
    if not members or not ws_dataset_ids:
        return AccessMatrixOut(mode=mode, entries=entries)

    member_ids = [m[0] for m in members]
    ds_id_set = set(ws_dataset_ids)

    # Permisos directos de esos miembros sobre datasets del workspace
    direct_rows = (await db.execute(
        select(DatasetPermission.user_id, DatasetPermission.dataset_id, DatasetPermission.role)
        .where(DatasetPermission.user_id.in_(member_ids), DatasetPermission.dataset_id.in_(ws_dataset_ids))
    )).all()
    direct: dict[tuple[uuid.UUID, uuid.UUID], str] = {(u, d): r for u, d, r in direct_rows}

    # Mejor permiso de grupo por (miembro, dataset)
    group_rows = (await db.execute(
        select(UserGroupMember.user_id, DatasetGroupPermission.dataset_id, DatasetGroupPermission.role)
        .join(DatasetGroupPermission, DatasetGroupPermission.group_id == UserGroupMember.group_id)
        .where(UserGroupMember.user_id.in_(member_ids), DatasetGroupPermission.dataset_id.in_(ws_dataset_ids))
    )).all()
    best_group: dict[tuple[uuid.UUID, uuid.UUID], str] = {}
    for u, d, r in group_rows:
        key = (u, d)
        if key not in best_group or DS_ROLE_RANK.get(r, 0) > DS_ROLE_RANK.get(best_group[key], 0):
            best_group[key] = r

    # Combinar con prioridad directo > grupo > workspace para cada miembro × dataset.
    for user_id, ws_member_role in members:
        ws_default = WS_ROLE_TO_DS_ROLE.get(ws_member_role, "viewer")
        for ds_id in ds_id_set:
            key = (user_id, ds_id)
            if key in direct:
                role = direct[key]          # directo gana (incluido 'none' = bloqueo)
            elif key in best_group:
                role = best_group[key]      # mejor permiso de grupo
            else:
                role = ws_default           # fallback por rol de workspace
            if role and role != "none":
                entries.append(AccessMatrixEntry(dataset_id=ds_id, subject_id=user_id, role=role))

    return AccessMatrixOut(mode=mode, entries=entries)


# ── Helper ────────────────────────────────────────────────────────────────────

async def _get_or_404(workspace_id: uuid.UUID, db: AsyncSession) -> Workspace:
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    return ws

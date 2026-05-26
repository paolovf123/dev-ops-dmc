import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Workspace, WorkspaceMember, User
from auth import get_current_user, require_admin, effective_workspace_role, ws_require_owner

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


# ── Helper ────────────────────────────────────────────────────────────────────

async def _get_or_404(workspace_id: uuid.UUID, db: AsyncSession) -> Workspace:
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace no encontrado")
    return ws

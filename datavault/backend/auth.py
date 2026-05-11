from __future__ import annotations
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database import get_db
from models import User, DatasetPermission, DatasetGroupPermission, UserGroupMember, WorkspaceMember

SECRET_KEY = os.getenv("SECRET_KEY", "datavault-secret-change-in-production-xyz-123")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

ROLE_RANK = {"none": 0, "viewer": 1, "editor": 2, "member": 2, "admin_ws": 3, "owner": 4, "admin": 5}

# Workspace role → equivalent dataset permission level
WS_ROLE_TO_DS_ROLE = {
    "owner":    "admin",
    "admin_ws": "editor",
    "member":   "editor",
}


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT token. Returns payload dict or None."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload if payload.get("sub") else None
    except JWTError:
        return None


async def _resolve_token(
    header_token: Optional[str] = Depends(oauth2_scheme),
) -> Optional[str]:
    return header_token


async def get_current_user(
    token: Optional[str] = Depends(_resolve_token),
    db: AsyncSession = Depends(get_db),
) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado — inicia sesión",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise exc
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise exc
    except JWTError:
        raise exc

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise exc
    return user


async def effective_role(user: User, dataset_id: uuid.UUID | None, db: AsyncSession) -> str:
    """Return the effective role for a user on a specific dataset.

    Priority:
    1. Global admin → always admin
    2. Direct DatasetPermission (user-level) → use that role
    3. Best DatasetGroupPermission from user's groups → use highest role
    4. Global user role (fallback)
    """
    if dataset_id is None:
        return user.role
    if user.role == "admin":
        return "admin"

    # Check direct user permission (highest priority after admin)
    direct = await db.execute(
        select(DatasetPermission).where(
            DatasetPermission.dataset_id == dataset_id,
            DatasetPermission.user_id == user.id,
        )
    )
    perm = direct.scalar_one_or_none()
    if perm is not None:
        return perm.role

    # Check group permissions — return highest role across all groups
    group_perms_result = await db.execute(
        select(DatasetGroupPermission)
        .join(UserGroupMember, DatasetGroupPermission.group_id == UserGroupMember.group_id)
        .where(
            DatasetGroupPermission.dataset_id == dataset_id,
            UserGroupMember.user_id == user.id,
        )
    )
    group_perms = group_perms_result.scalars().all()
    if group_perms:
        best = max(group_perms, key=lambda p: ROLE_RANK.get(p.role, 0))
        return best.role

    return user.role


def require_roles(*roles: str):
    """Returns a FastAPI dependency that enforces role membership (global, no dataset context)."""
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requiere rol: {' o '.join(roles)}",
            )
        return current_user
    return _check


def require_dataset_roles(*roles: str):
    """Dependency factory that checks per-dataset permissions (including groups)."""
    async def _check(
        dataset_id: uuid.UUID,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        role = await effective_role(current_user, dataset_id, db)
        if role not in roles or role == "none":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Sin acceso a este dataset. Requiere: {' o '.join(roles)}",
            )
        return current_user
    return _check


# Global role shortcuts (no dataset context)
require_admin  = require_roles("admin")
require_editor = require_roles("admin", "editor")
require_viewer = require_roles("admin", "editor", "viewer")

# Dataset-aware shortcuts
ds_require_admin  = require_dataset_roles("admin")
ds_require_editor = require_dataset_roles("admin", "editor")
ds_require_viewer = require_dataset_roles("admin", "editor", "viewer")


async def effective_workspace_role(user: User, workspace_id: uuid.UUID, db: AsyncSession) -> str | None:
    """Devuelve el rol del usuario en un workspace: owner|manager|editor|viewer, o None.

    Admin global siempre retorna 'owner'.
    """
    if user.role == "admin":
        return "owner"
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    member = result.scalar_one_or_none()
    return member.role if member else None


async def effective_role_in_workspace(
    user: User, dataset_id: uuid.UUID | None, workspace_id: uuid.UUID | None, db: AsyncSession
) -> str:
    """Rol efectivo considerando workspace primero, luego dataset perms, luego rol global.

    Prioridad:
    1. Admin global → siempre 'admin'
    2. Rol de workspace → se convierte en permiso de dataset
    3. Permiso directo de dataset
    4. Mejor permiso de grupo en dataset
    5. Rol global como fallback
    """
    if user.role == "admin":
        return "admin"

    # Workspace role takes priority over global role
    if workspace_id:
        ws_role = await effective_workspace_role(user, workspace_id, db)
        if ws_role:
            return WS_ROLE_TO_DS_ROLE.get(ws_role, "viewer")

    # Fallback to dataset-level permissions
    if dataset_id:
        direct = await db.execute(
            select(DatasetPermission).where(
                DatasetPermission.dataset_id == dataset_id,
                DatasetPermission.user_id == user.id,
            )
        )
        perm = direct.scalar_one_or_none()
        if perm is not None:
            return perm.role

        user_group_ids = select(UserGroupMember.group_id).where(UserGroupMember.user_id == user.id)
        group_perms_result = await db.execute(
            select(DatasetGroupPermission)
            .join(UserGroupMember, DatasetGroupPermission.group_id == UserGroupMember.group_id)
            .where(
                DatasetGroupPermission.dataset_id == dataset_id,
                UserGroupMember.user_id == user.id,
            )
        )
        group_perms = group_perms_result.scalars().all()
        if group_perms:
            best = max(group_perms, key=lambda p: ROLE_RANK.get(p.role, 0))
            return best.role

    return user.role


def require_workspace_roles(*roles: str):
    """Dependency que verifica que el usuario tenga uno de los roles dados en el workspace."""
    async def _check(
        workspace_id: uuid.UUID,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        role = await effective_workspace_role(current_user, workspace_id, db)
        if role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Sin acceso a este workspace. Requiere: {' o '.join(roles)}",
            )
        return current_user
    return _check


ws_require_owner    = require_workspace_roles("owner")
ws_require_admin_ws = require_workspace_roles("owner", "admin_ws")
ws_require_member   = require_workspace_roles("owner", "admin_ws", "member")


async def count_users(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(User))
    return result.scalar_one()

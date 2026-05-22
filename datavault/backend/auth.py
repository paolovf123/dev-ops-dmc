from __future__ import annotations
import os
import uuid
import uuid as _uuid_module
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database import get_db
from models import User, DatasetPermission, DatasetGroupPermission, UserGroupMember, WorkspaceMember, Dataset

# ── Secret key — obligatorio en producción ────────────────────────────────────
_is_testing = os.getenv("TESTING", "false").lower() == "true"
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    if _is_testing:
        SECRET_KEY = "test-secret-insecure-do-not-use-in-production-xyz-abc"
    else:
        raise RuntimeError(
            "La variable de entorno SECRET_KEY debe estar configurada. "
            "Genera una con: openssl rand -hex 32"
        )
elif len(SECRET_KEY) < 32 and not _is_testing:
    raise RuntimeError("SECRET_KEY debe tener al menos 32 caracteres")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 1
REFRESH_TOKEN_EXPIRE_DAYS = 14
WS_TICKET_EXPIRE_SECONDS = 60

# Cookie config
COOKIE_NAME = "dv_token"
REFRESH_COOKIE_NAME = "dv_refresh"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").lower()
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

ROLE_RANK = {"none": 0, "viewer": 1, "editor": 2, "member": 2, "admin_ws": 3, "owner": 4, "admin": 5}

WS_ROLE_TO_DS_ROLE = {
    "owner":    "admin",
    "admin_ws": "editor",
    "member":   "editor",
}

# ── Redis opcional para revocación de refresh tokens ─────────────────────────
try:
    import redis.asyncio as _aioredis
    _REDIS_URL = os.getenv("REDIS_URL")
    _redis = _aioredis.from_url(_REDIS_URL, decode_responses=True) if _REDIS_URL else None
except ImportError:
    _redis = None


async def revoke_token(jti: str, ttl_seconds: int) -> None:
    """Marca un refresh token como revocado. No-op si Redis no está disponible."""
    if _redis is None or ttl_seconds <= 0:
        return
    try:
        await _redis.setex(f"revoked:{jti}", ttl_seconds, "1")
    except Exception:
        pass


async def is_token_revoked(jti: str) -> bool:
    if _redis is None:
        return False
    try:
        return bool(await _redis.exists(f"revoked:{jti}"))
    except Exception:
        return False


# ── Token helpers ─────────────────────────────────────────────────────────────

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


def create_refresh_token(user_id: str) -> tuple[str, str]:
    """Devuelve (token, jti). El jti se usa para revocación en Redis."""
    jti = str(_uuid_module.uuid4())
    token = create_access_token(
        {"sub": user_id, "scope": "refresh", "jti": jti},
        expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    return token, jti


def decode_token(token: str) -> dict | None:
    """Decodifica y valida un JWT. Devuelve el payload o None."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload if payload.get("sub") else None
    except JWTError:
        return None


def create_ws_ticket(user_id: str) -> str:
    """JWT efímero (60s) para el handshake del WebSocket."""
    return create_access_token(
        {"sub": user_id, "scope": "ws"},
        expires_delta=timedelta(seconds=WS_TICKET_EXPIRE_SECONDS),
    )


async def _resolve_token(
    request: Request,
    header_token: Optional[str] = Depends(oauth2_scheme),
) -> Optional[str]:
    """Resuelve el JWT desde el header Authorization o desde la cookie httpOnly."""
    if header_token:
        return header_token
    return request.cookies.get(COOKIE_NAME)


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
    """Rol efectivo del usuario sobre un dataset específico.

    Prioridad:
    1. Admin global → siempre admin
    2. Permiso directo de usuario (DatasetPermission)
    3. Mejor permiso de grupo (DatasetGroupPermission)
    4. Workspace membership → mapea a rol de dataset
    5. Rol global del usuario (fallback)
    """
    if dataset_id is None:
        return user.role
    if user.role == "admin":
        return "admin"

    direct = await db.execute(
        select(DatasetPermission).where(
            DatasetPermission.dataset_id == dataset_id,
            DatasetPermission.user_id == user.id,
        )
    )
    perm = direct.scalar_one_or_none()
    if perm is not None:
        return perm.role

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

    ds_result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = ds_result.scalar_one_or_none()
    if ds and ds.workspace_id:
        ws_role = await effective_workspace_role(user, ds.workspace_id, db)
        if ws_role:
            return WS_ROLE_TO_DS_ROLE.get(ws_role, "viewer")
        # Dataset pertenece a un workspace y el usuario NO es miembro:
        # sin permisos directos ni de grupo, no debe poder acceder
        # (alineado con la doc de list_datasets que oculta esos datasets).
        return "none"

    return user.role


def require_roles(*roles: str):
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requiere rol: {' o '.join(roles)}",
            )
        return current_user
    return _check


def require_dataset_roles(*roles: str):
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


require_admin  = require_roles("admin")
require_editor = require_roles("admin", "editor")
require_viewer = require_roles("admin", "editor", "viewer")

ds_require_admin  = require_dataset_roles("admin")
ds_require_editor = require_dataset_roles("admin", "editor")
ds_require_viewer = require_dataset_roles("admin", "editor", "viewer")


async def effective_workspace_role(user: User, workspace_id: uuid.UUID, db: AsyncSession) -> str | None:
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
    if user.role == "admin":
        return "admin"
    if workspace_id:
        ws_role = await effective_workspace_role(user, workspace_id, db)
        if ws_role:
            return WS_ROLE_TO_DS_ROLE.get(ws_role, "viewer")
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

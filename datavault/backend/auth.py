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
from models import User, DatasetPermission

SECRET_KEY = os.getenv("SECRET_KEY", "datavault-secret-change-in-production-xyz-123")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


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


ROLE_RANK = {"none": 0, "viewer": 1, "editor": 2, "admin": 3}


async def effective_role(user: User, dataset_id: uuid.UUID | None, db: AsyncSession) -> str:
    """Return the effective role for a user on a specific dataset.
    Dataset-level permission overrides global role when present."""
    if dataset_id is None:
        return user.role
    result = await db.execute(
        select(DatasetPermission).where(
            DatasetPermission.dataset_id == dataset_id,
            DatasetPermission.user_id == user.id,
        )
    )
    perm = result.scalar_one_or_none()
    if perm is None:
        return user.role
    # Use whichever is higher: global role or dataset override
    # (admins always keep admin regardless of dataset perm)
    if user.role == "admin":
        return "admin"
    return perm.role


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
    """Dependency factory that checks per-dataset permissions.
    Reads dataset_id from the path parameter."""
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


async def count_users(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(User))
    return result.scalar_one()

"""Tokens de API personales para integraciones externas."""
from __future__ import annotations
import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from limiter import limiter
from models import ApiToken, User

router = APIRouter(prefix="/api-tokens", tags=["api-tokens"])

TOKEN_PREFIX = "opsg_"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_token() -> tuple[str, str]:
    """Devuelve (token_completo, prefijo). El prefijo se guarda en BD para identificación."""
    raw = secrets.token_urlsafe(32)
    full = f"{TOKEN_PREFIX}{raw}"
    return full, full[:12]


@router.get("")
async def list_my_tokens(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiToken).where(ApiToken.user_id == current_user.id).order_by(ApiToken.created_at.desc())
    )
    tokens = result.scalars().all()
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "prefix": t.prefix,
            "scope": t.scope,
            "workspace_id": str(t.workspace_id) if t.workspace_id else None,
            "created_at": t.created_at.isoformat(),
            "expires_at": t.expires_at.isoformat() if t.expires_at else None,
            "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
            "revoked": t.revoked,
        }
        for t in tokens
    ]


@router.post("", status_code=201)
@limiter.limit("20/minute")
async def create_token(
    request: Request,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nombre requerido")
    scope = (body.get("scope") or "read").lower()
    if scope not in ("read", "write"):
        raise HTTPException(status_code=400, detail="scope debe ser 'read' o 'write'")
    workspace_id = None
    if body.get("workspace_id"):
        try:
            workspace_id = uuid.UUID(body["workspace_id"])
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="workspace_id inválido")
    expires_at = None
    if body.get("expires_at"):
        try:
            expires_at = datetime.fromisoformat(body["expires_at"])
        except ValueError:
            raise HTTPException(status_code=400, detail="expires_at debe ser ISO 8601")

    full, prefix = _generate_token()
    token = ApiToken(
        user_id=current_user.id,
        name=name,
        prefix=prefix,
        token_hash=_hash(full),
        scope=scope,
        workspace_id=workspace_id,
        expires_at=expires_at,
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)

    # El token completo solo se devuelve UNA VEZ
    return {
        "id": str(token.id),
        "name": token.name,
        "token": full,  # ⚠ solo visible aquí, después solo el prefix
        "prefix": token.prefix,
        "scope": token.scope,
        "workspace_id": str(token.workspace_id) if token.workspace_id else None,
        "created_at": token.created_at.isoformat(),
        "expires_at": token.expires_at.isoformat() if token.expires_at else None,
    }


@router.delete("/{token_id}", status_code=204)
async def revoke_my_token(
    token_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiToken).where(ApiToken.id == token_id, ApiToken.user_id == current_user.id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token no encontrado")
    token.revoked = True
    await db.commit()


async def authenticate_api_token(token_value: str, db: AsyncSession) -> User | None:
    """Resuelve un token bearer en su usuario dueño. Actualiza last_used_at."""
    if not token_value.startswith(TOKEN_PREFIX):
        return None
    prefix = token_value[:12]
    result = await db.execute(
        select(ApiToken).where(
            ApiToken.prefix == prefix,
            ApiToken.revoked.is_(False),
        )
    )
    candidates = result.scalars().all()
    h = _hash(token_value)
    for t in candidates:
        if t.token_hash == h:
            if t.expires_at and t.expires_at < datetime.now(timezone.utc):
                return None
            t.last_used_at = datetime.now(timezone.utc)
            await db.commit()
            user_res = await db.execute(select(User).where(User.id == t.user_id))
            return user_res.scalar_one_or_none()
    return None

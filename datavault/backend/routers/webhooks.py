"""Webhooks salientes para integraciones (Slack, Zapier, sistemas internos)."""
from __future__ import annotations
import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, effective_workspace_role
from database import get_db
from limiter import limiter
from models import User, Webhook

logger = logging.getLogger("datavault.webhooks")

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

VALID_EVENTS = {"record.create", "record.update", "record.delete", "dataset.create", "dataset.delete"}


async def _require_ws_manager_webhook(user: User, workspace_id: uuid.UUID | None, db: AsyncSession):
    if user.role == "admin":
        return
    if not workspace_id:
        raise HTTPException(status_code=403, detail="Se requiere workspace_id para no-admins")
    role = await effective_workspace_role(user, workspace_id, db)
    if role not in ("owner", "admin_ws"):
        raise HTTPException(status_code=403, detail="Requiere owner/admin_ws en el workspace")


@router.get("")
async def list_webhooks(
    workspace_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Webhook)
    if workspace_id:
        q = q.where(Webhook.workspace_id == workspace_id)
    elif current_user.role != "admin":
        # No-admin sin workspace_id: solo ve los suyos
        q = q.where(Webhook.created_by == current_user.id)
    result = await db.execute(q.order_by(Webhook.created_at.desc()))
    rows = result.scalars().all()
    return [
        {
            "id": str(w.id),
            "workspace_id": str(w.workspace_id) if w.workspace_id else None,
            "dataset_id": str(w.dataset_id) if w.dataset_id else None,
            "url": w.url,
            "events": w.events,
            "active": w.active,
            "has_secret": bool(w.secret),
            "created_at": w.created_at.isoformat(),
            "last_fired_at": w.last_fired_at.isoformat() if w.last_fired_at else None,
            "last_status": w.last_status,
            "fail_count": w.fail_count,
        }
        for w in rows
    ]


@router.post("", status_code=201)
@limiter.limit("20/minute")
async def create_webhook(
    request: Request,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    url = (body.get("url") or "").strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL debe empezar con http:// o https://")
    events = body.get("events") or []
    if not isinstance(events, list) or not events:
        raise HTTPException(status_code=400, detail="Debe especificar al menos un evento")
    invalid = [e for e in events if e not in VALID_EVENTS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Eventos inválidos: {invalid}. Válidos: {sorted(VALID_EVENTS)}")

    workspace_id = uuid.UUID(body["workspace_id"]) if body.get("workspace_id") else None
    dataset_id = uuid.UUID(body["dataset_id"]) if body.get("dataset_id") else None
    await _require_ws_manager_webhook(current_user, workspace_id, db)

    # Si no viene secret, generamos uno (el usuario lo verá en la respuesta)
    secret = body.get("secret") or secrets.token_urlsafe(24)

    wh = Webhook(
        workspace_id=workspace_id,
        dataset_id=dataset_id,
        url=url,
        events=events,
        secret=secret,
        active=bool(body.get("active", True)),
        created_by=current_user.id,
    )
    db.add(wh)
    await db.commit()
    await db.refresh(wh)
    return {
        "id": str(wh.id),
        "url": wh.url,
        "events": wh.events,
        "secret": secret,  # solo se muestra al crearlo
        "active": wh.active,
        "created_at": wh.created_at.isoformat(),
    }


@router.delete("/{webhook_id}", status_code=204)
async def delete_webhook(
    webhook_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook no encontrado")
    await _require_ws_manager_webhook(current_user, wh.workspace_id, db)
    await db.delete(wh)
    await db.commit()


@router.post("/{webhook_id}/test")
async def test_webhook(
    webhook_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook no encontrado")
    await _require_ws_manager_webhook(current_user, wh.workspace_id, db)
    status_code = await _fire_one(wh, "webhook.test", {"message": "Test event de OpsGrid"})
    await db.commit()
    return {"sent": True, "status": status_code}


# ── Dispatcher (llamado desde routers/records.py y datasets.py) ───────────────

async def _fire_one(wh: Webhook, event: str, payload: dict) -> int | None:
    body = json.dumps({
        "event": event,
        "fired_at": datetime.now(timezone.utc).isoformat(),
        "data": payload,
    })
    headers = {"Content-Type": "application/json", "User-Agent": "OpsGrid-Webhook/1.0"}
    if wh.secret:
        sig = hmac.new(wh.secret.encode(), body.encode(), hashlib.sha256).hexdigest()
        headers["X-OpsGrid-Signature"] = f"sha256={sig}"
    status: int | None = None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(wh.url, content=body, headers=headers)
            status = r.status_code
        wh.last_fired_at = datetime.now(timezone.utc)
        wh.last_status = status
        if status >= 400:
            wh.fail_count += 1
        else:
            wh.fail_count = 0
    except Exception as e:
        logger.warning("Webhook %s failed: %s", wh.id, e)
        wh.last_status = 0
        wh.fail_count += 1
    return status


async def dispatch_event(
    db: AsyncSession,
    event: str,
    workspace_id: uuid.UUID | None,
    dataset_id: uuid.UUID | None,
    payload: dict,
) -> None:
    """Dispara webhooks relevantes. NO bloquea la request principal:
    se ejecuta en background. La task abre su propia sesión DB para no
    chocar con el ciclo de vida del request."""
    result = await db.execute(select(Webhook).where(Webhook.active.is_(True)))
    all_webhooks = result.scalars().all()

    match_ids = [
        wh.id for wh in all_webhooks
        if event in (wh.events or [])
        and (wh.dataset_id is None or wh.dataset_id == dataset_id)
        and (wh.workspace_id is None or wh.workspace_id == workspace_id)
    ]
    if not match_ids:
        return

    async def _runner():
        from database import SessionLocal
        try:
            async with SessionLocal() as session:
                result = await session.execute(select(Webhook).where(Webhook.id.in_(match_ids)))
                hooks = result.scalars().all()
                for wh in hooks:
                    await _fire_one(wh, event, payload)
                await session.commit()
        except Exception as e:
            logger.exception("dispatch_event background runner failed: %s", e)

    asyncio.create_task(_runner())

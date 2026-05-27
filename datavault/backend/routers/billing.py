import logging
import uuid
from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Subscription, PaymentClaim, Workspace, User, utcnow
from auth import get_current_user, require_admin, effective_workspace_role
from billing_plans import (
    PLANS, PLAN_ORDER, bank_info, mp_token,
    effective_plan_key, get_or_create_subscription, workspace_usage,
)

logger = logging.getLogger("datavault.billing")
router = APIRouter(tags=["billing"])


# ── Schemas ───────────────────────────────────────────────────────────────────
class CheckoutBody(BaseModel):
    plan: str

class TransferBody(BaseModel):
    plan: str
    reference: str | None = None
    note: str | None = None

class ClaimReview(BaseModel):
    note: str | None = None


# ── Gates ───────────────────────────────────────────────────────────────────
async def _ws_member(user: User, workspace_id: uuid.UUID, db: AsyncSession):
    if user.role == "admin":
        return
    role = await effective_workspace_role(user, workspace_id, db)
    if role is None:
        raise HTTPException(status_code=403, detail="No sos miembro de este workspace")

async def _ws_manager(user: User, workspace_id: uuid.UUID, db: AsyncSession):
    if user.role == "admin":
        return
    role = await effective_workspace_role(user, workspace_id, db)
    if role not in ("owner", "admin_ws"):
        raise HTTPException(status_code=403, detail="Requiere rol owner o admin_ws en el workspace")


def _plan_or_404(plan: str) -> dict:
    if plan not in PLANS:
        raise HTTPException(status_code=400, detail="Plan inválido")
    return PLANS[plan]

def _sub_out(sub: Subscription) -> dict:
    return {
        "plan": sub.plan, "status": sub.status, "provider": sub.provider,
        "trial_ends_at": sub.trial_ends_at, "current_period_end": sub.current_period_end,
    }


# ── Catálogo de planes ──────────────────────────────────────────────────────
@router.get("/billing/plans")
async def list_plans():
    info = bank_info()
    return {
        "plans": [{"key": k, **PLANS[k]} for k in PLAN_ORDER],
        "mercadopago_enabled": bool(mp_token()),
        "bank": info,
        "bank_configured": bool(info["account"] or info["cci"]),
    }


# ── Estado + uso del workspace ────────────────────────────────────────────────
@router.get("/workspaces/{workspace_id}/billing")
async def workspace_billing(workspace_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _ws_member(current_user, workspace_id, db)
    sub = await get_or_create_subscription(workspace_id, db)
    key = effective_plan_key(sub)
    usage = await workspace_usage(workspace_id, db)
    return {
        "subscription": _sub_out(sub),
        "plan_key": key,
        "plan": {"key": key, **PLANS[key]},
        "usage": usage,
        "can_manage": current_user.role == "admin" or (await effective_workspace_role(current_user, workspace_id, db)) in ("owner", "admin_ws"),
    }


# ── Transferencia bancaria (aviso de pago manual) ─────────────────────────────
@router.post("/workspaces/{workspace_id}/billing/transfer", status_code=201)
async def report_transfer(workspace_id: uuid.UUID, body: TransferBody, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _ws_manager(current_user, workspace_id, db)
    plan = _plan_or_404(body.plan)
    claim = PaymentClaim(
        workspace_id=workspace_id, plan=body.plan, amount=plan["price_pen"],
        method="transfer", reference=body.reference, note=body.note,
        status="pending", created_by=current_user.id,
    )
    db.add(claim)
    await db.commit()
    await db.refresh(claim)
    logger.info("payment_claim_created ws=%s plan=%s by=%s", workspace_id, body.plan, current_user.id)
    return {"id": str(claim.id), "status": "pending", "message": "Aviso de pago recibido. Un administrador lo verificará y activará tu plan."}


# ── Checkout Mercado Pago (Checkout Pro) ──────────────────────────────────────
@router.post("/workspaces/{workspace_id}/billing/checkout")
async def mp_checkout(workspace_id: uuid.UUID, body: CheckoutBody, request: Request, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _ws_manager(current_user, workspace_id, db)
    plan = _plan_or_404(body.plan)
    if plan["price_pen"] <= 0:
        raise HTTPException(status_code=400, detail="El plan Free no requiere pago")
    token = mp_token()
    if not token:
        raise HTTPException(status_code=400, detail="Mercado Pago aún no está configurado. Usá transferencia bancaria.")

    origin = request.headers.get("origin") or "http://localhost:5173"
    payload = {
        "items": [{
            "title": f"OpsGrid · Plan {plan['name']}",
            "quantity": 1, "currency_id": "PEN", "unit_price": float(plan["price_pen"]),
        }],
        "metadata": {"workspace_id": str(workspace_id), "plan": body.plan},
        "back_urls": {
            "success": f"{origin}/billing?status=success",
            "failure": f"{origin}/billing?status=failure",
            "pending": f"{origin}/billing?status=pending",
        },
        "auto_return": "approved",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post("https://api.mercadopago.com/checkout/preferences",
                                  headers={"Authorization": f"Bearer {token}"}, json=payload)
        if r.status_code >= 300:
            logger.error("mp_preference_error %s %s", r.status_code, r.text[:300])
            raise HTTPException(status_code=502, detail="No se pudo iniciar el pago con Mercado Pago")
        data = r.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Error conectando con Mercado Pago: {e}")

    # Dejamos registro pendiente; el webhook lo confirma.
    sub = await get_or_create_subscription(workspace_id, db)
    sub.provider = "mercadopago"
    sub.provider_ref = data.get("id")
    await db.commit()
    return {"init_point": data.get("init_point") or data.get("sandbox_init_point"), "preference_id": data.get("id")}


@router.post("/billing/webhook")
async def mp_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Webhook de Mercado Pago. Activa la suscripción cuando un pago queda aprobado."""
    token = mp_token()
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    payment_id = (body.get("data") or {}).get("id") or request.query_params.get("id")
    topic = body.get("type") or request.query_params.get("topic")
    if not token or topic not in ("payment", None) or not payment_id:
        return {"ok": True}  # ignorar lo que no podamos procesar
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"https://api.mercadopago.com/v1/payments/{payment_id}",
                                 headers={"Authorization": f"Bearer {token}"})
        pay = r.json()
    except httpx.HTTPError:
        return {"ok": True}
    if pay.get("status") != "approved":
        return {"ok": True}
    meta = pay.get("metadata") or {}
    ws_id = meta.get("workspace_id")
    plan = meta.get("plan")
    if ws_id and plan in PLANS:
        sub = await get_or_create_subscription(uuid.UUID(ws_id), db)
        sub.plan = plan
        sub.status = "active"
        sub.provider = "mercadopago"
        sub.provider_ref = str(payment_id)
        sub.current_period_end = utcnow() + timedelta(days=30)
        await db.commit()
        logger.info("subscription_activated_mp ws=%s plan=%s", ws_id, plan)
    return {"ok": True}


# ── Revisión de avisos de pago (admin global) ────────────────────────────────
@router.get("/billing/claims")
async def list_claims(status: str = "pending", current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(PaymentClaim, Workspace.name)
        .join(Workspace, PaymentClaim.workspace_id == Workspace.id)
        .where(PaymentClaim.status == status)
        .order_by(PaymentClaim.created_at.desc())
    )).all()
    return [{
        "id": str(c.id), "workspace_id": str(c.workspace_id), "workspace_name": ws_name,
        "plan": c.plan, "amount": c.amount, "method": c.method, "reference": c.reference,
        "note": c.note, "status": c.status, "created_at": c.created_at,
    } for c, ws_name in rows]


@router.post("/billing/claims/{claim_id}/approve")
async def approve_claim(claim_id: uuid.UUID, body: ClaimReview, current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    claim = (await db.execute(select(PaymentClaim).where(PaymentClaim.id == claim_id))).scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Aviso de pago no encontrado")
    if claim.status != "pending":
        raise HTTPException(status_code=400, detail="Este aviso ya fue revisado")
    sub = await get_or_create_subscription(claim.workspace_id, db)
    sub.plan = claim.plan
    sub.status = "active"
    sub.provider = "manual"
    sub.provider_ref = claim.reference
    sub.current_period_end = utcnow() + timedelta(days=30)
    claim.status = "approved"
    claim.reviewed_by = current_user.id
    claim.reviewed_at = utcnow()
    if body.note:
        claim.note = (claim.note or "") + f"\n[admin] {body.note}"
    await db.commit()
    logger.info("payment_claim_approved id=%s ws=%s plan=%s", claim_id, claim.workspace_id, claim.plan)
    return {"ok": True, "plan": claim.plan}


@router.post("/billing/claims/{claim_id}/reject")
async def reject_claim(claim_id: uuid.UUID, body: ClaimReview, current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    claim = (await db.execute(select(PaymentClaim).where(PaymentClaim.id == claim_id))).scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Aviso de pago no encontrado")
    claim.status = "rejected"
    claim.reviewed_by = current_user.id
    claim.reviewed_at = utcnow()
    if body.note:
        claim.note = (claim.note or "") + f"\n[admin] {body.note}"
    await db.commit()
    return {"ok": True}

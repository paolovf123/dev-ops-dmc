"""Catálogo de planes, cálculo de uso y enforcement de límites por workspace.

Modelo: cada workspace tiene una Subscription a un plan (free | pro | business).
Los límites se evalúan por workspace (asientos/datasets/registros + features).
"""
import os
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Subscription, WorkspaceMember, Dataset, Record, utcnow

# price_pen = precio mensual en soles. Límites SIEMPRE finitos: el costo variable
# real es almacenamiento (RDS) + ejecuciones Lambda (scripts), así que ningún plan
# ofrece datasets/registros ilimitados. Los precios amortizan el baseline AWS
# (~S/270/mes fijo) + margen. Para cuentas muy grandes → Enterprise a medida.
PLANS: dict[str, dict] = {
    "free": {
        "name": "Free", "price_pen": 0,
        "max_members": 3, "max_datasets": 3, "max_records": 2000,
        "scripts": False, "api": False,
    },
    "pro": {
        # Precio de lista IGV incluido. Neto de IGV (490/1.18≈S/415) > baseline AWS
        # (~S/270) → rentable desde 1 cliente. ~S/9.8/asiento, muy bajo vs Airtable.
        "name": "Pro", "price_pen": 490,
        "max_members": 50, "max_datasets": 50, "max_records": 200_000,
        "scripts": True, "api": True,
    },
    "business": {
        # El doble de Pro (precio y topes). A futuro conviene diferenciarlo por
        # features (soporte prioritario, más ejecuciones de scripts, SSO) y no solo topes.
        "name": "Business", "price_pen": 980,
        "max_members": 100, "max_datasets": 100, "max_records": 400_000,
        "scripts": True, "api": True,
    },
}
PLAN_ORDER = ["free", "pro", "business"]
TRIAL_DAYS = 14

# Datos de cobro (se configuran por entorno; vacío = aún sin configurar).
def bank_info() -> dict:
    return {
        "bank": os.getenv("BILLING_BANK_NAME", ""),
        "account": os.getenv("BILLING_BANK_ACCOUNT", ""),
        "cci": os.getenv("BILLING_BANK_CCI", ""),
        "holder": os.getenv("BILLING_BANK_HOLDER", ""),
        "currency": "PEN",
    }

def mp_token() -> str:
    return os.getenv("MERCADOPAGO_ACCESS_TOKEN", "")


def effective_plan_key(sub: Subscription | None) -> str:
    """Plan vigente: si la suscripción está activa o en trial usa su plan; si está
    cancelada/vencida cae a free (los límites free se aplican como degradación)."""
    if sub and sub.status in ("active", "trialing") and sub.plan in PLANS:
        return sub.plan
    return "free"


async def get_or_create_subscription(workspace_id, db: AsyncSession) -> Subscription:
    res = await db.execute(select(Subscription).where(Subscription.workspace_id == workspace_id))
    sub = res.scalar_one_or_none()
    if sub is None:
        sub = Subscription(
            workspace_id=workspace_id, plan="free", status="trialing",
            trial_ends_at=utcnow() + timedelta(days=TRIAL_DAYS),
        )
        db.add(sub)
        await db.commit()
        await db.refresh(sub)
    return sub


async def workspace_usage(workspace_id, db: AsyncSession) -> dict:
    members = (await db.execute(
        select(func.count()).select_from(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id)
    )).scalar_one()
    ds_ids = [r[0] for r in (await db.execute(
        select(Dataset.id).where(Dataset.workspace_id == workspace_id)
    )).all()]
    records = 0
    if ds_ids:
        records = (await db.execute(
            select(func.count()).select_from(Record).where(Record.dataset_id.in_(ds_ids), Record.deleted_at.is_(None))
        )).scalar_one()
    return {"members": members, "datasets": len(ds_ids), "records": records}


async def assert_can(workspace_id, resource: str, db: AsyncSession) -> None:
    """Lanza 402 si la acción excede el plan del workspace.
    resource ∈ {member, dataset, script, api}."""
    if workspace_id is None:
        return  # recursos sin workspace (legacy) no se limitan
    sub = await get_or_create_subscription(workspace_id, db)
    plan = PLANS[effective_plan_key(sub)]

    if resource == "script" and not plan["scripts"]:
        raise HTTPException(status_code=402, detail="Los scripts/datasets calculados requieren el plan Pro o superior.")
    if resource == "api" and not plan["api"]:
        raise HTTPException(status_code=402, detail="Los API tokens y webhooks requieren el plan Pro o superior.")

    if resource in ("member", "dataset"):
        usage = await workspace_usage(workspace_id, db)
        if resource == "member" and plan["max_members"] is not None and usage["members"] >= plan["max_members"]:
            raise HTTPException(status_code=402, detail=f"Alcanzaste el límite de {plan['max_members']} miembros del plan {plan['name']}. Subí de plan para agregar más.")
        if resource == "dataset" and plan["max_datasets"] is not None and usage["datasets"] >= plan["max_datasets"]:
            raise HTTPException(status_code=402, detail=f"Alcanzaste el límite de {plan['max_datasets']} datasets del plan {plan['name']}. Subí de plan para crear más.")

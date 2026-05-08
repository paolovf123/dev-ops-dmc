from __future__ import annotations
import os
import json
import uuid
import boto3
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_, or_, not_
from database import get_db
from models import Dataset, User, Record, ColumnDefinition, DatasetPermission, DatasetGroupPermission, UserGroupMember
from schemas import DatasetCreate, DatasetUpdate, DatasetOut, ComputeResult, ColumnOut
from auth import get_current_user, require_admin, ds_require_editor, ds_require_viewer, effective_workspace_role

router = APIRouter(prefix="/datasets", tags=["datasets"])


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DatasetOut])
async def list_datasets(
    workspace_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws_filter = Dataset.workspace_id == workspace_id if workspace_id else True

    if current_user.role == "admin":
        result = await db.execute(select(Dataset).where(ws_filter).order_by(Dataset.created_at.desc()))
        return result.scalars().all()

    # Non-admin: exclude datasets where effective role would be "none"
    direct_access = Dataset.id.in_(
        select(DatasetPermission.dataset_id).where(
            DatasetPermission.user_id == current_user.id,
            DatasetPermission.role != "none",
        )
    )

    has_direct = Dataset.id.in_(
        select(DatasetPermission.dataset_id).where(
            DatasetPermission.user_id == current_user.id,
        )
    )

    user_group_ids = select(UserGroupMember.group_id).where(
        UserGroupMember.user_id == current_user.id
    )

    group_access = Dataset.id.in_(
        select(DatasetGroupPermission.dataset_id).where(
            DatasetGroupPermission.group_id.in_(user_group_ids),
            DatasetGroupPermission.role != "none",
        )
    )

    has_group_any = Dataset.id.in_(
        select(DatasetGroupPermission.dataset_id).where(
            DatasetGroupPermission.group_id.in_(user_group_ids),
        )
    )

    visible = or_(
        direct_access,
        and_(not_(has_direct), group_access),
        and_(not_(has_direct), not_(has_group_any)),
    )

    result = await db.execute(
        select(Dataset).where(and_(visible, ws_filter)).order_by(Dataset.created_at.desc())
    )
    return result.scalars().all()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _require_ws_manager(user: User, workspace_id: uuid.UUID | None, db: AsyncSession):
    """Permite admin global, o owner/manager del workspace."""
    if user.role == "admin":
        return
    if not workspace_id:
        raise HTTPException(status_code=403, detail="Se requiere workspace para esta operación")
    ws_role = await effective_workspace_role(user, workspace_id, db)
    if ws_role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Requiere rol owner o manager en el workspace")


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=DatasetOut, status_code=201)
async def create_dataset(
    body: DatasetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_ws_manager(current_user, body.workspace_id, db)
    dataset = Dataset(
        name=body.name,
        description=body.description,
        workspace_id=body.workspace_id,
        is_computed=body.is_computed,
        source_code=body.source_code,
        source_dataset_ids=body.source_dataset_ids,
    )
    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)
    return dataset


# ── Update ────────────────────────────────────────────────────────────────────

@router.patch("/{dataset_id}", response_model=DatasetOut)
async def update_dataset(
    dataset_id: uuid.UUID,
    body: DatasetUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    await _require_ws_manager(current_user, dataset.workspace_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(dataset, field, value)
    await db.commit()
    await db.refresh(dataset)
    return dataset


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(
    dataset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    await _require_ws_manager(current_user, dataset.workspace_id, db)
    await db.delete(dataset)
    await db.commit()


# ── Compute (Lambda executor) ─────────────────────────────────────────────────

@router.post("/{dataset_id}/compute", response_model=ComputeResult)
async def compute_dataset(
    dataset_id: uuid.UUID,
    current_user: User = Depends(ds_require_editor),
    db: AsyncSession = Depends(get_db),
):
    ds_result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = ds_result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset no encontrado")
    if not dataset.is_computed:
        raise HTTPException(status_code=400, detail="Este dataset no es calculado")
    if not dataset.source_code or not dataset.source_code.strip():
        raise HTTPException(status_code=400, detail="El dataset no tiene código fuente")
    if not dataset.source_dataset_ids:
        raise HTTPException(status_code=400, detail="El dataset no tiene datasets fuente configurados")

    dataframes: dict[str, list[dict]] = {}
    for src_id_str in dataset.source_dataset_ids:
        src_id = uuid.UUID(src_id_str)
        src_ds_result = await db.execute(select(Dataset).where(Dataset.id == src_id))
        src_ds = src_ds_result.scalar_one_or_none()
        if not src_ds:
            raise HTTPException(status_code=400, detail=f"Dataset fuente {src_id_str} no encontrado")

        records_result = await db.execute(
            select(Record).where(
                Record.dataset_id == src_id,
                Record.deleted_at.is_(None),
            )
        )
        records = records_result.scalars().all()
        df_name = src_ds.name.lower().replace(" ", "_").replace("-", "_")
        df_name = "".join(c if c.isalnum() or c == "_" else "_" for c in df_name)
        dataframes[df_name] = [{"__id__": str(r.id), **r.data} for r in records]

    lambda_arn = os.getenv("LAMBDA_EXECUTOR_ARN")
    if not lambda_arn:
        raise HTTPException(
            status_code=503,
            detail="Lambda executor no configurado. Define la variable de entorno LAMBDA_EXECUTOR_ARN.",
        )

    try:
        client = boto3.client("lambda", region_name=os.getenv("AWS_REGION", "us-east-1"))
        response = client.invoke(
            FunctionName=lambda_arn,
            InvocationType="RequestResponse",
            Payload=json.dumps({"code": dataset.source_code, "dataframes": dataframes}),
        )
        payload_bytes = response["Payload"].read()
        result = json.loads(payload_bytes)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error invocando Lambda: {str(e)}")

    if response.get("FunctionError"):
        detail = result.get("errorMessage", str(result))
        raise HTTPException(status_code=422, detail=f"Error en Lambda: {detail}")

    if result.get("error"):
        raise HTTPException(
            status_code=422,
            detail={"error": result["error"], "traceback": result.get("traceback", "")},
        )

    columns_data: list[dict] = result.get("columns", [])
    records_data: list[dict] = result.get("records", [])

    await db.execute(delete(ColumnDefinition).where(ColumnDefinition.dataset_id == dataset_id))
    await db.execute(delete(Record).where(Record.dataset_id == dataset_id))

    for i, col_def in enumerate(columns_data):
        col = ColumnDefinition(
            dataset_id=dataset_id,
            name=col_def["name"],
            field_key=col_def["field_key"],
            data_type=col_def.get("data_type", "text"),
            position=i,
        )
        db.add(col)

    for rec_data in records_data:
        rec = Record(dataset_id=dataset_id, data=rec_data)
        db.add(rec)

    dataset.last_computed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(dataset)

    return ComputeResult(
        records_created=len(records_data),
        columns_created=len(columns_data),
        last_computed_at=dataset.last_computed_at,
    )

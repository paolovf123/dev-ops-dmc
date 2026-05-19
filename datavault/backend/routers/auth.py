from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, WorkspaceMember
from schemas import UserRegister, UserLogin, UserOut, UserUpdateRole, Token
from auth import (
    verify_password, hash_password, create_access_token, create_ws_ticket,
    get_current_user, require_admin, count_users, effective_workspace_role,
    ACCESS_TOKEN_EXPIRE_HOURS, COOKIE_NAME, COOKIE_SAMESITE, COOKIE_SECURE,
)
from models import ChangeHistory, Record, Dataset
from limiter import limiter
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=ACCESS_TOKEN_EXPIRE_HOURS * 3600,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )

VALID_ROLES = {"admin", "editor", "viewer"}


@router.post("/register", response_model=Token, status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, response: Response, body: UserRegister, db: AsyncSession = Depends(get_db)):
    # Check email unique
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    total = await count_users(db)
    is_first = total == 0
    role = "admin" if is_first else "viewer"

    user = User(
        email=body.email.lower().strip(),
        username=body.username.strip(),
        hashed_password=hash_password(body.password),
        role=role,
        is_active=is_first,  # solo el primer usuario queda activo automáticamente
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    _set_auth_cookie(response, token)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, response: Response, body: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    _set_auth_cookie(response, token)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.post("/ws-ticket")
async def issue_ws_ticket(current_user: User = Depends(get_current_user)):
    """Devuelve un JWT efímero (60s) usado como primer mensaje del WebSocket.

    Sirve para autenticar el handshake del WS sin exponer el token de sesión
    al JavaScript (la cookie es httpOnly y no es legible desde el cliente).
    """
    return {"ticket": create_ws_ticket(str(current_user.id))}


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


# ── Admin: manage users ───────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserOut])
async def list_users(
    workspace_id: uuid.UUID | None = None,
    list_all: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == "admin":
        result = await db.execute(select(User).order_by(User.created_at))
        return result.scalars().all()

    # Owner/admin_ws puede listar todos los usuarios para agregar a su workspace
    if list_all:
        managed = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.user_id == current_user.id,
                WorkspaceMember.role.in_(["owner", "admin_ws"]),
            )
        )
        if not managed.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Solo owner o admin_ws pueden listar todos los usuarios")
        result = await db.execute(select(User).order_by(User.created_at))
        return result.scalars().all()

    # Workspace owner/admin_ws: devuelve solo miembros de ese workspace
    if workspace_id is None:
        raise HTTPException(status_code=403, detail="Se requiere workspace_id, list_all=true, o rol admin")
    ws_role = await effective_workspace_role(current_user, workspace_id, db)
    if ws_role not in ("owner", "admin_ws"):
        raise HTTPException(status_code=403, detail="Solo owner o admin_ws pueden listar usuarios del workspace")

    result = await db.execute(
        select(User)
        .join(WorkspaceMember, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(User.created_at)
    )
    return result.scalars().all()


@router.patch("/users/{user_id}/role", response_model=UserOut)
async def update_role(
    user_id: uuid.UUID,
    body: UserUpdateRole,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Rol inválido. Opciones: {', '.join(VALID_ROLES)}")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Prevent removing last admin
    if user.role == "admin" and body.role != "admin":
        admins = await db.execute(select(User).where(User.role == "admin", User.is_active == True))
        if len(admins.scalars().all()) <= 1:
            raise HTTPException(status_code=400, detail="No se puede quitar el rol al único administrador")

    user.role = body.role
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}/deactivate", response_model=UserOut)
async def deactivate_user(
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_active = False
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}/activate", response_model=UserOut)
async def activate_user(
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_active = True
    await db.commit()
    await db.refresh(user)
    return user


# ── Audit log ─────────────────────────────────────────────────────────────────

@router.get("/audit")
async def audit_log(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    dataset_id: str | None = None,
    workspace_id: str | None = None,
    user_id: str | None = None,
    action: str | None = None,
):
    from sqlalchemy import func as sqlfunc
    stmt = (
        select(ChangeHistory, Record.dataset_id.label("dataset_id"), Dataset.name.label("dataset_name"))
        .join(Record, ChangeHistory.record_id == Record.id)
        .join(Dataset, Record.dataset_id == Dataset.id)
    )
    if dataset_id:
        stmt = stmt.where(Record.dataset_id == uuid.UUID(dataset_id))
    if workspace_id:
        stmt = stmt.where(Dataset.workspace_id == uuid.UUID(workspace_id))
    if user_id:
        stmt = stmt.where(ChangeHistory.user_id == uuid.UUID(user_id))
    if action:
        stmt = stmt.where(ChangeHistory.action == action)

    count_stmt = select(sqlfunc.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(ChangeHistory.changed_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).all()

    return {
        "total": total,
        "items": [
            {
                "id": str(h.id),
                "record_id": str(h.record_id),
                "dataset_id": str(ds_id),
                "dataset_name": ds_name,
                "field_key": h.field_key,
                "old_value": h.old_value,
                "new_value": h.new_value,
                "action": h.action,
                "changed_at": h.changed_at.isoformat(),
                "user_id": str(h.user_id) if h.user_id else None,
                "user_name": h.user_name,
            }
            for h, ds_id, ds_name in rows
        ],
    }

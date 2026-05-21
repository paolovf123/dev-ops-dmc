import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, WorkspaceMember, ChangeHistory, Record, Dataset
from schemas import UserRegister, UserLogin, UserOut, UserUpdateRole, Token
from auth import (
    verify_password, hash_password, create_access_token, create_ws_ticket,
    get_current_user, require_admin, count_users, effective_workspace_role,
    ACCESS_TOKEN_EXPIRE_HOURS, COOKIE_NAME, COOKIE_SAMESITE, COOKIE_SECURE,
    create_refresh_token, revoke_token, is_token_revoked, decode_token,
    REFRESH_COOKIE_NAME, REFRESH_TOKEN_EXPIRE_DAYS,
)
from limiter import limiter

logger = logging.getLogger("datavault.auth")
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


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/auth/refresh",
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
    refresh_token, _ = create_refresh_token(str(user.id))
    _set_auth_cookie(response, token)
    _set_refresh_cookie(response, refresh_token)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, response: Response, body: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        logger.warning("login_failed email=%s", body.email.lower())
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    if not user.is_active:
        logger.warning("login_inactive user_id=%s", user.id)
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    refresh_token, _ = create_refresh_token(str(user.id))
    _set_auth_cookie(response, token)
    _set_refresh_cookie(response, refresh_token)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/logout")
async def logout(request: Request, response: Response):
    refresh_cookie = request.cookies.get(REFRESH_COOKIE_NAME)
    if refresh_cookie:
        payload = decode_token(refresh_cookie)
        if payload and payload.get("scope") == "refresh":
            jti = payload.get("jti")
            if jti:
                exp = payload.get("exp", 0)
                remaining = int(exp - datetime.now(timezone.utc).timestamp())
                await revoke_token(jti, max(remaining, 1))
    response.delete_cookie(COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/auth/refresh")
    return {"ok": True}


@router.post("/refresh", response_model=Token)
@limiter.limit("30/minute")
async def refresh_tokens(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    refresh_cookie = request.cookies.get(REFRESH_COOKIE_NAME)
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido o expirado")
    if not refresh_cookie:
        raise exc
    payload = decode_token(refresh_cookie)
    if not payload or payload.get("scope") != "refresh":
        raise exc
    jti = payload.get("jti")
    if jti and await is_token_revoked(jti):
        raise exc
    try:
        user_uuid = uuid.UUID(payload.get("sub", ""))
    except ValueError:
        raise exc
    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise exc
    if jti:
        exp = payload.get("exp", 0)
        remaining = int(exp - datetime.now(timezone.utc).timestamp())
        await revoke_token(jti, max(remaining, 1))
    new_token = create_access_token({"sub": str(user.id), "role": user.role})
    new_refresh, _ = create_refresh_token(str(user.id))
    _set_auth_cookie(response, new_token)
    _set_refresh_cookie(response, new_refresh)
    logger.info("token_refreshed user_id=%s", user.id)
    return Token(access_token=new_token, user=UserOut.model_validate(user))


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
    logger.info("role_changed user_id=%s new_role=%s by=%s", user.id, body.role, current_user.id)
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
    logger.info("user_deactivated user_id=%s by=%s", user.id, current_user.id)
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
    logger.info("user_activated user_id=%s by=%s", user.id, current_user.id)
    return user


# ── Bulk import users from Excel ─────────────────────────────────────────────

@router.post("/users/import-excel")
@limiter.limit("5/minute")
async def import_users_excel(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    import openpyxl, io, secrets, string

    allowed_mime = {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/octet-stream",
    }
    if file.content_type and file.content_type not in allowed_mime:
        raise HTTPException(status_code=400, detail="El archivo debe ser .xlsx")
    if file.filename and not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="El archivo debe tener extensión .xlsx")

    MAX_BYTES = 5 * 1024 * 1024
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_BYTES:
            raise HTTPException(status_code=413, detail="Archivo demasiado grande (límite 5 MB)")
        chunks.append(chunk)

    try:
        wb = openpyxl.load_workbook(io.BytesIO(b"".join(chunks)), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Archivo Excel inválido o corrupto")

    ws_sheet = wb.active
    rows = list(ws_sheet.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    headers = [str(h).lower().strip() if h else "" for h in rows[0]]
    if "email" not in headers:
        raise HTTPException(status_code=400, detail="El archivo debe tener una columna 'email'")
    if "username" not in headers:
        raise HTTPException(status_code=400, detail="El archivo debe tener una columna 'username'")

    email_idx    = headers.index("email")
    username_idx = headers.index("username")
    password_idx = headers.index("password") if "password" in headers else None
    role_idx     = headers.index("role")     if "role"     in headers else None

    def _gen_password() -> str:
        chars = string.ascii_letters + string.digits + "!@#$%"
        return "".join(secrets.choice(chars) for _ in range(12))

    created = 0
    skipped = 0
    errors: list[dict] = []

    for i, row in enumerate(rows[1:], start=2):
        row_list = list(row)

        email_raw    = row_list[email_idx]    if email_idx    < len(row_list) else None
        username_raw = row_list[username_idx] if username_idx < len(row_list) else None

        if not email_raw or not username_raw:
            errors.append({"row": i, "error": "email y username son requeridos"})
            continue

        email    = str(email_raw).strip().lower()
        username = str(username_raw).strip()

        if not email or not username:
            errors.append({"row": i, "error": "email y username no pueden estar vacíos"})
            continue

        existing_result = await db.execute(select(User).where(User.email == email))
        if existing_result.scalar_one_or_none():
            skipped += 1
            continue

        password = None
        if password_idx is not None and password_idx < len(row_list) and row_list[password_idx]:
            password = str(row_list[password_idx]).strip() or None
        if not password:
            password = _gen_password()

        role = "viewer"
        if role_idx is not None and role_idx < len(row_list) and row_list[role_idx]:
            r = str(row_list[role_idx]).strip().lower()
            if r in VALID_ROLES:
                role = r

        try:
            user = User(
                email=email,
                username=username,
                hashed_password=hash_password(password),
                role=role,
                is_active=False,
            )
            db.add(user)
            await db.flush()
            created += 1
        except Exception as exc:
            errors.append({"row": i, "error": str(exc)})

    if created > 0:
        await db.commit()
        logger.info("users_imported_excel count=%s by=%s", created, current_user.id)
    else:
        await db.rollback()

    return {"created": created, "skipped": skipped, "errors": errors}


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

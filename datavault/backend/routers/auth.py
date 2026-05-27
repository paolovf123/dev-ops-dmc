import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, WorkspaceMember, ChangeHistory, Record, Dataset, DatasetPermission, DatasetGroupPermission, UserGroup, UserGroupMember, Workspace
from pydantic import BaseModel
from schemas import UserRegister, UserLogin, UserOut, UserUpdateRole, Token
from auth import (
    verify_password, hash_password, create_access_token, create_ws_ticket,
    get_current_user, require_admin, count_users, effective_workspace_role,
    effective_role, WS_ROLE_TO_DS_ROLE, DS_ROLE_RANK,
    ACCESS_TOKEN_EXPIRE_HOURS, COOKIE_NAME, COOKIE_SAMESITE, COOKIE_SECURE,
    create_refresh_token, revoke_token, is_token_revoked, decode_token,
    REFRESH_COOKIE_NAME, REFRESH_TOKEN_EXPIRE_DAYS,
    email_domain_allowed, create_invite_token, decode_invite_token,
    PUBLIC_APP_URL, ALLOWED_EMAIL_DOMAINS,
)
from limiter import limiter
from email_util import send_email, smtp_configured
import secrets

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

    # Auto-activación si el email pertenece a un dominio corporativo permitido
    auto_activated_by_domain = email_domain_allowed(body.email.lower().strip())

    user = User(
        email=body.email.lower().strip(),
        username=body.username.strip(),
        hashed_password=hash_password(body.password),
        role=role,
        is_active=is_first or auto_activated_by_domain,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    refresh_token, _ = create_refresh_token(str(user.id))
    _set_auth_cookie(response, token)
    _set_refresh_cookie(response, refresh_token)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.get("/signup-config")
async def signup_config():
    """Devuelve dominios de email auto-aceptados para mostrar hint en la pantalla de registro."""
    return {
        "allowed_email_domains": sorted(ALLOWED_EMAIL_DOMAINS),
        "smtp_configured": smtp_configured(),
    }


@router.post("/invite", status_code=201)
@limiter.limit("30/minute")
async def invite_user(
    request: Request,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invita a un nuevo usuario. Crea la cuenta activa con una contraseña aleatoria
    y devuelve (o envía por email) un link de un solo uso para que establezca la suya.
    Permisos: admin global o owner/admin_ws de algún workspace.
    """
    email = (body.get("email") or "").strip().lower()
    username = (body.get("username") or "").strip() or email.split("@")[0]
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Email inválido")

    # Autorización: admin global o cualquier owner/admin_ws
    if current_user.role != "admin":
        memberships = (await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.user_id == current_user.id,
                WorkspaceMember.role.in_(("owner", "admin_ws")),
            )
        )).scalars().all()
        if not memberships:
            raise HTTPException(status_code=403, detail="Solo admins o owners de workspace pueden invitar")

    # ¿Ya existe?
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        # Si existe pero inactivo, reenvía link para activar; si activo, error
        if existing.is_active:
            raise HTTPException(status_code=400, detail="El usuario ya existe y está activo")
        user = existing
    else:
        user = User(
            email=email,
            username=username,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            role="viewer",
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_invite_token(str(user.id))
    link = f"{PUBLIC_APP_URL}/set-password?token={token}"

    sent = False
    if smtp_configured():
        sent = send_email(
            to=email,
            subject="Te invitaron a OpsGrid",
            body_text=(
                f"Hola,\n\n"
                f"Fuiste invitado a OpsGrid por {current_user.username or current_user.email}.\n"
                f"Para activar tu cuenta y definir tu contraseña, abre este link:\n\n{link}\n\n"
                f"El link expira en 72 horas."
            ),
            body_html=(
                f"<p>Hola,</p>"
                f"<p>Fuiste invitado a <b>OpsGrid</b> por <b>{current_user.username or current_user.email}</b>.</p>"
                f"<p><a href='{link}' style='background:#0EA5E9;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600'>Activar cuenta</a></p>"
                f"<p style='color:#64748B;font-size:12px'>El link expira en 72 horas.</p>"
            ),
        )

    return {
        "user_id": str(user.id),
        "email": user.email,
        "invite_link": link,
        "email_sent": sent,
    }


@router.post("/set-password")
@limiter.limit("10/minute")
async def set_password_with_invite(
    request: Request,
    response: Response,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Establece la contraseña usando un token de invitación de un solo uso."""
    token = (body.get("token") or "").strip()
    password = body.get("password") or ""
    if not token:
        raise HTTPException(status_code=400, detail="Token requerido")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    user_id = decode_invite_token(token)
    if not user_id:
        raise HTTPException(status_code=400, detail="Token inválido o expirado")

    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Token inválido")

    user = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    user.hashed_password = hash_password(password)
    user.is_active = True
    await db.commit()
    await db.refresh(user)

    # Auto-login
    access = create_access_token({"sub": str(user.id), "role": user.role})
    refresh, _ = create_refresh_token(str(user.id))
    _set_auth_cookie(response, access)
    _set_refresh_cookie(response, refresh)
    return Token(access_token=access, user=UserOut.model_validate(user))


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
    def _parse_uuid(val: str, field: str):
        try:
            return uuid.UUID(val)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"{field} inválido (no es un UUID)")
    if dataset_id:
        stmt = stmt.where(Record.dataset_id == _parse_uuid(dataset_id, "dataset_id"))
    if workspace_id:
        stmt = stmt.where(Dataset.workspace_id == _parse_uuid(workspace_id, "workspace_id"))
    if user_id:
        stmt = stmt.where(ChangeHistory.user_id == _parse_uuid(user_id, "user_id"))
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


# ── Matriz invertida: datasets accesibles por usuario ─────────────────────────

class UserDatasetAccessOut(BaseModel):
    dataset_id: uuid.UUID
    dataset_name: str
    workspace_id: uuid.UUID | None
    workspace_name: str | None
    role: str   # rol efectivo: admin/editor/viewer
    source: str # "global_admin" | "direct" | "group:<name>" | "workspace:<role>"
    is_bridge: bool = False


@router.get("/users/{user_id}/dataset-access", response_model=list[UserDatasetAccessOut])
async def list_user_dataset_access(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista todos los datasets a los que el usuario tiene rol efectivo distinto de 'none'.
    Calcula el rol via prioridad: admin global > directo > grupo > workspace.
    Visible para: el propio usuario, admin global, o owner/admin_ws del workspace."""
    # Buscar al usuario destino
    u_res = await db.execute(select(User).where(User.id == user_id))
    target = u_res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Permisos para ver
    if current_user.role != "admin" and current_user.id != target.id:
        # Owner/admin_ws de algún workspace donde el target sea miembro
        ok = False
        member_rows = await db.execute(
            select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == target.id)
        )
        target_ws_ids = [r[0] for r in member_rows.all()]
        for ws_id in target_ws_ids:
            ws_role = await effective_workspace_role(current_user, ws_id, db)
            if ws_role in ("owner", "admin_ws"):
                ok = True
                break
        if not ok:
            raise HTTPException(status_code=403, detail="Sin permiso para ver los accesos de este usuario")

    # Cargar workspaces nombres (lookup)
    ws_rows = await db.execute(select(Workspace))
    ws_name_map = {w.id: w.name for w in ws_rows.scalars().all()}

    # Caso 1: admin global → todos los datasets con rol "admin"
    if target.role == "admin":
        ds_rows = await db.execute(select(Dataset).order_by(Dataset.name))
        return [
            UserDatasetAccessOut(
                dataset_id=d.id, dataset_name=d.name,
                workspace_id=d.workspace_id,
                workspace_name=ws_name_map.get(d.workspace_id) if d.workspace_id else None,
                role="admin", source="global_admin",
                is_bridge=d.is_bridge,
            )
            for d in ds_rows.scalars().all()
        ]

    # Caso 2: usuario normal — combinar permisos directos, de grupo y workspace.
    out_by_ds: dict[uuid.UUID, UserDatasetAccessOut] = {}

    # 2a. Permisos directos
    direct_rows = await db.execute(
        select(DatasetPermission, Dataset)
        .join(Dataset, DatasetPermission.dataset_id == Dataset.id)
        .where(DatasetPermission.user_id == target.id)
    )
    for perm, ds in direct_rows.all():
        if perm.role == "none":
            # Bloqueo explícito → registramos como "sin acceso" para que sea visible
            out_by_ds[ds.id] = UserDatasetAccessOut(
                dataset_id=ds.id, dataset_name=ds.name,
                workspace_id=ds.workspace_id,
                workspace_name=ws_name_map.get(ds.workspace_id) if ds.workspace_id else None,
                role="none", source="direct",
                is_bridge=ds.is_bridge,
            )
        else:
            out_by_ds[ds.id] = UserDatasetAccessOut(
                dataset_id=ds.id, dataset_name=ds.name,
                workspace_id=ds.workspace_id,
                workspace_name=ws_name_map.get(ds.workspace_id) if ds.workspace_id else None,
                role=perm.role, source="direct",
                is_bridge=ds.is_bridge,
            )

    # 2b. Permisos de grupo (solo se aplican si NO hay permiso directo)
    group_rows = await db.execute(
        select(DatasetGroupPermission, Dataset, UserGroup)
        .join(Dataset, DatasetGroupPermission.dataset_id == Dataset.id)
        .join(UserGroup, DatasetGroupPermission.group_id == UserGroup.id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(UserGroupMember.user_id == target.id)
    )
    for perm, ds, grp in group_rows.all():
        if ds.id in out_by_ds and out_by_ds[ds.id].source == "direct":
            continue  # directo gana
        existing = out_by_ds.get(ds.id)
        if existing is None or DS_ROLE_RANK.get(perm.role, 0) > DS_ROLE_RANK.get(existing.role, 0):
            out_by_ds[ds.id] = UserDatasetAccessOut(
                dataset_id=ds.id, dataset_name=ds.name,
                workspace_id=ds.workspace_id,
                workspace_name=ws_name_map.get(ds.workspace_id) if ds.workspace_id else None,
                role=perm.role, source=f"group:{grp.name}",
                is_bridge=ds.is_bridge,
            )

    # 2c. Datasets en workspaces donde el usuario es miembro (si no tiene ya permiso)
    ws_member_rows = await db.execute(
        select(WorkspaceMember).where(WorkspaceMember.user_id == target.id)
    )
    for wm in ws_member_rows.scalars().all():
        ws_role_ds = WS_ROLE_TO_DS_ROLE.get(wm.role, "viewer")
        ds_in_ws = await db.execute(
            select(Dataset).where(Dataset.workspace_id == wm.workspace_id)
        )
        for ds in ds_in_ws.scalars().all():
            if ds.id in out_by_ds:
                continue  # directo o grupo ya decidió
            out_by_ds[ds.id] = UserDatasetAccessOut(
                dataset_id=ds.id, dataset_name=ds.name,
                workspace_id=ds.workspace_id,
                workspace_name=ws_name_map.get(ds.workspace_id) if ds.workspace_id else None,
                role=ws_role_ds, source=f"workspace:{wm.role}",
                is_bridge=ds.is_bridge,
            )

    # Excluir los "none" del listado (son bloqueos explícitos sin acceso)
    visible = [v for v in out_by_ds.values() if v.role != "none"]
    visible.sort(key=lambda x: (x.workspace_name or "", x.dataset_name))
    return visible

# DataVault — Mejoras pendientes

Roadmap de mejoras detectadas en la revisión del 2026-05-18.

Los HIGH se implementaron en la sesión del 2026-05-18 (commit pendiente).
Este documento agrupa lo que **queda**: 4 críticos, 10 medios, 4 bajos.

---

## 🔴 CRÍTICOS (4)

### C1 · JWT `SECRET_KEY` con fallback público

- **Archivo**: `backend/auth.py:17`
- **Problema**: `SECRET_KEY = os.getenv("SECRET_KEY", "datavault-secret-change-in-production-xyz-123")`. Si en producción se olvida configurar la env var, se usa una clave que está en el repo público.
- **Impacto**: Cualquiera con acceso al código puede falsificar JWTs válidos.
- **Solución**:
  ```python
  SECRET_KEY = os.getenv("SECRET_KEY")
  if not SECRET_KEY:
      raise RuntimeError("SECRET_KEY environment variable must be set")
  if len(SECRET_KEY) < 32:
      raise RuntimeError("SECRET_KEY debe tener al menos 32 caracteres")
  ```
- **Pasos**:
  1. Generar secret con `openssl rand -hex 32`.
  2. Agregarlo a SSM/Secrets Manager y exponerlo a ECS task definition.
  3. Remover el fallback del código.
  4. Actualizar `.env` (dev) y `.env.example` con un valor de ejemplo claramente marcado como dev.

---

### C2 · CORS sin validación en producción

- **Archivo**: `backend/main.py:54`
- **Problema**: `allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")]`. Si `ALLOWED_ORIGINS` queda sin definir en producción, se permite localhost (no crítico pero indicador de mal config). El verdadero peligro: si alguien define `ALLOWED_ORIGINS=*` por accidente, FastAPI lo acepta.
- **Impacto**: CSRF, exposición de credenciales (la cookie httpOnly viaja en cualquier request cross-origin que el navegador autorice).
- **Solución**:
  ```python
  allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
  if IS_PRODUCTION and not allowed_origins:
      raise RuntimeError("ALLOWED_ORIGINS debe estar configurado en producción")
  if "*" in allowed_origins:
      raise RuntimeError("ALLOWED_ORIGINS=* no es compatible con allow_credentials=True")
  if not allowed_origins:
      allowed_origins = ["http://localhost:5173"]  # dev fallback
  ```

---

### C3 · Lambda `exec()` sin sandbox real

- **Archivo**: `lambda/executor/handler.py:83-105`
- **Problema**: el handler restringe `__builtins__` pero:
  - No hay timeout interno: loops infinitos cuelgan la Lambda hasta el timeout AWS de 15min.
  - No hay validación AST: el código puede usar pandas/numpy para leer filesystem.
  - Memory bombs (`[0]*10**9`) tumban la función sin diagnóstico.
- **Impacto**: DoS, consumo de recursos AWS sin tope, posible escalada si el rol de la Lambda es amplio.
- **Solución (capas)**:
  1. **Timeout interno**:
     ```python
     import signal
     def _timeout(_signum, _frame):
         raise TimeoutError("Code execution exceeded 60s")
     signal.signal(signal.SIGALRM, _timeout)
     signal.alarm(60)
     try:
         exec(compile(code, "<computed_dataset>", "exec"), namespace)
     finally:
         signal.alarm(0)
     ```
  2. **AST validation**: rechazar `import os`, `import subprocess`, `open()`, `__import__`, atributos que empiecen con `_`:
     ```python
     import ast
     FORBIDDEN_NAMES = {"os", "subprocess", "sys", "socket", "shutil", "pathlib"}
     tree = ast.parse(code)
     for node in ast.walk(tree):
         if isinstance(node, (ast.Import, ast.ImportFrom)):
             for alias in node.names:
                 root = alias.name.split(".")[0]
                 if root in FORBIDDEN_NAMES:
                     raise ValueError(f"Import prohibido: {alias.name}")
         if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
             raise ValueError(f"Atributo privado prohibido: {node.attr}")
     ```
  3. **Resource limits** (efectivos en container Lambda):
     ```python
     import resource
     resource.setrlimit(resource.RLIMIT_AS, (1_500_000_000, 1_500_000_000))  # 1.5 GB
     ```
  4. **Reducir permisos IAM** del rol Lambda al mínimo (sin S3, sin DynamoDB salvo lo necesario).
- **Tests**: agregar fixtures de payloads maliciosos (loop infinito, `open('/etc/passwd')`, memory bomb) y verificar que retornan error sin ejecutar.

---

### C4 · JWT 24h sin refresh ni revocación (parcial)

- **Archivos**: `backend/auth.py:19`, `backend/routers/auth.py`
- **Estado**: el HIGH-12 movió el token a cookie httpOnly (mitiga XSS). Falta:
  - Ventana de validez sigue siendo 24h.
  - No hay refresh tokens.
  - No hay forma de revocar una sesión activa (cambio de password no invalida tokens emitidos).
- **Solución (mínima)**:
  1. Reducir `ACCESS_TOKEN_EXPIRE_HOURS` a 1.
  2. Agregar refresh token (JWT 7-30 días, almacenado en otra cookie httpOnly path-scoped a `/auth/refresh`):
     ```python
     REFRESH_TOKEN_EXPIRE_DAYS = 14
     # Al login: emitir access (1h) + refresh (14d)
     # /auth/refresh: valida refresh, emite nuevo access
     ```
  3. **Revocación con Redis** (ya tenemos infra Redis para rate limiting):
     - Al cambiar password / desactivar usuario / logout explícito: agregar `user_id` o `jti` a `revoked:{jti}` con TTL = vida restante del token.
     - `get_current_user` verifica el set en cada request (1 GET a Redis, costo bajo).
- **Tests**:
  - Refresh con token expirado → 401.
  - Token revocado → 401 incluso si aún no expira.
  - Login emite ambos tokens, logout limpia ambos.

---

## 🟡 MEDIOS (10)

### M16 · Cobertura de tests insuficiente en permisos

- **Archivos**: `backend/tests/` (solo ~301 líneas)
- **Problema**: no hay tests para `effective_role`, `list_datasets` (la nueva lógica de capas), `_validate_source_datasets`, audit log filtering.
- **Riesgo**: cambios en lógica de permisos no se detectan → privilege escalation.
- **Solución**: crear `tests/test_permissions.py` con matriz exhaustiva:
  - Admin global → ve todo.
  - User sin permisos en workspace → no ve nada.
  - Permiso directo `none` overridea permiso de grupo `editor`.
  - Permiso de grupo `editor` aplica si no hay directo.
  - Workspace membership da acceso sin permiso explícito.
  - Dataset huérfano (sin workspace) solo lo ven admins/editores globales.
  - source_dataset_ids: ciclos, self-ref, IDs inexistentes, IDs sin acceso.

---

### M17 · Migración Alembic con downgrade frágil

- **Archivo**: `backend/alembic/versions/d4e8f1a2b3c5_add_workspaces.py:46-58`
- **Problema**: el downgrade dropea constraint asumiendo que no hay grupos con nombre duplicado entre workspaces. Si existen, falla.
- **Solución**: validar antes de aplicar:
  ```python
  def downgrade() -> None:
      conn = op.get_bind()
      dupes = conn.execute(text(
          "SELECT name, COUNT(DISTINCT workspace_id) "
          "FROM user_groups GROUP BY name HAVING COUNT(DISTINCT workspace_id) > 1"
      )).fetchall()
      if dupes:
          raise RuntimeError(f"No se puede hacer downgrade: nombres duplicados {dupes}")
      op.drop_constraint('uq_user_group_name_workspace', 'user_groups', type_='unique')
      op.create_unique_constraint('user_groups_name_key', 'user_groups', ['name'])
  ```

---

### M18 · WebSocket no revalida permisos después del handshake

- **Archivo**: `backend/main.py:80-101`
- **Problema**: el WS valida el JWT al conectar y nunca más. Si desactivan al usuario o revocan sus permisos sobre el dataset, sigue recibiendo updates hasta que se desconecte.
- **Solución**: revalidación periódica:
  ```python
  async def _periodic_recheck(websocket, user_id, dataset_id, db):
      while True:
          await asyncio.sleep(30)
          user = await db.get(User, user_id)
          if not user or not user.is_active:
              await websocket.close(code=4003)
              return
          role = await effective_role(user, dataset_id, db)
          if role in (None, "none"):
              await websocket.close(code=4003)
              return
  ```
  Lanzar la corutina con `asyncio.create_task` después del handshake.

---

### M19 · Dockerfile dev corre como root

- **Archivo**: `backend/Dockerfile` (vs `backend/Dockerfile.prod:16` que sí usa appuser)
- **Solución**:
  ```dockerfile
  FROM python:3.11-slim
  RUN addgroup --system appgroup && adduser --system --group appuser
  WORKDIR /app
  COPY --chown=appuser:appgroup requirements.txt .
  RUN pip install --no-cache-dir -r requirements.txt
  COPY --chown=appuser:appgroup . .
  USER appuser
  CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
  ```

---

### M20 · `nginx.conf` cachea `index.html`

- **Archivo**: `frontend/nginx.conf:14-18`
- **Problema**: static assets cacheados 6 meses, pero `index.html` también si no se excluye. Resultado: clientes ven JS viejo después de un deploy.
- **Solución**:
  ```nginx
  location = /index.html {
      add_header Cache-Control "no-cache, no-store, must-revalidate";
      expires off;
  }
  location ~* \.(js|css)$ {
      add_header Cache-Control "public, max-age=31536000, immutable";
  }
  ```
  Vite ya genera nombres hasheados (`app-abc123.js`), así que el `immutable` es seguro.

---

### M21 · No hay audit log de cambios de permisos

- **Archivos**: `backend/models.py:150` (ChangeHistory solo cubre records), `routers/permissions.py`, `routers/groups.py`
- **Problema**: si un admin quita acceso a un dataset, no queda registro.
- **Solución**: nuevo modelo + migración:
  ```python
  class PermissionAuditLog(Base):
      __tablename__ = "permission_audit_logs"
      id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
      dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("datasets.id"))
      target_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
      target_group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user_groups.id"))
      old_role: Mapped[str | None]
      new_role: Mapped[str]
      changed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
      changed_at: Mapped[datetime] = mapped_column(default=utcnow)
  ```
  Y registrar desde los endpoints `PUT/DELETE /datasets/{id}/permissions` y `/permissions/groups`.

---

### M22 · Paginación inconsistente

- **Archivos**: `routers/records.py:66` (`le=1000`), `routers/columns.py:21` (`le=500`)
- **Solución**: extraer constantes a `backend/pagination.py` y usar las mismas en todos los routers:
  ```python
  MAX_PAGE_SIZE = 500
  DEFAULT_PAGE_SIZE = 50
  ```

---

### M23 · CSV/Excel headers sin sanitizar

- **Archivo**: `routers/records.py:273` (línea aproximada, ahora en `import_excel`)
- **Problema**: los headers del archivo se mapean a `field_key` pero no se sanitizan; un header malicioso puede contener caracteres raros que rompan luego al exportar JSON.
- **Solución**: validar `field_key` al crearlo (en `routers/columns.py`):
  ```python
  import re
  FIELD_KEY_RE = re.compile(r'^[a-z0-9_]{1,64}$')
  if not FIELD_KEY_RE.match(body.field_key):
      raise HTTPException(400, "field_key debe ser [a-z0-9_]{1,64}")
  ```
  Y en el import, comparar headers ya normalizados contra los `field_key` existentes.

---

### M24 · Logging estructurado incompleto

- **Archivos**: routers en general
- **Problema**: solo `main.py`, `records.py`, `datasets.py` tienen logger. Faltan auth, permissions, groups, workspaces. Sin logs de seguridad (login fallido, 403, cambio de permisos).
- **Solución**:
  - `logger = logging.getLogger("datavault.<router>")` en cada router.
  - Eventos clave a loggear:
    - Login fallido (warning con email + IP).
    - 403 forbidden (warning con user_id + recurso).
    - Cambios de permisos (info).
    - Bulk operations (info con count).
  - Usar formato JSON en producción para que CloudWatch los indexe:
    ```python
    if IS_PRODUCTION:
        from pythonjsonlogger import jsonlogger
        handler = logging.StreamHandler()
        handler.setFormatter(jsonlogger.JsonFormatter())
        logging.root.handlers = [handler]
    ```

---

### M25 · `email: str` sin `EmailStr`

- **Archivo**: `backend/schemas.py:10,16`
- **Problema**: acepta cualquier string como email; no validamos formato.
- **Solución**:
  1. Agregar `email-validator==2.2.0` a `requirements.txt`.
  2. En schemas:
     ```python
     from pydantic import EmailStr
     class UserRegister(BaseModel):
         email: EmailStr
         ...
     ```
  3. Rebuild de la imagen Docker del backend.

---

## 🟢 BAJOS (4)

### B26 · Scripts de mantenimiento mezclados con código de app

- **Archivos**: `backend/seed_*.py`, `backend/reset_*.py`, `backend/check_*.py`, `backend/verify_*.py`
- **Solución**: mover a `backend/scripts/`. Riesgo bajo de ejecución accidental en prod.

### B27 · Falta `.env.example`

- **Solución**: copiar `.env` a `.env.example` y reemplazar valores sensibles por placeholders (`SECRET_KEY=<openssl rand -hex 32>`).

### B28 · Source maps en build de producción

- **Archivo**: `frontend/vite.config.ts`
- **Solución**:
  ```typescript
  build: {
      sourcemap: process.env.NODE_ENV !== 'production',
  }
  ```

### B29 · Tipos TS desincronizados de Pydantic

- **Archivos**: `frontend/src/types.ts` vs `backend/schemas.py`
- **Solución**: generar tipos desde el OpenAPI schema del backend:
  ```bash
  npx openapi-typescript http://localhost:8000/openapi.json -o src/api/generated.ts
  ```
  Agregar un script `npm run gen:types` y correrlo en CI antes del build.

---

## Orden recomendado para retomar

1. **C1** (1h) — secreto JWT obligatorio. Trivial, máximo impacto.
2. **C2** (30min) — CORS validado en prod.
3. **C4** (4-6h) — refresh tokens + revocación Redis. Toca backend + frontend.
4. **C3** (1d) — sandbox Lambda. AST + signal.alarm + IAM trimming.
5. **M16** (1d) — tests de permisos. Sin esto no hay confianza para iterar.
6. **M21** (4h) — audit log de permisos.
7. **M18** (3h) — revalidación periódica del WS.
8. **M25** (30min) — `EmailStr`.
9. **M22, M23, M24, M19, M20, M17** — limpieza, 1-2h cada uno.
10. **B26-B29** — al final, agrupar en un solo PR de housekeeping.

**Estimado total**: ~5-7 días de trabajo enfocado.

---

## Notas sobre lo ya implementado (2026-05-18)

Ver commits con prefijo `feat(security):` o `fix(security):` desde 2026-05-18:

- HIGH-6/7: bulk_delete con `BulkDeleteBody` (Pydantic) + transacción atómica
- HIGH-8: rate limiting en writes y compute
- HIGH-9/13: import_excel con stream-bounded read (10MB) + validación MIME + transacción
- HIGH-10: middleware de security headers (HSTS, X-Frame-Options, etc.)
- HIGH-11: `_validate_source_datasets` en create/update/compute (acceso + no auto-ref + existencia)
- HIGH-12: JWT en cookie httpOnly + `/auth/logout` + `/auth/ws-ticket` efímero (60s)
- HIGH-14: migración `f7a8b9c0d1e2_performance_indexes` (10 índices)
- HIGH-15: `list_datasets` reescrito con capas explícitas (directo > grupo > workspace)
- Crítico-4 (bonus): WebSocket dejó de silenciar errores

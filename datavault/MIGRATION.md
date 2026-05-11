# TransExcel — Guía de migración

> Documento para reubicar el proyecto a otra carpeta o máquina desde cero.
> Mantener actualizado ante cambios de estructura, dependencias o modelo de datos.
>
> **Última actualización:** 2026-05-11

---

## Stack completo

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Backend | Python + FastAPI (async) | 3.11 / 0.115 |
| Base de datos | PostgreSQL | 16 |
| ORM / Migraciones | SQLAlchemy async + Alembic | 2.0 / 1.13 |
| Auth | JWT (python-jose) + bcrypt (passlib) | 3.3 / 1.7.4 — **bcrypt fijado en 4.0.1** |
| WebSockets | Starlette built-in (colaboración en tiempo real) | — |
| Frontend | React 19 + Vite + TypeScript | 19 / 8 / 6 |
| HTTP client | Axios | 1.15 |
| State / cache | TanStack Query | 5 |
| Charts | Recharts | 3 |
| Contenerización | Docker Compose (Docker Engine en WSL2 Ubuntu 24.04) | — |
| Code editor | Monaco Editor (`@monaco-editor/react`) | — |
| Compute scripts | AWS Lambda (pandas, numpy, duckdb, scikit-learn) | — |

---

## Estructura de carpetas

```
datavault/
├── docker-compose.yml
├── MIGRATION.md              ← este archivo
├── CLAUDE.md                 ← contexto para Claude Code
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── main.py               # FastAPI app + CORS + WebSocket ConnectionManager
│   ├── database.py           # SQLAlchemy async engine + get_db
│   ├── models.py             # ORM: User, Dataset, ColumnDefinition, Record,
│   │                         #   DatasetPermission, ChangeHistory,
│   │                         #   UserGroup, UserGroupMember, DatasetGroupPermission,
│   │                         #   Workspace, WorkspaceMember
│   ├── schemas.py            # Pydantic schemas (in/out)
│   ├── auth.py               # JWT utils, hash, get_current_user, require_roles,
│   │                         #   effective_role(), effective_workspace_role(),
│   │                         #   WS_ROLE_TO_DS_ROLE, ws_require_*
│   ├── limiter.py            # slowapi rate limiter
│   ├── alembic/
│   │   └── versions/
│   │       ├── 48460562010c_init.py
│   │       ├── a98108fe73ca_add_users_and_auth.py
│   │       ├── 29e5809b0914_dataset_permissions_and_gin_index.py
│   │       ├── c3f7a2b8d91e_groups_and_computed_datasets.py
│   │       └── d4e8f1a2b3c5_add_workspaces.py
│   ├── routers/
│   │   ├── auth.py           # /auth/* — register, login, me, users, audit
│   │   ├── datasets.py       # /datasets CRUD
│   │   ├── columns.py        # /datasets/{id}/columns CRUD
│   │   ├── records.py        # /datasets/{id}/records CRUD + import + history
│   │   ├── permissions.py    # /datasets/{id}/permissions
│   │   ├── groups.py         # /groups + /groups/{id}/members
│   │   └── workspaces.py     # /workspaces + /workspaces/{id}/members
│   └── seeds/
│       ├── setup_seed.py          # seed inicial (categorias, productos, etc.)
│       ├── seed_users_groups.py   # 12 usuarios, 4 grupos; Pass1234!
│       ├── seed_datasets_finti.py # datasets para workspaces Finanzas y TI
│       ├── seed_activity.py       # actividad en audit log
│       └── seed_roles_test.py     # cuentas test.owner/adminws/member; ver abajo
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    ├── .env                  # VITE_API_URL, VITE_WS_URL
    └── src/
        ├── main.tsx          # Router + providers: Query, Auth, Workspace, Toast, Confirm
        ├── auth/
        │   └── AuthContext.tsx
        ├── workspace/
        │   ├── WorkspaceContext.tsx   # estado global workspace activo
        │   └── WorkspaceSwitcher.tsx  # dropdown cambio de workspace
        ├── api/
        │   ├── client.ts
        │   ├── datasets.ts
        │   ├── groups.ts
        │   └── workspaces.ts
        ├── components/
        │   ├── Toast, ConfirmDialog, UserMenu, DataGrid, CellEditor
        │   ├── KanbanView, ChartPanel, SchemaDiagram, GlobalSchemaDiagram
        │   ├── PermissionsPanel.tsx   # permisos por dataset (usuarios + grupos)
        │   └── ...
        └── pages/
            ├── Login.tsx
            ├── DatasetList.tsx        # home con WorkspaceSwitcher
            ├── DatasetView.tsx        # tabla/kanban/charts
            ├── WorkspaceView.tsx      # /ws/:id — datasets del workspace
            ├── ScriptsHub.tsx         # /scripts — scripts Python
            ├── ComputedDatasetEditor.tsx # editor Monaco
            ├── AdminUsers.tsx         # /admin/users — con filtros avanzados
            ├── AdminGroups.tsx        # /admin/groups — sidebar + miembros
            ├── AdminWorkspaces.tsx    # /admin/workspaces — sidebar + miembros
            └── AdminAudit.tsx         # /admin/audit — con exportar CSV/Excel
```

---

## Modelo de datos (PostgreSQL)

```sql
-- Migración 1: init
users
  id              UUID PK
  email           TEXT UNIQUE NOT NULL
  username        TEXT NOT NULL
  hashed_password TEXT NOT NULL
  role            VARCHAR(20) NOT NULL   -- 'admin' | 'editor' | 'viewer'
  is_active       BOOLEAN DEFAULT true
  created_at      TIMESTAMPTZ

datasets
  id              UUID PK
  name            TEXT NOT NULL
  description     TEXT
  is_computed     BOOLEAN DEFAULT false  -- true = script Python (Lambda)
  workspace_id    UUID FK→workspaces NULL
  created_at      TIMESTAMPTZ

column_definitions
  id              UUID PK
  dataset_id      UUID FK→datasets (CASCADE)
  name            TEXT NOT NULL
  field_key       TEXT NOT NULL
  data_type       VARCHAR(20)            -- 'text'|'number'|'date'|'enum'|'boolean'
  rules           JSONB DEFAULT '{}'
  position        INTEGER DEFAULT 0
  created_at      TIMESTAMPTZ

records
  id              UUID PK
  dataset_id      UUID FK→datasets (CASCADE)
  data            JSONB DEFAULT '{}'
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
  deleted_at      TIMESTAMPTZ NULL
  INDEX: ix_records_data_gin GIN(data)

dataset_permissions
  id              UUID PK
  dataset_id      UUID FK→datasets (CASCADE)
  user_id         UUID FK→users (CASCADE)
  role            VARCHAR(20)            -- 'admin'|'editor'|'viewer'|'none'
  granted_at      TIMESTAMPTZ

change_history
  id              UUID PK
  record_id       UUID FK→records
  field_key       TEXT NULL
  old_value       TEXT NULL
  new_value       TEXT NULL
  action          VARCHAR(20)            -- 'create'|'update'|'delete'|'restore'
  changed_at      TIMESTAMPTZ
  user_id         UUID FK→users NULL
  user_name       TEXT NULL

-- Migración 4: groups_and_computed_datasets
user_groups
  id              UUID PK
  name            TEXT NOT NULL
  description     TEXT NULL
  workspace_id    UUID FK→workspaces NULL
  created_at      TIMESTAMPTZ

user_group_members
  group_id        UUID FK→user_groups (CASCADE)
  user_id         UUID FK→users (CASCADE)
  PRIMARY KEY (group_id, user_id)

dataset_group_permissions
  id              UUID PK
  dataset_id      UUID FK→datasets (CASCADE)
  group_id        UUID FK→user_groups (CASCADE)
  role            VARCHAR(20)

-- Migración 5: add_workspaces
workspaces
  id              UUID PK
  name            TEXT NOT NULL
  description     TEXT NULL
  created_at      TIMESTAMPTZ

workspace_members
  workspace_id    UUID FK→workspaces (CASCADE)
  user_id         UUID FK→users (CASCADE)
  role            VARCHAR(20)            -- 'owner' | 'admin_ws' | 'member'
  joined_at       TIMESTAMPTZ
  PRIMARY KEY (workspace_id, user_id)
```

### Migraciones Alembic (completas)

| # | ID | Descripción |
|---|----|----|
| 1 | `48460562010c` | Schema inicial: datasets, columns, records, change_history |
| 2 | `a98108fe73ca` | Tabla users + user_id en change_history |
| 3 | `29e5809b0914` | dataset_permissions + GIN index en records.data |
| 4 | `c3f7a2b8d91e` | user_groups, group_members, dataset_group_permissions, is_computed en datasets |
| 5 | `d4e8f1a2b3c5` | workspaces, workspace_members, workspace_id en datasets y groups |

```bash
# Aplicar todas las migraciones
docker compose exec backend alembic upgrade head

# Ver estado actual
docker compose exec backend alembic current

# Ver historial
docker compose exec backend alembic history --verbose
```

---

## Autenticación y roles

- JWT firmado con `SECRET_KEY` (env var). Default inseguro — **cambiar en producción**.
- Token en `localStorage` (`dv_token`). El cliente axios lo inyecta en cada request via interceptor.
- **Primer usuario registrado** → rol `admin` automáticamente.

### Roles globales (campo `users.role`)

| Rol | Datasets | Columnas | Registros | Usuarios | Workspaces |
|-----|----------|----------|-----------|----------|------------|
| `admin` | CRUD | CRUD | CRUD | CRUD | CRUD |
| `editor` | lectura | lectura | CRUD | — | — |
| `viewer` | lectura | lectura | lectura | — | — |

### Roles de workspace (`workspace_members.role`)

| Workspace role | Rol efectivo sobre datos | Gestionar equipo/grupos | Eliminar workspace |
|---|---|---|---|
| `owner` | `admin` (control total) | ✓ | ✓ |
| `admin_ws` | `editor` (editar registros) | ✓ | ✗ |
| `member` | `editor` (editar registros) | ✗ | ✗ |

Mapeo en `auth.py → WS_ROLE_TO_DS_ROLE`:
```python
WS_ROLE_TO_DS_ROLE = {
    "owner":    "admin",
    "admin_ws": "editor",
    "member":   "editor",   # member puede crear/editar/eliminar registros
}
```

### Prioridad de permisos efectivos sobre un dataset
```
admin global > permiso directo (dataset_permissions) > mejor permiso de grupo > workspace role > rol global
```
Implementado en `auth.py → effective_role(user, dataset_id, db)`.

### Cuentas de prueba (seed_roles_test.py)

| Email | Contraseña | Rol global | Workspace role |
|-------|-----------|-----------|---------------|
| admin@datavault.com | Admin1234! | admin | owner (cualquier ws) |
| test.owner@empresa.com | TestOwner1! | editor | owner en Ventas |
| test.adminws@empresa.com | TestAdminWS1! | editor | admin_ws en Ventas |
| test.member@empresa.com | TestMember1! | viewer | member en Ventas |
| juan.perez@empresa.com | Pass1234! | editor | member en Ventas |
| (resto de usuarios) | Pass1234! | editor/viewer | varios workspaces |

---

## Endpoints principales

```
# Auth
POST   /auth/register                    {email, username, password}
POST   /auth/login                       {email, password} → {access_token, user}
GET    /auth/me
GET    /auth/users                       admin: todos | ?workspace_id=: miembros | ?list_all=true: todos (owners)
PATCH  /auth/users/{id}/role             (admin) {role}
PATCH  /auth/users/{id}/deactivate       (admin)
GET    /auth/audit                       (admin) ?skip=&limit=&action=&dataset_id=&workspace_id=&user_id=

# Workspaces
GET    /workspaces
POST   /workspaces                       (admin) {name, description?}
GET    /workspaces/{id}
PATCH  /workspaces/{id}                  (owner/admin_ws) {name?, description?}
DELETE /workspaces/{id}                  (admin global)
GET    /workspaces/{id}/members
POST   /workspaces/{id}/members          (owner/admin_ws) {user_id, role}
PATCH  /workspaces/{id}/members/{uid}    (owner/admin_ws) {role}
DELETE /workspaces/{id}/members/{uid}    (owner/admin_ws)

# Grupos
GET    /groups                           ?workspace_id=
POST   /groups                           (admin/owner/admin_ws) {name, description?, workspace_id?}
DELETE /groups/{id}
GET    /groups/{id}/members
POST   /groups/{id}/members              {user_id}
DELETE /groups/{id}/members/{user_id}

# Datasets
GET    /datasets                         ?workspace_id=
POST   /datasets                         {name, description?, workspace_id?}
PATCH  /datasets/{id}
DELETE /datasets/{id}

# Columnas
GET    /datasets/{id}/columns
POST   /datasets/{id}/columns            {name, field_key, data_type, rules, position}
PATCH  /datasets/{id}/columns/{col_id}
DELETE /datasets/{id}/columns/{col_id}

# Registros (paginados)
GET    /datasets/{id}/records            ?search=&include_deleted=&skip=&limit=
POST   /datasets/{id}/records            {data: {...}}
PATCH  /datasets/{id}/records/{rec_id}
DELETE /datasets/{id}/records/{rec_id}           (soft delete)
POST   /datasets/{id}/records/{rec_id}/restore
POST   /datasets/{id}/records/bulk-delete        {ids: [...]}
POST   /datasets/{id}/records/import-excel       multipart/form-data
GET    /datasets/{id}/records/{rec_id}/history

# Permisos por dataset
GET    /datasets/{id}/permissions
PUT    /datasets/{id}/permissions        {user_id, role}
DELETE /datasets/{id}/permissions/{user_id}

# Scripts Python (Computed Datasets)
POST   /datasets/{id}/compute            ejecuta el script vía AWS Lambda

# WebSocket (tiempo real)
WS     /ws/{dataset_id}           primer mensaje = JWT token
```

---

## Variables de entorno

### Backend (en `docker-compose.yml` o `.env`)
```env
DATABASE_URL=postgresql+asyncpg://dev:dev@db/datavault
SECRET_KEY=datavault-secret-change-in-production-xyz-123
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

---

## Pasos para levantar en nueva máquina (Windows + WSL2)

### 1. Instalar Docker Engine en WSL2
```bash
# Dentro de WSL2 Ubuntu
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Cerrar y reabrir la sesión WSL
```

### 2. Copiar el proyecto
```bash
# Copiar la carpeta datavault/ a la nueva ubicación
# Ejemplo destino: /mnt/c/Users/NUEVO/Documents/proyecto/datavault
```

### 3. Levantar todos los servicios
```bash
wsl -d Ubuntu -- bash -c "
  service docker start && sleep 2
  cd /mnt/c/Users/NUEVO/Documents/proyecto/datavault
  docker compose up -d
  echo 'Esperando backend...'
  for i in $(seq 1 15); do
    sleep 2
    curl -s http://localhost:8000/health > /dev/null && echo 'Listo.' && break
    echo \"Intento $i/15...\"
  done
  docker compose ps
"
```

### 4. Aplicar migraciones (solo la primera vez, o tras `down -v`)
```bash
wsl -d Ubuntu -- bash -c "
  cd /mnt/c/Users/NUEVO/Documents/proyecto/datavault
  docker compose exec backend alembic upgrade head
"
```

### 5. Verificar URLs
| URL | Servicio |
|-----|---------|
| http://localhost:5173 | Frontend React (Vite HMR) |
| http://localhost:8000 | Backend FastAPI |
| http://localhost:8000/docs | Swagger UI interactivo |
| localhost:5432 | PostgreSQL `dev/dev/datavault` |

### 6. Crear primer usuario (admin)
Ir a http://localhost:5173/login → pestaña "Crear cuenta".
El primer usuario registrado recibe rol `admin` automáticamente.

---

## Migrar datos existentes (PostgreSQL dump)

```bash
# ORIGEN — exportar base de datos completa
wsl -d Ubuntu -- bash -c "
  cd /mnt/c/Users/USER/Documents/migra/datavault
  docker compose exec db pg_dump -U dev --no-owner datavault > datavault_backup_$(date +%Y%m%d).sql
"

# DESTINO — importar (los servicios deben estar levantados y migrados)
wsl -d Ubuntu -- bash -c "
  cd /ruta/nueva/datavault
  docker compose exec -T db psql -U dev datavault < datavault_backup_YYYYMMDD.sql
"
```

---

## Comandos útiles del día a día

```bash
# Ver logs en vivo
docker compose logs backend -f
docker compose logs frontend -f

# Reiniciar solo el backend (tras cambios en Python)
docker compose restart backend

# Rebuild backend (tras cambiar requirements.txt)
docker compose build backend && docker compose up -d backend

# Crear nueva migración Alembic
docker compose exec backend alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones pendientes
docker compose exec backend alembic upgrade head

# Ver historial de migraciones
docker compose exec backend alembic history --verbose

# Psql interactivo
docker compose exec db psql -U dev -d datavault

# Consultas útiles
docker compose exec db psql -U dev -d datavault -c "SELECT email, username, role, is_active FROM users;"
docker compose exec db psql -U dev -d datavault -c "SELECT name, id FROM datasets;"
docker compose exec db psql -U dev -d datavault -c "SELECT COUNT(*) FROM records WHERE deleted_at IS NULL;"
docker compose exec db psql -U dev -d datavault -c "\d dataset_permissions"
```

---

## Notas importantes al migrar

1. **SECRET_KEY** — cambiar a un valor aleatorio largo en producción (`openssl rand -hex 32`).
2. **bcrypt fijado en `4.0.1`** — `passlib 1.7.4` es incompatible con `bcrypt >= 4.1` (error en detección de wrap-bug). No actualizar bcrypt sin probar.
3. **Volumen `pgdata`** — los datos de PostgreSQL viven ahí. `docker compose down -v` los borra permanentemente. Siempre hacer dump antes.
4. **Hot-reload** — el frontend y backend montan los archivos locales como volúmenes (`./backend:/app`, `./frontend:/app`). Los cambios de código son inmediatos sin rebuild. Solo se necesita rebuild si cambia `requirements.txt` o `package.json`.
5. **VITE_API_URL / VITE_WS_URL** — si el backend corre en un host o puerto diferente, actualizar `frontend/.env`. En producción ambas deben apuntar al host público.
6. **`Access-Control-Expose-Headers`** — el backend expone `X-Total-Count` para que el frontend pueda leer el total de registros desde el header de paginación.
7. **GIN index** — ya creado en la migración `29e5809b0914`. Acelera búsquedas `ilike` sobre `records.data`. Si se restaura desde un dump antiguo, crearlo manualmente: `CREATE INDEX ix_records_data_gin ON records USING GIN (data);`

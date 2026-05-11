# DataVault — Contexto del proyecto

Gestor de datos tabulares dinámicos (similar a Airtable). Permite crear datasets con columnas configurables en runtime, editar registros inline, importar CSV/Excel, mantener historial de cambios y vincular tablas entre sí.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11 + FastAPI (async) |
| Base de datos | PostgreSQL 16 (RDS) + Redis (ElastiCache) |
| Frontend | React 19 + Vite + TypeScript |
| ORM / Migraciones | SQLAlchemy async + Alembic |
| Auth | JWT (python-jose) + bcrypt/passlib |
| Rate limiting | slowapi (Redis backend) |
| Nube / Infra | AWS (ECS Fargate, S3, CloudFront, ALB) |
| IaC | Terraform |
| CI/CD | GitHub Actions (OIDC auth) |
| Tests | pytest-asyncio + httpx + SQLite in-memory |

## Cómo levantar los servicios

```bash
# Docker Desktop debe estar corriendo. Desde bash de Windows:
cd "c:/Users/PAOLO VILCAPOMA/Documents/dev-ops-dmc/datavault"
docker compose up -d
```

O usar la skill de Claude Code: `/datavault-start` / `/datavault-stop`

## Primera vez en una PC nueva

```bash
# 1. Levantar servicios
docker compose up -d

# 2. Aplicar migraciones
docker compose exec backend alembic upgrade head

# 3. Cargar datos de ejemplo
docker compose exec backend python setup_seed.py
```

## URLs locales

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 (user: dev / pass: dev / db: datavault) |

## Estructura del proyecto

```
datavault/
├── .env                     # DATABASE_URL, SECRET_KEY, ALLOWED_ORIGINS
├── docker-compose.yml       # db (healthcheck) + backend + frontend
├── backend/
│   ├── main.py              # FastAPI app, CORS, rate limiter, WebSocket
│   ├── database.py          # SQLAlchemy async engine
│   ├── models.py            # ORM: Dataset, ColumnDefinition, Record, ChangeHistory, User
│   ├── schemas.py           # Pydantic schemas (in/out)
│   ├── auth.py              # JWT: create_access_token, get_current_user, require_admin
│   ├── setup_seed.py        # Script de datos de desarrollo (ejecutar 1 vez)
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── alembic.ini
│   ├── routers/
│   │   ├── auth.py          # POST /auth/register|login, GET /auth/me|users, audit log
│   │   ├── datasets.py      # GET/POST/PATCH/DELETE /datasets
│   │   ├── columns.py       # CRUD /datasets/{id}/columns
│   │   └── records.py       # CRUD + soft-delete + restore + import-csv/excel
│   └── tests/
│       ├── conftest.py      # fixtures: async SQLite in-memory, admin_client
│       ├── test_auth.py
│       ├── test_datasets.py
│       └── test_records.py
└── frontend/
    ├── src/
    │   ├── types.ts
    │   ├── auth/
    │   │   └── AuthContext.tsx   # JWT token, login/logout, roles
    │   ├── api/
    │   │   ├── client.ts         # axios con Authorization header
    │   │   └── datasets.ts       # funciones fetch
    │   ├── components/
    │   │   ├── DataGrid.tsx          # tabla editable, sort, drag columns, paste TSV
    │   │   ├── CellEditor.tsx        # input según data_type (text/number/date/enum/boolean)
    │   │   ├── ColumnPanel.tsx       # visibilidad + vínculos (joins) + fórmulas
    │   │   ├── AddColumnModal.tsx    # modal nueva columna con reglas
    │   │   ├── RelatedDatasets.tsx   # detección automática de relaciones FK
    │   │   └── ...
    │   ├── pages/
    │   │   ├── DatasetList.tsx   # lista y crea datasets
    │   │   ├── DatasetView.tsx   # vista principal (tabla/kanban/gráficos/papelera)
    │   │   └── ...
    │   └── utils/
    │       └── useRealtimeSync.ts  # WebSocket: auth por primer mensaje
    ├── .env                 # VITE_API_URL=http://localhost:8000
    └── Dockerfile
```

## Autenticación y roles

- **Admin**: crea/elimina datasets y columnas, gestiona usuarios, accede al audit log
- **Editor**: crea/edita/elimina registros, importa datos
- **Viewer**: solo lectura
- Primer usuario registrado → admin automáticamente
- Token JWT en `localStorage` como `dv_token`

## Modelo de datos

```
users              ← JWT auth + roles
datasets           → column_definitions  (1:N, define el schema)
datasets           → records             (1:N, datos en JSONB)
records            → change_history      (1:N, audit log por campo)
```

- Los datos de cada registro viven en `records.data (JSONB)` con claves = `field_key` de cada columna.
- Soft delete: `records.deleted_at` — los registros eliminados se ocultan pero no se borran.
- `change_history` registra cada update con `old_value` / `new_value` / `action` / `user_id`.

## Endpoints principales

```
POST   /auth/register          body: {email, username, password}
POST   /auth/login             body: {email, password}
GET    /auth/me
GET    /auth/users             (admin)
PATCH  /auth/users/{id}/role   (admin)
GET    /auth/audit             (admin) ?dataset_id=&workspace_id=&user_id=&action=

GET    /datasets
POST   /datasets
PATCH  /datasets/{id}          body: {name?, description?}
DELETE /datasets/{id}

GET    /datasets/{id}/columns
POST   /datasets/{id}/columns  body: {name, field_key, data_type, rules, position}
PATCH  /datasets/{id}/columns/{col_id}
DELETE /datasets/{id}/columns/{col_id}

GET    /datasets/{id}/records  ?search=&include_deleted=&skip=&limit=
POST   /datasets/{id}/records  body: {data: {...}}
PATCH  /datasets/{id}/records/{rec_id}
DELETE /datasets/{id}/records/{rec_id}   (soft delete)
POST   /datasets/{id}/records/{rec_id}/restore
GET    /datasets/{id}/records/{rec_id}/history
POST   /datasets/{id}/records/import-excel  (multipart/form-data)
POST   /datasets/{id}/records/bulk-delete   body: {ids: [...]}
```

## Tipos de columna y reglas soportadas

| data_type | Reglas disponibles |
|-----------|--------------------|
| text      | required |
| number    | required, min, max |
| date      | required |
| enum      | required, options: ["A","B",...] |
| boolean   | — |

## Columnas vinculadas (joins en frontend)

La detección automática de relaciones se basa en `field_key`:
- Una columna `id_<keyword>` en el dataset actual → apunta al dataset cuyo nombre termina en `<keyword>`
- El lookup usa `r.id` del dataset origen (sentinel `"__id__"`) — no un campo de `r.data`

Ejemplo: `Producto.id_proveedor` → detecta `Proveedor`, muestra campos de ese registro.

## Datos de desarrollo (setup_seed.py)

7 tablas con 7 relaciones FK y ~600 registros:

| Dataset   | Registros | FKs |
|-----------|-----------|-----|
| Categoria | 12        | —   |
| Proveedor | 50        | → Categoria |
| Cliente   | 100       | —   |
| Empleado  | 20        | —   |
| Producto  | 100       | → Categoria, → Proveedor |
| Pedido    | 120       | → Cliente, → Empleado |
| Detalle   | 200       | → Pedido, → Producto |

## Migraciones Alembic

```bash
# Generar nueva migración:
docker compose exec backend alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones:
docker compose exec backend alembic upgrade head
```

Migraciones existentes:
1. `init` — tablas base (datasets, columns, records, change_history)
2. `add_users_and_auth` — tabla users, user_id en change_history
3. `dataset_permissions_and_gin_index` — permisos por dataset, índice GIN en records.data

## Tests

```bash
docker compose exec backend pytest tests/ -v
```

Usa SQLite in-memory, no requiere PostgreSQL. Fixture `admin_client` crea automáticamente un usuario admin.

## Variables de entorno (.env)

```env
DATABASE_URL=postgresql+asyncpg://dev:dev@db/datavault
SECRET_KEY=datavault-secret-change-in-production-xyz-123
ALLOWED_ORIGINS=http://localhost:5173
```

## Decisiones de diseño

- **JSONB para datos dinámicos** — permite agregar/quitar columnas sin ALTER TABLE.
- **Soft delete** — `deleted_at` en lugar de DELETE físico; papelera visible en UI.
- **JWT stateless** — sin sesiones en servidor; roles embebidos en el token.
- **WebSocket auth** — token enviado como primer mensaje (no query param, evita logging en URLs).
- **Rate limiting** — 10/min en login, 5/min en registro para prevenir brute force.
- **Docker Desktop** en Windows (no WSL2 engine) — la máquina corre Docker Desktop directamente.

## Features nuevas (Mayo 2026)

### Feature 1: Permisos por grupos
- Modelos: `UserGroup`, `UserGroupMember`, `DatasetGroupPermission`
- Migración: `c3f7a2b8d91e_groups_and_computed_datasets`
- Prioridad: admin global > permiso directo > mejor permiso de grupo > rol global
- `effective_role(user, dataset_id, db)` en `auth.py`
- `GET /datasets` filtra automáticamente por acceso efectivo
- API: `GET/POST/DELETE /groups`, `GET/POST/DELETE /groups/{id}/members`
- API: `GET/PUT/DELETE /datasets/{id}/permissions/groups`
- UI: `PermissionsPanel.tsx` (modal con tabs usuarios/grupos)
- UI: `AdminGroups.tsx` → `/admin/groups`
- Seed: `backend/seed_users_groups.py` — 12 usuarios, 4 grupos (Ventas, Operaciones, Gerencia, Analítica)
  - Contraseña todos: `Pass1234!`

### Feature 2: Scripts Python (Computed Datasets)
- Cada script = Dataset propio (`is_computed=True`), completamente independiente
- Re-ejecutar reemplaza solo los datos de ese script; no afecta otros scripts
- `POST /datasets/{id}/compute` → invoca AWS Lambda con el código + DataFrames fuente
- Lambda: `lambda/executor/` — paquetes: pandas, numpy, scipy, scikit-learn, openpyxl, duckdb
- Timeout Lambda: 15 minutos. Variable necesaria: `LAMBDA_EXECUTOR_ARN`
- UI: `ScriptsHub.tsx` → `/scripts` — hub principal (crear, ejecutar, editar, ver, eliminar)
- UI: `ComputedDatasetEditor.tsx` — editor Monaco, tema azul-morado, 620px alto
  - Sidebar: selector de datasets fuente + chips de columnas
  - Botón "Generar plantilla" genera código con nombres reales de columnas
- DuckDB disponible en scripts:
  ```python
  import duckdb
  result = duckdb.query("""
      SELECT p.nombre, SUM(d.cantidad) AS total
      FROM detalle d
      JOIN producto p ON d.id_producto = p.__id__
      GROUP BY p.nombre ORDER BY total DESC
  """).df()
  ```

## Rutas frontend completas
| Ruta | Página |
|------|--------|
| `/` | DatasetList |
| `/create` | CreateDataset |
| `/scripts` | ScriptsHub |
| `/computed/new` | ComputedDatasetEditor (nuevo) |
| `/datasets/:id/computed` | ComputedDatasetEditor (editar) |
| `/datasets/:id` | DatasetView |
| `/datasets/:id/new` | RecordForm |
| `/ws/:workspaceId` | WorkspaceView |
| `/admin/users` | AdminUsers |
| `/admin/audit` | AdminAudit |
| `/admin/groups` | AdminGroups |
| `/admin/workspaces` | AdminWorkspaces |

## Feature 3: Workspaces (Equipos)

### Concepto
Cada workspace = un equipo con sus propios datasets y grupos. Un usuario puede pertenecer a múltiples workspaces con roles distintos.

### Jerarquía
```
Empresa
└── Workspace (Ventas, Operaciones, RRHH...)
    ├── Datasets propios
    ├── Grupos propios
    └── Miembros con roles: owner | admin_ws | member
```

### Modelos nuevos
- `Workspace`: id, name, description, created_at
- `WorkspaceMember`: workspace_id, user_id, role (owner|admin_ws|member), joined_at
- `Dataset.workspace_id` → FK nullable a Workspace
- `UserGroup.workspace_id` → FK nullable a Workspace

### Migración
`d4e8f1a2b3c5_add_workspaces`

### API
```
GET    /workspaces                     lista los workspaces del usuario
POST   /workspaces                     crea workspace (creador = owner automático)
GET    /workspaces/{id}
PATCH  /workspaces/{id}               solo owner/admin del workspace
DELETE /workspaces/{id}               solo admin global

GET    /workspaces/{id}/members
POST   /workspaces/{id}/members       body: {user_id, role}
PATCH  /workspaces/{id}/members/{uid} cambia rol
DELETE /workspaces/{id}/members/{uid}

GET    /datasets?workspace_id=<uuid>  filtra por workspace
POST   /datasets                      body incluye workspace_id opcional
GET    /groups?workspace_id=<uuid>    filtra por workspace
```

### Auth: effective_workspace_role()
- Admin global → siempre "owner" en cualquier workspace
- Otros → lee WorkspaceMember.role (owner|admin_ws|member) o None si no es miembro

### Roles de workspace y permisos efectivos sobre datos

| Workspace role | Rol efectivo sobre datasets | Puede editar datos | Gestiona equipo/grupos |
|---|---|---|---|
| `member`   | `editor` | ✓ | ✗ |
| `admin_ws` | `editor` | ✓ | ✓ |
| `owner`    | `admin`  | ✓ | ✓ + eliminar workspace |

Mapeo en `auth.py`:
```python
WS_ROLE_TO_DS_ROLE = {
    "owner":    "admin",
    "admin_ws": "editor",
    "member":   "editor",   # member puede editar registros (no solo leer)
}
```

### Flujo para agregar un usuario nuevo al sistema
1. Usuario se registra → rol global `"viewer"`, sin workspace
2. Admin global **o** workspace owner/admin_ws van a `/admin/workspaces`
   - Usan `?list_all=true` en `/auth/users` para ver todos los usuarios del sistema
   - Agregan al usuario con rol `member` / `admin_ws` / `owner`
3. Una vez en el workspace, owner/admin_ws pueden agregarlo a grupos en `/admin/groups`

### API
```
GET    /workspaces                     lista workspaces del usuario
POST   /workspaces                     crea workspace (creador = owner automático, solo admin global)
GET    /workspaces/{id}
PATCH  /workspaces/{id}               solo owner/admin_ws
DELETE /workspaces/{id}               solo admin global

GET    /workspaces/{id}/members
POST   /workspaces/{id}/members       body: {user_id, role}  — owner/admin_ws
PATCH  /workspaces/{id}/members/{uid} cambia rol             — owner/admin_ws
DELETE /workspaces/{id}/members/{uid}                        — owner/admin_ws

GET    /datasets?workspace_id=<uuid>  filtra por workspace
POST   /datasets                      body incluye workspace_id opcional
GET    /groups?workspace_id=<uuid>    filtra por workspace

GET    /auth/users                    admin global: todos; con ?workspace_id=: miembros del ws
GET    /auth/users?list_all=true      owner/admin_ws de cualquier ws: todos los usuarios del sistema
GET    /auth/users?workspace_id=<id> owner/admin_ws del ws: miembros de ese ws
```

### Frontend (implementado)
- `WorkspaceContext.tsx` — estado global del workspace activo (persiste en localStorage `dv_workspace_id`)
  - owners/admin_ws NO se auto-seleccionan en reload (navegan vía URL `/ws/:id`)
  - members regulares sí se auto-seleccionan al primer workspace disponible
- `WorkspaceSwitcher.tsx` — dropdown con avatares, roles pill, opción crear nuevo
  - owners/admin_ws → `navigate('/ws/:id')` al seleccionar (igual que admin global)
  - members regulares → `setCurrent(ws)` (no navegan a WorkspaceView)
- `WorkspaceProvider` envuelve la app en `main.tsx`
- `AdminWorkspaces.tsx` → `/admin/workspaces` — sidebar + panel derecho; gestión de miembros con rol seleccionable inline; accesible para owner/admin_ws (no solo admin global)
- `WorkspaceView.tsx` → `/ws/:workspaceId` — vista de datasets del workspace
  - Nav para admin global: Workspaces | Equipo | Grupos | Usuarios
  - Nav para owner/admin_ws: Equipo | Grupos | Usuarios
- `AdminGroups.tsx` → `/admin/groups`
  - Admin global ve todos los grupos
  - owner/admin_ws ve solo los grupos de sus workspaces
  - Búsqueda de usuarios para agregar filtra por workspace (`?workspace_id=`)
- `AdminUsers.tsx` → `/admin/users?workspace_id=<id>`
  - Admin global ve todos; owner/admin_ws ven solo su workspace
  - Muestra grupos y workspaces de cada usuario como chips clicables
- `AdminAudit.tsx` → `/admin/audit`:
  - Filtros: Acción | Workspace | Dataset | Persona (multi-select)
  - Exportar CSV y Excel sin librería npm

### Seed de datos
- `backend/seed_users_groups.py` — 12 usuarios, 4 grupos; contraseña: `Pass1234!`
- `backend/seed_datasets_finti.py` — datasets para workspaces Finanzas y TI
- `backend/seed_activity.py` — simula actividad de 10 usuarios para poblar el audit log
- `backend/seed_roles_test.py` — 18 usuarios extra, 3 cuentas de prueba por rol, 5 workspaces, 5 grupos
  - `test.owner@empresa.com` / `TestOwner1!` → owner del workspace Ventas
  - `test.adminws@empresa.com` / `TestAdminWS1!` → admin_ws del workspace Ventas
  - `test.member@empresa.com` / `TestMember1!` → member del workspace Ventas
  - Resto de usuarios: `Pass1234!`

## Deploy en AWS

### Estructura de infraestructura
```
dev_ops_dmc/
├── terraform/
│   ├── main.tf          # VPC, SG, ECR, S3, CloudFront, RDS, ECS, IAM, OIDC
│   ├── variables.tf     # aws_region, environment, db_user, db_password, db_name
│   ├── outputs.tf       # cloudfront_url, alb_dns_name, ecr_backend_url, github_actions_role_arn
│   └── bootstrap.sh     # Crea el bucket S3 de estado (ejecutar 1 sola vez)
└── .github/workflows/
    └── ci-cd.yml        # Tests → deploy staging (develop) → deploy prod (main)
```

### Primer deploy (pasos en orden)

```bash
# 1. Crear bucket de estado Terraform
cd terraform
bash bootstrap.sh

# 2. Aprovisionar infraestructura (staging)
terraform init
terraform apply -var="environment=staging" -var="db_password=<password_seguro>"

# 3. Anotar los outputs — los necesitas para los secrets de GitHub:
#    github_actions_role_arn → AWS_ROLE_ARN_STAGING
#    cloudfront_url          → VITE_API_URL (dominio CloudFront)

# 4. Configurar secrets y variables en GitHub
#    Settings → Environments → staging:
#      Secret: AWS_ROLE_ARN_STAGING
#    Settings → Variables (repo level):
#      VITE_API_URL = https://<cloudfront_domain>
#      VITE_WS_URL  = wss://<cloudfront_domain>
#      AWS_REGION   = us-east-1

# 5. Push a develop → el pipeline hace el resto automáticamente
```

### Cómo funciona el CI/CD
- `push → develop` → deploy staging (build → migración Alembic → ECS update)
- `push → main`    → deploy prod (mismo flujo, entorno production)
- `PR → main`      → solo tests y lint, sin deploy

### CloudFront path routing
El frontend (S3) recibe todo por defecto. Estos paths se proxean al ALB/backend:
`/auth*` `/datasets*` `/permissions*` `/groups*` `/workspaces*` `/records*` `/health` `/ws*`

### Pendientes antes de producción
1. Habilitar NAT Gateway en Terraform (`enable_nat_gateway = true`) y mover ECS a subnets privadas
2. Descomentar ElastiCache Redis y `REDIS_URL` en task definition
3. Deploy Lambda executor: ver `lambda/executor/README.md`; agregar `LAMBDA_EXECUTOR_ARN` a SSM y task definition
4. Configurar dominio propio + certificado ACM si se quiere URL personalizada

## Migraciones Alembic (completas)
1. `48460562010c_init`
2. `a98108fe73ca_add_users_and_auth`
3. `29e5809b0914_dataset_permissions_and_gin_index`
4. `c3f7a2b8d91e_groups_and_computed_datasets`
5. `d4e8f1a2b3c5_add_workspaces`

## Tips Windows / Git Bash
- `docker exec` con rutas absolutas: usar `//bin/ls //app/` (doble slash)
- Copiar scripts al backend antes de ejecutar: `docker cp script.py container:/app/` luego `docker compose exec backend python /app/script.py`
- Monaco Editor requiere `@monaco-editor/react` (ya en package.json)
- Para copiar archivos frontend al contenedor en caliente (sin rebuild): `docker cp archivo.tsx datavault-frontend-1:/app/src/pages/` — Vite HMR lo detecta automáticamente
- Para cambios en el backend (routers/): `docker cp router.py datavault-backend-1:/app/routers/` + `docker restart datavault-backend-1`
- Módulo de base de datos expone `engine` y `get_db`; no `AsyncSessionLocal` ni `async_session_maker`
- Usuarios admin de desarrollo: `admin@datavault.com` / `Admin1234!`

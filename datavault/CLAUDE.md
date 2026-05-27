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
| text / long_text  | required, unique, regex |
| number / currency / percent / rating | required, min, max, currency_symbol, max_rating |
| date      | required |
| enum      | required, options: ["A","B",...] |
| multiselect | options: ["A","B",...] |
| boolean   | — |
| email / phone / url | required |
| **relation** (N:N unificado) | required, **related_dataset_id**, **display_field** |

**Modelo unificado N:N** (mayo 2026): TODAS las columnas `data_type=relation` guardan
sus valores como **array JSONB** (ej. `["Y00313", "Y00421"]`), no escalares.
- Array de 1 elemento = relación 1:N (caso típico)
- Array de N elementos = relación N:N (mismo modelo, distinta cardinalidad efectiva)
- El cambio `data_type → relation` migra automáticamente valores escalares existentes
  a arrays de 1 elemento (`update_column` en `routers/columns.py`)

## Detección y matching de relaciones

### Scanner avanzado (`GET /datasets/relationships/scan`)
Detecta relaciones automáticamente cruzando todos los datasets accesibles:
- **Name match**: campos `id_X` / `cod_X` / `X_id` donde X matchea nombre del target
- **Content match**: compara los valores reales del campo contra los de cada
  columna "tipo clave" del target (set intersection + containment coefficient)
- **Normalización**: tilde-insensible + case-insensitive (`_norm()` en datasets.py)
- **Detección de tabla puente**: cuando un bridge tiene 2 columnas relation a otros
  dos datasets, sugiere la N:N directa entre ellos
- **Self-FK**: detecta auto-referencias dentro del mismo dataset
- **Cleanup suggestions**: detecta variantes (mismo valor en mayúsculas/tildes
  distintas) y propone normalizar con `POST /datasets/{id}/columns/{col_id}/normalize-values`

### Joins en frontend (DataGrid)
- `JoinedColDef` soporta `via?: { bridgeDatasetId, bridgeFkToLocal, bridgeFkToSource }`
- Cuando hay `via`, hace lookup 2-step (currentRow → bridge → source)
- El editor multi-chip (`CellEditor.tsx`) usa server-side search con debounce 220ms
  contra `GET /datasets/{id}/records?search=…&limit=1000`

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
- `POST /datasets/{id}/compute` → ejecuta el código + DataFrames fuente en el **executor aislado** (ver Feature 8). Hoy el payload manda solo valores: `[{"__id__": str(r.id), **r.data}]` (sin el esquema)
- Librerías disponibles en el sandbox: pandas, numpy, duckdb, openpyxl + stdlib seguro. **NO** scipy/scikit-learn (las limpiezas básicas no los necesitan; si hicieran falta, agregarlos a `executor/requirements.txt` y al whitelist de `runner.py`)
- DuckDB sigue disponible para JOINs/agregaciones (ver ejemplo más arriba)

**Columnas de relación en scripts** — toda columna `relation` guarda un **array JSONB** (ej. `['Y00313']`), nunca un escalar. Implicaciones:
- **Limpieza de tabla** → las relaciones se SALTAN (son FKs; tocarlas rompe el vínculo; además las listas no son hasheables → revientan `drop_duplicates`/`groupby`). Detectar con `isinstance(v, (list, dict))` y excluirlas de cada paso.
- **Reporte / dataset nuevo** → las relaciones se RESUELVEN con `UNNEST(col)` + `JOIN` contra el dataset target. El array es la llave del join (lo que habilita N:N).
- Mejora pendiente acordada: pasar el esquema (`data_type`/`related_dataset_id`/`display_field`) al executor para que la detección de relaciones sea automática (no por olfateo de valores) y para que "Generar plantilla" escriba los `UNNEST … JOIN` solos.
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
| Ruta | Página | Acceso |
|------|--------|--------|
| `/` | DatasetList | Cualquier user |
| `/create` | CreateDataset | editor+ |
| `/scripts` | ScriptsHub | editor+ |
| `/computed/new` | ComputedDatasetEditor (nuevo) | editor+ |
| `/datasets/:id/computed` | ComputedDatasetEditor (editar) | editor+ |
| `/datasets/:id` | DatasetView | viewer+ (depende de permisos) |
| `/datasets/:id/new` | RecordForm | editor+ |
| `/ws/:workspaceId` | WorkspaceView | miembro del workspace |
| `/admin/workspaces` | **AdminWorkspaces** (hub IA) — 5 tabs: Equipo / Grupos / Datasets / Permisos / Configuración | admin global / owner / admin_ws |
| `/admin/permissions` | **AdminPermissions** (Centro de permisos cross-workspace) — 4 tabs: Por workspace / grupo / usuario / dataset | **solo admin global** |
| `/admin/users` | AdminUsers | admin global / owner / admin_ws |
| `/admin/audit` | AdminAudit | admin global |
| `/admin/groups` | (deprecado, banner redirige a /admin/workspaces) | admin global / owner / admin_ws |

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
6. `4d9b3e33f961_pii_audit_perm_audit_log`
7. `f7a8b9c0d1e2_performance_indexes`
8. `e1f2a3b4c5d6_permission_audit_log`
9. `a1b2c3d4e5f6_api_tokens_webhooks_sandbox`
10. `b3d4e5f6a7c8_dataset_is_bridge` — flag para marcar tablas intermedias N:N (ocultas por defecto en la lista principal)

## Features nuevas (Mayo–Junio 2026)

### Feature 4: Relaciones N:N unificadas (modelo Airtable-style)
- TODAS las columnas `relation` guardan arrays JSONB (ver sección "Tipos de columna")
- Cell editor multi-chip con autocomplete server-side (debounce 220ms)
- Auto-migración escalar → array al cambiar data_type a relation
- Tabla intermedia opcional (`is_bridge=true`) solo cuando se necesita guardar
  **atributos del vínculo** (cantidad, fecha, monto)
- Wizard "Crear tabla intermedia con atributos" en el gestor de relaciones
- `RelationsManagerModal` con tabs: Relaciones activas / Tablas intermedias / Crear N:N

### Feature 5: Permisos invertidos + Hub administrativo
- Endpoint `GET /groups/{id}/dataset-access` — datasets a los que el grupo tiene acceso
- Endpoint `GET /auth/users/{id}/dataset-access` — rol efectivo del usuario por dataset
  con origen (`direct` / `group:X` / `workspace:rol` / `global_admin`)
- `DatasetAccessModal` editable: cambiar rol inline, quitar, agregar nuevo dataset
- `/admin/workspaces` reorganizado como **hub workspace-centric** (Fase A)
  con 5 tabs por workspace (Equipo, Grupos, Datasets, Permisos, Configuración)
- `/admin/permissions` nuevo (Fase B) — **solo admin global** — vista cross-workspace:
  matriz por workspace, listas planas por grupo/usuario/dataset

### Feature 6: Sistema de relaciones mejorado (scanner v2)
- Scanner detecta por contenido + nombre + tilde-insensible
- Sugerencias de limpieza para valores con variantes (case/tildes)
- Cardinalidad N:N visible en el diagrama global
- Layout en cuadrícula cuando no hay relaciones
- Datasets aislados separados del grafo conectado

### Feature 7: Design kit + consolidación administrativa (Mayo 2026)
- **Design kit** (`frontend/src/index.css`): capa de clases `dk-*` (page, tabs, card, toolbar, search, select, table, badge, empty, row-action, seg/seg-btn, chip, access-row). Estilo "profesional limpio" (Linear/Stripe).
- **Primitivos reutilizables** (`frontend/src/components/ui/`): PageHeader, Tabs, Toolbar, SearchInput, Select, Count, Badge, DataTable, EmptyState + iconos de línea en `icons.tsx`.
- **Emojis**: se usan como guías de navegación SOLO en tabs/títulos; iconos de línea en lugares secundarios.
- **Consolidación de páginas admin**: `/admin/users`, `/admin/groups`, `/admin/permissions` y `/admin/accesos` se unificaron en **una sola página `AdminPeople.tsx`** ("Personas y accesos", rutas `/admin/personas` y `/admin/accesos`).
  - Tabs: usuarios (solo admin global) / miembros / grupos / accesos.
  - Selector de workspace pre-selecciona el primero (`wsId || workspaces[0]?.id`).
  - Rutas legacy redirigen vía `<Navigate>`. Páginas borradas: `AdminPermissions.tsx`, `AdminGroups.tsx`, `AdminAccess.tsx`.
- **AdminWorkspaces.tsx** recortado a solo CRUD de workspace + tabs [datasets, config]; auto-selecciona el primer workspace.
- **Matriz de accesos reconstruida** (`WsTabPermissions.tsx`): master-detail con chips de grupo + `RoleSegmented` por dataset (Sin acceso / Ver / Editar / Admin), mutación optimista. Reemplaza el `<select>`-por-celda. Endpoint batch `GET /workspaces/{id}/access-matrix?mode=groups|users` (evita N+1).

### Feature 8: Executor self-hosted aislado (reemplaza AWS Lambda)
- Los scripts **ya no corren en Lambda**. Servicio `executor` en docker-compose: FastAPI (`executor/app.py`) que corre el código de usuario en un **subproceso** (`executor/runner.py`).
- Aislamiento en capas: subproceso aparte de la API · `RLIMIT_AS` (memoria, `EXECUTOR_MEM_MB=768`) + `RLIMIT_CPU` · timeout de pared (`EXECUTOR_WALL_SECONDS=30`) · `__builtins__` recortado · `__import__` con whitelist · corre como usuario no-root (uid 10001).
- **Red `execnet` con `internal: true`**: el executor NO tiene salida a internet ni acceso a la DB. Solo el backend (en `appnet`+`execnet`) puede alcanzarlo.
- DataFrames se registran como **vistas duckdb** (evita el replacement-scan que hace `import inspect`, bloqueado por el sandbox).
- `backend/lambda_executor.py` enruta: `EXECUTOR_URL` (HTTP, preferido) → `LAMBDA_EXECUTOR_ARN` (boto3, fallback). Nombres `Lambda*` se conservan por compatibilidad del router.

### Feature 9: Billing / monetización (MVP)
- **Modelo plan-por-workspace + asientos (seats)**. Modelos `Subscription` (workspace_id único, plan, status, provider, period) y `PaymentClaim` (workspace_id, plan, amount, method, reference, status…). Migración `5003cbadcb35`.
- **Planes** (`backend/billing_plans.py`, precios en PEN, basados en costo de infra AWS + 20% impuestos, rentable desde 1 plan Pro):
  | Plan | Precio | Miembros | Datasets | Registros | Scripts/API |
  |------|--------|----------|----------|-----------|-------------|
  | Free | S/0 | 3 | 3 | 2 000 | ✗ |
  | Pro | S/490 | 50 | 50 | 200 000 | ✓ |
  | Business | S/980 | 100 | 100 | 400 000 | ✓ |
  - Sin datasets infinitos (decisión de negocio: ofrecerlos es malo).
- **Pago**: Mercado Pago (Checkout Pro) + transferencia bancaria manual (claims que un admin aprueba/rechaza). Cuentas bancarias de la empresa aún no existen pero el diseño ya las contempla.
- **Enforcement**: `assert_can(workspace_id, resource, db)` lanza HTTP 402 al exceder el plan.
- Endpoints (`routers/billing.py`): `GET /billing/plans`, `GET/POST /workspaces/{id}/billing[...]`, `POST /billing/webhook`, `GET /billing/claims`, `POST /billing/claims/{id}/approve|reject`.
- UI: `pages/Billing.tsx` + `api/billing.ts`; entrada en UserMenu ("Planes y facturación", gated por `isManager`).

## Tips Windows / Git Bash
- `docker exec` con rutas absolutas: usar `//bin/ls //app/` (doble slash)
- Copiar scripts al backend antes de ejecutar: `docker cp script.py container:/app/` luego `docker compose exec backend python /app/script.py`
- Monaco Editor requiere `@monaco-editor/react` (ya en package.json)
- Para copiar archivos frontend al contenedor en caliente (sin rebuild): `docker cp archivo.tsx datavault-frontend-1:/app/src/pages/` — Vite HMR lo detecta automáticamente
- Para cambios en el backend (routers/): `docker cp router.py datavault-backend-1:/app/routers/` + `docker restart datavault-backend-1`
- Módulo de base de datos expone `engine` y `get_db`; no `AsyncSessionLocal` ni `async_session_maker`
- Usuarios admin de desarrollo: `admin@datavault.com` / `Admin1234!`

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
GET    /auth/audit             (admin) ?dataset_id=&user_id=&action=

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

## Próximos pasos

- [x] Deploy a AWS ECS Fargate + RDS + S3 + CloudFront vía Terraform
- [ ] Índice GIN en `records.data` cuando el volumen crezca
- [ ] Permisos granulares por dataset desde la UI
- [ ] Notificaciones en tiempo real por WebSocket para todos los cambios

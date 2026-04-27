# DataVault — Gestor de datos tabulares dinámicos

DataVault es una aplicación web tipo Airtable que permite crear datasets con columnas configurables en runtime, editar registros inline, importar Excel/CSV, y mantener historial de cambios con colaboración en tiempo real.

---

## Stack tecnológico

| Capa | Tecnología | Version |
|------|-----------|---------|
| Backend | Python + FastAPI (async) | 3.11 / 0.115 |
| Base de datos | PostgreSQL 16 (RDS) | 16 |
| Caché / WebSockets | ElastiCache Redis | 7.1 |
| ORM / Migraciones | SQLAlchemy async + Alembic | 2.0 / 1.13 |
| Auth | JWT (python-jose) + bcrypt (passlib) | 3.3 / 4.0.1 |
| WebSockets | Starlette built-in | — |
| Frontend | React + Vite + TypeScript | 19 / 8 / 6 |
| HTTP client | Axios | 1.15 |
| State / cache | TanStack Query | 5 |
| Charts | Recharts | 3 |
| Infraestructura | Terraform + AWS ECS Fargate + CloudFront + S3 | — |
| CI/CD | GitHub Actions + OIDC | — |

---

## Funcionalidades principales

- **Datasets dinamicos** — columnas configurables en runtime via JSONB (text, number, date, enum)
- **Edicion inline** — click en celda para editar directamente en la tabla
- **Importacion Excel/CSV** — con mapeo de columnas via modal
- **Vista Kanban** — agrupacion por columna enum
- **Vista graficos** — Recharts integrado
- **Historial de cambios** — audit log por registro y global
- **Soft delete + papelera** — registros eliminados restaurables
- **Busqueda full-text** — via GIN index en JSONB
- **Tiempo real** — WebSocket sincroniza cambios entre usuarios
- **Control de acceso** — roles globales (admin/editor/viewer) + permisos por dataset
- **Diagrama de schema** — visualizacion SVG del modelo de datos

---

## Estructura del proyecto

```
datavault/
├── docker-compose.yml
├── MIGRATION.md              # Guia para migrar a otra maquina
├── CLAUDE.md                 # Contexto para Claude Code
├── backend/
│   ├── main.py               # FastAPI app + CORS + WebSocket
│   ├── database.py           # SQLAlchemy async engine
│   ├── models.py             # ORM: User, Dataset, ColumnDefinition, Record, DatasetPermission, ChangeHistory
│   ├── schemas.py            # Pydantic schemas
│   ├── auth.py               # JWT utils, roles, permisos por dataset
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── alembic.ini
│   └── routers/
│       ├── auth.py           # /auth/* — register, login, users CRUD, audit
│       ├── datasets.py       # /datasets CRUD
│       ├── columns.py        # /datasets/{id}/columns CRUD
│       ├── records.py        # /datasets/{id}/records CRUD + import + history
│       └── permissions.py    # /datasets/{id}/permissions
└── frontend/
    └── src/
        ├── auth/             # AuthContext + JWT en localStorage
        ├── api/              # axios client + fetch helpers
        ├── components/       # DataGrid, CellEditor, modales, paneles, vistas
        └── pages/            # Login, DatasetList, DatasetView, Admin
```

---

## Modelo de datos

```
users                → datasets (via dataset_permissions)
datasets             → column_definitions   (1:N, define el schema)
datasets             → records              (1:N, datos en JSONB)
records              → change_history       (1:N, audit log)
```

- Los valores de cada registro viven en `records.data (JSONB)`, claves = `field_key` de cada columna.
- Soft delete: `records.deleted_at` — NULL = activo.
- GIN index en `records.data` para busqueda rapida.
- `change_history` registra cada operacion con `old_value` / `new_value` / `user_id`.

---

## Roles y permisos

| Rol | Datasets | Columnas | Registros | Usuarios | Permisos dataset |
|-----|----------|----------|-----------|----------|-----------------|
| admin | CRUD | CRUD | CRUD | CRUD | CRUD |
| editor | lectura | lectura | CRUD | — | — |
| viewer | lectura | lectura | lectura | — | — |

- El **primer usuario registrado** recibe rol `admin` automaticamente.
- Los permisos por dataset sobreescriben el rol global para ese dataset especifico.

---

## Levantar localmente (Windows + WSL2)

### Requisitos previos
- WSL2 con Ubuntu 24.04
- Docker Engine instalado en WSL2 (no Docker Desktop)

```bash
# Instalar Docker Engine en WSL2 (solo la primera vez)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Cerrar y reabrir la sesion WSL
```

### Iniciar servicios

```bash
wsl -d Ubuntu -- bash -c "
  service docker start && sleep 2
  cd /mnt/c/Users/<USUARIO>/Documents/dev-ops-dmc/datavault
  docker compose up -d
  docker compose ps
"
```

### Aplicar migraciones (primera vez o tras `down -v`)

```bash
wsl -d Ubuntu -- bash -c "
  cd /mnt/c/Users/<USUARIO>/Documents/dev-ops-dmc/datavault
  docker compose exec backend alembic upgrade head
"
```

### URLs locales

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 — `dev / dev / datavault` |

> En VSCode: `Ctrl+Shift+P` → `Simple Browser: Show` → `http://localhost:5173`

---

## Variables de entorno

### Backend (`docker-compose.yml` o `.env`)
```env
DATABASE_URL=postgresql+asyncpg://dev:dev@db/datavault
SECRET_KEY=<cambiar-en-produccion>   # openssl rand -hex 32
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

---

## API — Endpoints principales

```
# Auth
POST   /auth/register             {email, username, password}
POST   /auth/login                {email, password} → {access_token, user}
GET    /auth/me
GET    /auth/users                (admin)
PATCH  /auth/users/{id}/role      (admin) {role}
GET    /auth/audit                (admin) ?skip=&limit=&action=&dataset_id=&user_id=

# Datasets
GET    /datasets
POST   /datasets                  {name, description?}
DELETE /datasets/{id}

# Columnas
GET    /datasets/{id}/columns
POST   /datasets/{id}/columns     {name, field_key, data_type, rules, position}
PATCH  /datasets/{id}/columns/{col_id}
DELETE /datasets/{id}/columns/{col_id}

# Registros (paginados)
GET    /datasets/{id}/records     ?search=&include_deleted=&skip=&limit=
POST   /datasets/{id}/records     {data: {...}}
PATCH  /datasets/{id}/records/{rec_id}
DELETE /datasets/{id}/records/{rec_id}           (soft delete)
POST   /datasets/{id}/records/{rec_id}/restore
POST   /datasets/{id}/records/bulk-delete        {ids: [...]}
POST   /datasets/{id}/records/import-excel       multipart/form-data (campo: file)
GET    /datasets/{id}/records/{rec_id}/history

# Permisos por dataset
GET    /datasets/{id}/permissions
PUT    /datasets/{id}/permissions                {user_id, role}
DELETE /datasets/{id}/permissions/{user_id}

# WebSocket
WS     /ws/{dataset_id}?token=<jwt>
```

---

## CI/CD

El pipeline de GitHub Actions (`.github/workflows/ci-cd.yml`) despliega la infraestructura en AWS (ECS, S3, CloudFront) con *zero-downtime* y autenticación sin contraseñas (OIDC):

| Evento | Job |
|--------|-----|
| Push a `main` o `develop`, PR a `main` | `build` — lint (flake8) + tests (pytest) |
| Push a `develop` | `deploy-staging` — build multi-stage, sync a S3/CloudFront, ECR push, Alembic one-shot task, ECS update |
| Push a `main` | `deploy-production` — despliegue a entorno de producción |

---

## Comandos utiles

```bash
# Logs en vivo
docker compose logs backend -f
docker compose logs frontend -f

# Reiniciar backend (tras cambios Python)
docker compose restart backend

# Rebuild backend (tras cambiar requirements.txt)
docker compose build backend && docker compose up -d backend

# Nueva migracion Alembic
docker compose exec backend alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones
docker compose exec backend alembic upgrade head

# Psql interactivo
docker compose exec db psql -U dev -d datavault

# Backup de base de datos
docker compose exec db pg_dump -U dev --no-owner datavault > backup_$(date +%Y%m%d).sql
```

---

## Notas de produccion

1. **SECRET_KEY** — usar `openssl rand -hex 32` y nunca commitear el valor real.
2. **bcrypt fijado en `4.0.1`** — `passlib 1.7.4` es incompatible con `bcrypt >= 4.1`. No actualizar sin probar.
3. **Volumen `pgdata`** — `docker compose down -v` borra los datos permanentemente. Hacer dump antes.
4. **CORS** — configurar origenes especificos en produccion, no `*`.
5. **GIN index** — ya aplicado en migracion `29e5809b0914`. Si se restaura un dump antiguo: `CREATE INDEX ix_records_data_gin ON records USING GIN (data);`

---

## Pendientes

- [x] CI/CD con deploy real (AWS ECS + RDS, S3, CloudFront, IaC con Terraform)
- [ ] Tests de integracion para endpoints FastAPI
- [ ] Rate limiting en `/auth/login` y `/auth/register`
- [ ] Healthcheck en `docker-compose.yml` para el servicio `db`
- [x] Drag & drop unificado para reordenar cualquier tipo de columna
- [x] Secretos guardados de forma segura en AWS SSM Parameter Store

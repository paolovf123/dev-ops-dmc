# DataVault

> Gestor de datos tabulares dinamicos — tipo Airtable, desplegado en AWS con CI/CD automatizado.

![CI/CD](https://img.shields.io/github/actions/workflow/status/pvilcapoma/dev-ops-dmc/ci-cd.yml?branch=develop&label=CI%2FCD&logo=githubactions&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Terraform](https://img.shields.io/badge/Terraform-IaC-7B42BC?logo=terraform&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-ECS%20Fargate-FF9900?logo=amazonaws&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

---

## Que es DataVault

DataVault permite crear datasets con columnas configurables en runtime, editar registros inline, importar Excel/CSV y mantener historial de cambios completo con colaboracion en tiempo real via WebSocket.

**[Ver flujo DevOps interactivo](devops-flow.html)** — diagrama explicativo de toda la arquitectura CI/CD.

---

## Stack tecnologico

| Capa | Tecnologia | Version |
|------|-----------|---------|
| **Backend** | Python + FastAPI (async) | 3.11 / 0.115 |
| **Base de datos** | PostgreSQL (RDS) | 16 |
| **Cache / Rate limit** | Redis (ElastiCache) | 7.1 |
| **ORM / Migraciones** | SQLAlchemy async + Alembic | 2.0 / 1.13 |
| **Auth** | JWT (python-jose) + bcrypt | 3.3 / 4.0.1 |
| **Frontend** | React + Vite + TypeScript | 19 / 6 / 5 |
| **HTTP client** | Axios + TanStack Query | 1.15 / 5 |
| **Charts** | Recharts | 3 |
| **Infra (IaC)** | Terraform | ~5.0 |
| **Computo** | AWS ECS Fargate | — |
| **CDN + Reverse Proxy** | AWS CloudFront | — |
| **Frontend hosting** | AWS S3 | — |
| **Imagenes Docker** | AWS ECR | — |
| **Secretos** | AWS SSM Parameter Store | — |
| **CI/CD** | GitHub Actions + OIDC | — |

---

## Arquitectura en AWS

```
Usuario
  │  HTTPS
  ▼
┌─────────────────────────────────────────────────────┐
│              AWS CloudFront (CDN)                   │
│   ┌─────────────────────────────────────────────┐   │
│   │  /auth*, /datasets*, /ws*, /health*         │   │
│   │         → ALB (Application Load Balancer)  │   │
│   │  /* (default)                               │   │
│   │         → S3 (Frontend React build)        │   │
│   └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
          │                        │
          ▼                        ▼
   ┌─────────────┐         ┌──────────────┐
   │     ALB     │         │  S3 Bucket   │
   │  (port 80)  │         │  (React SPA) │
   └──────┬──────┘         └──────────────┘
          │
          ▼
   ┌─────────────────────┐
   │   ECS Fargate Task  │
   │  FastAPI + Uvicorn  │
   │  (4 workers)        │
   └──────┬──────────────┘
          │
     ┌────┴────┐
     ▼         ▼
┌─────────┐  ┌─────────┐
│  RDS    │  │  Redis  │
│ Postgres│  │(ElastiC)│
└─────────┘  └─────────┘

Secretos inyectados desde SSM Parameter Store (sin pasar por GitHub)
```

---

## Funcionalidades

- **Datasets dinamicos** — columnas configurables en runtime via JSONB (text, number, date, enum, boolean)
- **Edicion inline** — click en celda para editar directamente en la tabla
- **Importacion Excel/CSV** — con mapeo de columnas via modal
- **Vista Kanban** — agrupacion por columna enum con drag & drop
- **Vista graficos** — Recharts integrado (bar, line, pie)
- **Historial de cambios** — audit log por registro y global (admin)
- **Soft delete + papelera** — registros eliminados restaurables
- **Busqueda full-text** — via GIN index en JSONB
- **Tiempo real** — WebSocket sincroniza cambios entre usuarios
- **Control de acceso** — roles globales (admin/editor/viewer) + permisos por dataset
- **Diagrama de schema** — visualizacion SVG del modelo de datos

---

## Estructura del proyecto

```
dev_ops_dmc/
├── .github/
│   └── workflows/
│       ├── ci-cd.yml       # Pipeline GitHub Actions
│       └── main.tf         # Infraestructura AWS (Terraform)
├── datavault/
│   ├── docker-compose.yml  # Entorno local
│   ├── CLAUDE.md           # Contexto para Claude Code
│   ├── backend/
│   │   ├── main.py         # FastAPI app + CORS + WebSocket
│   │   ├── database.py     # SQLAlchemy async engine
│   │   ├── models.py       # ORM: User, Dataset, Column, Record, History
│   │   ├── schemas.py      # Pydantic schemas
│   │   ├── auth.py         # JWT utils, roles
│   │   ├── limiter.py      # slowapi rate limiter
│   │   ├── Dockerfile.prod # Multi-stage build para produccion
│   │   ├── requirements.txt
│   │   ├── alembic/        # Migraciones de base de datos
│   │   ├── routers/
│   │   │   ├── auth.py         # /auth/* register, login, users, audit
│   │   │   ├── datasets.py     # /datasets CRUD
│   │   │   ├── columns.py      # /datasets/{id}/columns CRUD
│   │   │   ├── records.py      # /datasets/{id}/records CRUD + import
│   │   │   └── permissions.py  # /datasets/{id}/permissions
│   │   └── tests/
│   │       ├── conftest.py     # SQLite in-memory fixtures
│   │       ├── test_auth.py
│   │       ├── test_datasets.py
│   │       └── test_records.py
│   └── frontend/
│       └── src/
│           ├── auth/           # AuthContext + JWT en localStorage
│           ├── api/            # axios client + fetch helpers
│           ├── components/     # DataGrid, CellEditor, modales
│           └── pages/          # Login, DatasetList, DatasetView, Admin
├── devops-flow.html            # Diagrama interactivo del flujo DevOps
└── README.md
```

---

## Modelo de datos

```
users ──────────────────────────────────────────────────────┐
  │                                                         │
  │ (via dataset_permissions)                               │
  ▼                                                         │
datasets ──────────────────────────────────────────────────►│
  │                 │                                       │
  ▼                 ▼                                       │
column_definitions  records ──────────────────────────────► change_history
                      │  (JSONB: {field_key: value, ...})
                      │
                      └── deleted_at NULL/timestamp (soft delete)
```

- Los valores de cada registro viven en `records.data (JSONB)`, claves = `field_key` de cada columna.
- Soft delete via `records.deleted_at` — NULL = activo, timestamp = eliminado.
- GIN index en `records.data` para busqueda rapida full-text.
- `change_history` registra cada operacion con `old_value / new_value / user_id`.

---

## Roles y permisos

| Rol | Datasets | Columnas | Registros | Usuarios | Permisos por dataset |
|-----|:--------:|:--------:|:---------:|:--------:|:--------------------:|
| **admin** | CRUD | CRUD | CRUD | CRUD | CRUD |
| **editor** | lectura | lectura | CRUD | — | — |
| **viewer** | lectura | lectura | lectura | — | — |

- El **primer usuario registrado** recibe rol `admin` automaticamente.
- Los permisos por dataset sobreescriben el rol global para ese dataset especifico.

---

## Levantar localmente

### Requisitos
- Docker Desktop corriendo en Windows

```bash
# Desde el directorio datavault/
cd datavault
docker compose up -d

# Primera vez: aplicar migraciones
docker compose exec backend alembic upgrade head

# (Opcional) Cargar datos de ejemplo
docker compose exec backend python setup_seed.py
```

### URLs locales

| Servicio | URL |
|----------|-----|
| **Frontend** | http://localhost:5173 |
| **Backend API** | http://localhost:8000 |
| **Swagger UI** | http://localhost:8000/docs |
| **PostgreSQL** | localhost:5432 — `dev / dev / datavault` |

### Variables de entorno

**Backend** (`datavault/.env`):
```env
DATABASE_URL=postgresql+asyncpg://dev:dev@db/datavault
SECRET_KEY=datavault-secret-change-in-production-xyz-123
ALLOWED_ORIGINS=http://localhost:5173
```

**Frontend** (`datavault/frontend/.env`):
```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

---

## Desplegar en AWS

### 1. Prerequisitos

```bash
# Instalar herramientas
brew install terraform awscli  # macOS
# o descargar desde terraform.io y aws.amazon.com

# Configurar credenciales AWS
aws configure
```

### 2. Desplegar infraestructura

```bash
cd .github/workflows
terraform init
terraform apply
```

Terraform crea automaticamente:
- **VPC** con subnets publicas/privadas
- **ECR** — repositorio de imagenes Docker
- **ECS Fargate** — cluster + service + task definition
- **RDS PostgreSQL** — base de datos gestionada
- **ALB** — load balancer con health checks
- **S3** — bucket para el frontend
- **CloudFront** — CDN + reverse proxy HTTPS
- **SSM Parameter Store** — secretos encriptados
- **IAM OIDC** — autenticacion sin contraseñas para GitHub Actions
- **CloudWatch** — logs y alarmas

### 3. Configurar GitHub

Despues de `terraform apply`, obtener los valores y configurarlos en:
**GitHub → Settings → Secrets and variables → Actions → Environment: staging**

| Tipo | Nombre | Valor |
|------|--------|-------|
| **Secret** | `AWS_ROLE_ARN_STAGING` | ARN del rol IAM (output de Terraform) |
| **Variable** | `VITE_API_URL` | `https://<cloudfront-domain>` |
| **Variable** | `VITE_WS_URL` | `wss://<cloudfront-domain>` |
| **Variable** | `AWS_REGION` | `us-east-1` |

> Usar el skill `/datavault-aws-up` en Claude Code para automatizar esto.

### 4. Trigger del pipeline

```bash
git checkout develop
git push origin develop
```

El pipeline hace en orden:
1. Lint (flake8) + Tests (pytest con SQLite in-memory)
2. Build imagen Docker multi-stage y push a ECR
3. Build frontend Vite y sync a S3 + CloudFront invalidation
4. Migraciones Alembic (one-shot ECS task)
5. Actualizar ECS service con nueva task definition

---

## CI/CD — Pipeline

```
Push a develop
      │
      ▼
┌─────────────┐
│    build    │  Lint (flake8) + Tests (pytest)
└──────┬──────┘
       │ OK
       ▼
┌──────────────────────────────────────────────┐
│              deploy-staging                  │
│                                              │
│  1. OIDC → AWS (sin contraseñas)            │
│  2. Docker build → ECR push                 │
│  3. npm build → S3 sync + CF invalidation   │
│  4. Alembic migrations (ECS one-shot task)  │
│  5. ECS update-service (rolling deploy)     │
└──────────────────────────────────────────────┘
```

---

## API — Endpoints principales

```
# Autenticacion
POST   /auth/register             {email, username, password}
POST   /auth/login                {email, password} → {access_token, user}
GET    /auth/me
GET    /auth/users                (admin only)
PATCH  /auth/users/{id}/role      (admin) {role}
GET    /auth/audit                (admin) ?skip=&limit=&action=

# Datasets
GET    /datasets
POST   /datasets                  {name, description?}
PATCH  /datasets/{id}             {name?, description?}
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
POST   /datasets/{id}/records/import-excel       multipart/form-data
GET    /datasets/{id}/records/{rec_id}/history

# Permisos por dataset
GET    /datasets/{id}/permissions
PUT    /datasets/{id}/permissions                {user_id, role}
DELETE /datasets/{id}/permissions/{user_id}

# WebSocket (tiempo real)
WS     /ws/{dataset_id}           primer mensaje debe ser el JWT token
```

---

## Comandos utiles

```bash
# === LOCAL ===
# Logs en vivo
docker compose logs backend -f
docker compose logs frontend -f

# Reiniciar backend (tras cambios Python)
docker compose restart backend

# Nueva migracion Alembic
docker compose exec backend alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones
docker compose exec backend alembic upgrade head

# Tests
docker compose exec backend pytest tests/ -v

# Psql interactivo
docker compose exec db psql -U dev -d datavault

# Backup de base de datos
docker compose exec db pg_dump -U dev --no-owner datavault > backup_$(date +%Y%m%d).sql


# === AWS ===
# Ver logs en CloudWatch
aws logs tail /ecs/datavault-backend-staging --follow

# Estado del servicio ECS
aws ecs describe-services --cluster datavault-staging --services datavault-backend

# Forzar nuevo deploy
aws ecs update-service --cluster datavault-staging --service datavault-backend --force-new-deployment

# Ver estado de Terraform
cd .github/workflows && terraform show

# Destruir toda la infraestructura (cuidado!)
cd .github/workflows && terraform destroy
```

---

## Notas de produccion

1. **SECRET_KEY** — usar `openssl rand -hex 32` y guardarlo en SSM, nunca en el repositorio.
2. **bcrypt fijado en `4.0.1`** — `passlib 1.7.4` es incompatible con `bcrypt >= 4.1`. No actualizar sin probar.
3. **NAT Gateway** — desactivado para reducir costos (~$32/mes). Activar `enable_nat_gateway = true` en `main.tf` para produccion real.
4. **Redis** — desactivado para reducir costos. Descomentar en `main.tf` para rate limiting distribuido en produccion.
5. **CORS** — se configura automaticamente con el dominio de CloudFront via Terraform.
6. **GIN index** — ya aplicado en migracion `dataset_permissions_and_gin_index`. Necesario cuando el volumen de registros crezca.

---

## Pendientes

- [x] CI/CD con deploy real (AWS ECS + RDS, S3, CloudFront, IaC con Terraform)
- [x] Autenticacion OIDC (sin AWS access keys hardcodeadas)
- [x] Secretos en AWS SSM Parameter Store
- [x] CloudFront como reverse proxy HTTPS end-to-end
- [x] Logs en CloudWatch
- [x] Drag & drop para reordenar columnas
- [ ] Permisos granulares por dataset desde la UI
- [ ] Notificaciones en tiempo real por WebSocket para todos los cambios
- [ ] Activar NAT Gateway + subnets privadas para produccion
- [ ] Activar Redis para rate limiting distribuido
- [ ] Dominio personalizado con ACM certificate

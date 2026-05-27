# DataVault

> Gestor de datos tabulares dinamicos — tipo Airtable, desplegado en AWS con CI/CD automatizado via CodePipeline.

**Staging desplegado:** [https://d33w5b1c95eyrb.cloudfront.net](https://d33w5b1c95eyrb.cloudfront.net)

![CodePipeline](https://img.shields.io/badge/CI%2FCD-AWS%20CodePipeline-FF9900?logo=amazonaws&logoColor=white)
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
| **CI/CD** | AWS CodePipeline + CodeBuild + CodeStar Connection | — |

---

## Arquitectura en AWS

```
                    Usuario
                       │  HTTPS
                       ▼
              ┌────────────────────┐
              │   CloudFront CDN   │
              │  (path routing)    │
              └─────────┬──────────┘
        /* (default)    │    /auth* /datasets* /workspaces*
                        │    /groups* /permissions* /records*
                        │    /ws* /health
              ┌─────────┴───────────────────┐
              ▼                             ▼
       ┌──────────────┐              ┌─────────────┐
       │  S3 (React)  │              │     ALB     │
       │   frontend   │              │  (HTTP :80) │
       └──────────────┘              └──────┬──────┘
                                            │
                          VPC 10.0.0.0/16   │
                  ┌─────────────────────────┼─────────────────┐
                  │  Subnets publicas (us-east-1a/b)          │
                  │  ┌─────┐    ┌──────────┐                  │
                  │  │ IGW │    │  NAT GW  │  ← EIPs          │
                  │  └─────┘    └────┬─────┘                  │
                  │                  │                        │
                  │  Subnets privadas (us-east-1a/b)          │
                  │  ┌──────────────────────┐                 │
                  │  │  ECS Fargate task    │                 │
                  │  │  FastAPI + Uvicorn   │ ←── SG: solo ALB│
                  │  └──┬───────────────────┘                 │
                  │     │                                     │
                  │  ┌──▼───────┐                             │
                  │  │   RDS    │ ←── SG: solo ECS            │
                  │  │ Postgres │                             │
                  │  └──────────┘                             │
                  └───────────────────────────────────────────┘

Secretos (DATABASE_URL, SECRET_KEY, ALLOWED_ORIGINS)
  → SSM Parameter Store SecureString
  → inyectados en runtime al task ECS via execution role
```

---

## Funcionalidades

### Gestión de datos
- **Datasets dinamicos** — 14 tipos de columna configurables en runtime via JSONB (text, long_text, number, currency, percent, boolean, enum, multiselect, date, email, phone, url, rating, relation)
- **Edicion inline** — click en celda para editar directamente en la tabla, incluyendo editor multi-chip para relaciones
- **Importacion Excel/CSV multi-hoja** — preview por hoja, una hoja = un dataset (auto-detección de tipos)
- **Vista Kanban** — agrupacion por columna enum con drag & drop
- **Vista graficos** — Recharts integrado (bar, line, pie)
- **Historial de cambios** — audit log por registro y global (admin)
- **Soft delete + papelera** — registros eliminados restaurables
- **Busqueda full-text** — via GIN index en JSONB
- **Tiempo real** — WebSocket sincroniza cambios entre usuarios

### Relaciones N:N (modelo Airtable-style)
- **Todas las relaciones son arrays JSONB** — una columna `relation` puede guardar uno o varios valores sin cambiar de tipo
- **Scanner avanzado** que detecta relaciones por nombre + contenido (tilde/case-insensitive)
- **Tabla intermedia opcional** solo cuando hay atributos del vínculo (cantidad, fecha, monto). Auto-marcadas con `is_bridge=true` y ocultas por defecto
- **Joins via bridge** — `DataGrid` traversa 2 saltos cuando el vínculo pasa por tabla intermedia
- **Editor multi-chip** con autocomplete server-side debounced
- **Diagrama de relaciones** SVG con cardinalidad N↔N, layout en grilla cuando aplica, separación visual de datasets aislados

### Control de acceso
- **Roles globales**: admin / editor / viewer (nivel sistema)
- **Roles de workspace**: owner / admin_ws / member
- **Permisos por dataset**: admin / editor / viewer / none (overrides individuales o por grupo)
- **Grupos de trabajo** por workspace con permisos a múltiples datasets
- **Effective_role** con prioridad: admin global > directo > grupo > workspace
- **Vista invertida**: ver "qué datasets puede ver Juan" (no solo "quién puede ver el dataset X")
- **Centro unificado Personas y accesos** (`/admin/personas`): usuarios, miembros, grupos y asignación de accesos con matriz editable (control segmentado Sin acceso/Ver/Editar/Admin)

---

## Estructura del proyecto

```
dev_ops_dmc/
├── terraform/                  # === INFRAESTRUCTURA COMO CODIGO ===
│   ├── main.tf                 # VPC, ECR, ECS, RDS, ALB, S3, CloudFront, IAM, SSM
│   ├── codepipeline.tf         # CodePipeline + 5 CodeBuild projects + CodeStar
│   ├── variables.tf            # aws_region, environment, db_password, github_owner/repo
│   ├── outputs.tf              # cloudfront_url, ecr_backend_url, ecs_*, codepipeline_name
│   ├── bootstrap.sh            # Crea el bucket S3 de tfstate (correr 1 vez)
│   └── floci/                  # Variante para Floci (emulador local)
├── .aws/                       # === BUILDSPECS DE CODEPIPELINE ===
│   ├── buildspec-test.yml          # Stage 2: flake8 + pytest
│   ├── buildspec-build-backend.yml # Stage 3a: docker build + push ECR
│   ├── buildspec-build-frontend.yml# Stage 3b: npm build + S3 sync + CF invalidate
│   ├── buildspec-migrate.yml       # Stage 4: alembic upgrade head via ECS run-task
│   └── buildspec-deploy-ecs.yml    # Stage 5: ecs update-service + wait stable
├── .github/workflows/
│   └── ci-cd.yml               # GitHub Actions DESHABILITADO (workflow_dispatch only)
├── .claude/                    # Skills y comandos de Claude Code para devs
│   ├── commands/               # /datavault-aws-up, /datavault-aws-deploy, etc.
│   └── settings.json
├── datavault/
│   ├── docker-compose.yml      # Entorno local
│   ├── CLAUDE.md               # Contexto del producto (modelo, endpoints, features)
│   ├── backend/
│   │   ├── main.py             # FastAPI app + CORS + WebSocket
│   │   ├── database.py         # SQLAlchemy async engine
│   │   ├── models.py           # ORM: User, Dataset, Column, Record, History
│   │   ├── schemas.py          # Pydantic schemas
│   │   ├── auth.py             # JWT utils, roles
│   │   ├── limiter.py          # slowapi rate limiter
│   │   ├── Dockerfile.prod     # Multi-stage build para produccion
│   │   ├── requirements.txt
│   │   ├── alembic/            # Migraciones de base de datos
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── datasets.py
│   │   │   ├── columns.py
│   │   │   ├── records.py
│   │   │   ├── permissions.py
│   │   │   ├── workspaces.py
│   │   │   └── groups.py
│   │   └── tests/
│   └── frontend/
│       └── src/
│           ├── auth/           # AuthContext + JWT en localStorage
│           ├── workspace/      # WorkspaceContext
│           ├── api/            # axios client + fetch helpers
│           ├── components/     # DataGrid, CellEditor, LinkTableModal, etc.
│           └── pages/          # Login, DatasetList, DatasetView, Admin*
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

### Roles globales (nivel sistema)

| Rol | Datasets | Columnas | Registros | Usuarios | Workspaces |
|-----|:--------:|:--------:|:---------:|:--------:|:----------:|
| **admin** | CRUD | CRUD | CRUD | CRUD | CRUD |
| **editor** | lectura | lectura | CRUD | — | — |
| **viewer** | lectura | lectura | lectura | — | — |

- El **primer usuario registrado** recibe rol `admin` automaticamente.
- Los permisos por dataset sobreescriben el rol global para ese dataset especifico.

### Roles de workspace (nivel equipo)

| Workspace role | Acceso a datos del workspace | Gestionar miembros/grupos | Eliminar workspace |
|---|:---:|:---:|:---:|
| **owner** | admin (CRUD total) | ✓ | ✓ |
| **admin_ws** | editor (editar registros) | ✓ | ✗ |
| **member** | editor (editar registros) | ✗ | ✗ |

### Workspaces y grupos

- Un usuario puede pertenecer a **múltiples workspaces** con roles distintos.
- Cada workspace tiene sus propios **datasets** y **grupos** (los grupos son scoped a un workspace, no cruzan).
- Los grupos permiten asignar permisos por conjunto de usuarios sobre datasets específicos.
- Flujo de incorporación: en **Personas y accesos** (`/admin/personas`) → tab **Miembros** se agrega al usuario al workspace con su rol → tab **Grupos** se crean grupos → tab **Accesos** se otorga acceso a datasets.

### Information Architecture admin (consolidada, role-based)

La administración se unificó en **2 páginas** (más Auditoría), eliminando el solapamiento previo:

| Página | Rol mínimo | Qué hace |
|---|---|---|
| `/admin/personas` (= `/admin/accesos`) | admin global / owner / admin_ws | **Centro unificado de Personas y accesos** con 4 tabs: **Usuarios del sistema** (solo admin) · **Miembros** del workspace · **Grupos** · **Accesos**. Selector de workspace arriba (admin ve todos; owner/admin_ws solo los suyos, preseleccionados). |
| `/admin/workspaces` | owner / admin_ws / admin global | **Hub de workspaces**: crear/editar/eliminar equipos + panel por workspace con tabs **Datasets** y **Configuración** (preselecciona el primero). |
| `/admin/audit` | admin global | Log de cambios con filtros. |

**Asignar accesos** (tab Accesos, role-aware y editable): se elige un **grupo** (chips) y, por cada dataset, se asigna el nivel con un control segmentado **Sin acceso · Ver · Editar · Admin** (un click, guardado optimista). La vista **Por miembro** muestra el rol efectivo (solo lectura). El admin_ws no puede asignar rol `owner`.

> Rutas legacy `/admin/users`, `/admin/groups` → redirigen a `/admin/personas`; `/admin/permissions` → `/admin/accesos`.

**Effective role** se calcula en este orden de prioridad:
1. **Admin global** del sistema → admin de todo
2. **Permiso directo** sobre el dataset (`dataset_permissions`)
3. **Mejor permiso de grupo** entre los grupos del usuario (`dataset_group_permissions`)
4. **Rol de workspace** (member/admin_ws → editor, owner → admin)
5. Sin permisos → sin acceso

Permisos con role `none` (bloqueo explícito directo) overrides cualquier grupo o workspace.

---

## Levantar localmente

### Requisitos
- Docker — Docker Desktop en Windows/macOS **o** `docker.io` dentro de WSL Ubuntu
- Skills de Claude Code (opcional): `/datavault-start` y `/datavault-stop` orquestan los pasos

```bash
# Desde el directorio datavault/
cd datavault
docker compose up -d

# Primera vez: aplicar migraciones
docker compose exec backend alembic upgrade head

# (Opcional) Cargar datos de ejemplo
docker compose exec backend python setup_seed.py
```

> **Devs en Windows con Docker en WSL:** invocar `docker compose` desde WSL para que use el daemon Linux. Ejemplo: `wsl -d Ubuntu -- bash -c "cd /mnt/c/Users/<TU_USER>/Documents/.../datavault && docker compose up -d"`.

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

El flujo completo es: **bootstrap del tfstate → aplicar infra → aprobar conexion GitHub → primer push**.

### 1. Prerequisitos

| Herramienta | Donde | Como instalarla |
|---|---|---|
| AWS CLI v2 | local o WSL | https://aws.amazon.com/cli/ |
| Terraform | local o WSL | https://www.terraform.io/downloads |
| Docker | local o WSL | Docker Desktop o `apt install docker.io` en WSL |
| jq | local o WSL | `apt install jq` / `choco install jq` |
| AWS credentials | `~/.aws/credentials` | `aws configure` |

> **Devs en Windows con Docker en WSL:** crear un symlink `~/.aws → /mnt/c/Users/<TU_USER>/.aws` en WSL para reusar las credenciales de Windows. Ver memoria del proyecto para mas detalles.

### 2. Bootstrap del bucket de tfstate (solo la primera vez)

```bash
cd terraform
bash bootstrap.sh
```

Crea `s3://datavault-tfstate-<ACCOUNT_ID>` con versionado y block public access. Sin esto, `terraform init` falla con `NoSuchBucket`.

### 3. Aplicar infraestructura

```bash
cd terraform
terraform init -reconfigure

# El db_password no tiene default — pasarlo via env var (no en CLI history)
export TF_VAR_db_password=$(openssl rand -hex 14)

terraform plan -var=environment=staging -out=tfplan.staging
terraform apply tfplan.staging
```

Terraform crea ~62 recursos automaticamente:
- **VPC** + 2 subnets publicas + 2 privadas + IGW + **NAT Gateway** + 2 EIPs + route tables
- **4 Security Groups** (ALB, ECS, RDS, Redis)
- **ECR** repository + lifecycle policy
- **ECS Fargate** cluster + service + task definition (en subnets privadas)
- **RDS PostgreSQL** 16 + DB subnet group
- **ALB** + listener + target group
- **S3** bucket frontend + bucket policy + public access block
- **CloudFront** + Origin Access Control (HTTPS end-to-end)
- **SSM Parameter Store** (database_url, secret_key, allowed_origins — SecureString)
- **IAM** roles: ecs_execution_role, codebuild, codepipeline, github_actions (+ OIDC provider)
- **CodePipeline** + 5 CodeBuild projects + CodeStar Connection
- **CloudWatch** log group + 2 alarmas (ECS CPU high, ALB 5xx)

Costo aproximado: ~$70-90/mes mientras la infra este arriba.

> Skill de Claude Code: `/datavault-aws-up staging` automatiza los pasos 2 y 3.

### 4. Aprobar la conexion GitHub (paso manual obligatorio)

Terraform crea la conexion CodeStar en estado **PENDING**. El pipeline no se va a disparar hasta aprobarla:

1. AWS Console → **Developer Tools → Settings → Connections**
2. Click en `datavault-github-staging`
3. **"Update pending connection"** → autenticar con GitHub
4. Permitir acceso al repo `<owner>/<repo>` declarado en `variables.tf`
5. El estado debe pasar a **AVAILABLE**

Verificar por CLI:
```bash
aws codestar-connections get-connection \
  --connection-arn $(terraform output -raw codestar_connection_arn) \
  --query 'Connection.ConnectionStatus'
```

### 5. Disparar el pipeline

Una vez la conexion esta AVAILABLE, **cualquier push a `develop` dispara el pipeline automaticamente** (gracias a `DetectChanges=true` en CodePipeline).

```bash
git push origin develop
```

Para disparar manualmente sin push:
```bash
aws codepipeline start-pipeline-execution --name datavault-staging
```

El pipeline corre en orden (~8-15 min total):
1. **Source** — GitHub → S3 artifacts
2. **Test** — flake8 + pytest (SQLite in-memory)
3. **Build** — backend Docker → ECR `:latest` + `:<commit-sha>` (en paralelo con frontend Vite → S3 + CloudFront invalidation)
4. **Migrate** — `alembic upgrade head` como tarea Fargate one-shot
5. **Deploy** — `ecs update-service --force-new-deployment` + wait services-stable

---

## CI/CD — Pipeline (AWS CodePipeline)

```
push a develop                                  push a main
     │                                               │
     ▼                                               ▼
┌────────────┐                              ┌────────────┐
│  STAGING   │                              │    PROD    │
│ (datavault │                              │ (datavault │
│  -staging) │                              │   -prod)   │
└─────┬──────┘                              └─────┬──────┘
      │
      ▼  (CodeStar Connection a GitHub, DetectChanges=true)
┌────────── 1. Source ──────────────────────────────────────────┐
│  GitHub → source_output (zip del repo)                        │
└───────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────── 2. Test ────────────────────────────────────────────┐
│  CodeBuild: datavault-test-{env}                              │
│  buildspec-test.yml — flake8 + pytest                         │
└───────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────── 3. Build (paralelo, run_order=1) ───────────────────┐
│  ┌─ BuildBackend ────────────┐ ┌─ BuildFrontend ────────────┐ │
│  │ buildspec-build-backend   │ │ buildspec-build-frontend   │ │
│  │ privileged_mode=true      │ │ Node 20                    │ │
│  │ • docker login ECR        │ │ • npm ci + npm run build   │ │
│  │ • docker build/push       │ │ • s3 sync dist/            │ │
│  │   tags :latest + :<sha>   │ │ • cloudfront invalidation  │ │
│  └───────────────────────────┘ └────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────── 4. Migrate ─────────────────────────────────────────┐
│  CodeBuild: datavault-migrate-{env}                           │
│  • describe-task-definition + jq cambia .image → :latest      │
│  • register-task-definition (nueva revision)                  │
│  • ecs run-task FARGATE con override "alembic upgrade head"   │
│  • wait tasks-stopped + valida exit_code=0                    │
└───────────────────────────────────────────────────────────────┘
      │
      ▼
┌────────── 5. Deploy ──────────────────────────────────────────┐
│  CodeBuild: datavault-deploy-ecs-{env}                        │
│  • ecs update-service --force-new-deployment                  │
│  • ecs wait services-stable                                   │
└───────────────────────────────────────────────────────────────┘
      │
      ▼
App nueva corriendo en ECS Fargate
```

**Mapeo branch → entorno** ([codepipeline.tf:1-4](terraform/codepipeline.tf#L1-L4)):
- `develop` → pipeline `datavault-staging`
- `main` → pipeline `datavault-prod`

**Por que CodePipeline y no GitHub Actions:** la version anterior usaba GA con OIDC. Se migro a CodePipeline para:
- Mantener todo el deploy dentro de AWS (auditoria via CloudTrail, IAM nativo, sin secrets cruzando el limite de GitHub).
- Permitir despliegues independientes del estado de GitHub Actions (rate limits, outages).
- El workflow `.github/workflows/ci-cd.yml` quedo como fallback manual (`workflow_dispatch` only).

---

## API — Endpoints principales

```
# Autenticacion
POST   /auth/register                    {email, username, password}
POST   /auth/login                       {email, password} → {access_token, user}
GET    /auth/me
GET    /auth/users                       admin: todos | ?workspace_id=: miembros del ws | ?list_all=true: todos (owners)
PATCH  /auth/users/{id}/role             (admin) {role}
PATCH  /auth/users/{id}/deactivate       (admin)
GET    /auth/audit                       (admin) ?skip=&limit=&action=&workspace_id=&user_id=

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
GET    /groups/{id}/dataset-access       (admin/member del grupo/ws-admin) — datasets accesibles + rol

# Datasets
GET    /datasets                         ?workspace_id=
POST   /datasets                         {name, description?, workspace_id?, is_bridge?}
PATCH  /datasets/{id}                    {name?, description?, is_bridge?}
DELETE /datasets/{id}

# Columnas
GET    /datasets/{id}/columns
POST   /datasets/{id}/columns            {name, field_key, data_type, rules, position}
PATCH  /datasets/{id}/columns/{col_id}              (al cambiar a data_type=relation: auto-migra scalars → arrays)
DELETE /datasets/{id}/columns/{col_id}
POST   /datasets/{id}/columns/{col_id}/normalize-values   unifica variantes (case/tildes) por su forma más común

# Registros (paginados)
GET    /datasets/{id}/records            ?search=&include_deleted=&skip=&limit=&cursor=
POST   /datasets/{id}/records            {data: {...}}
PATCH  /datasets/{id}/records/{rec_id}
DELETE /datasets/{id}/records/{rec_id}           (soft delete)
POST   /datasets/{id}/records/{rec_id}/restore
POST   /datasets/{id}/records/bulk-delete        {ids: [...]}
POST   /datasets/{id}/records/import-excel       multipart/form-data
POST   /datasets/import-from-excel               multi-hoja: importa varias hojas como datasets nuevos
GET    /datasets/{id}/records/{rec_id}/history

# Permisos por dataset
GET    /datasets/{id}/permissions                listar permisos de usuarios sobre el dataset
PUT    /datasets/{id}/permissions                {user_id, role: admin|editor|viewer|none}
DELETE /datasets/{id}/permissions/{user_id}
GET    /datasets/{id}/permissions/groups
PUT    /datasets/{id}/permissions/groups         {group_id, role}
DELETE /datasets/{id}/permissions/groups/{group_id}

# Matriz de accesos (alimenta la tab Accesos en 1 sola request — evita N+1)
GET    /workspaces/{id}/access-matrix?mode=groups|users
                                          groups: permisos explícitos por grupo · users: rol efectivo por miembro
GET    /groups/{id}/dataset-access        datasets accesibles por un grupo
GET    /auth/users/{id}/dataset-access    rol efectivo del usuario por dataset (con source)

# Relaciones — Scanner avanzado + matriz invertida
GET    /datasets/relationships/scan?workspace_id=&min_content_ratio=
                                          devuelve candidates + cleanup_suggestions

# Templates
GET    /datasets/templates/catalog        lista plantillas pre-armadas (Inventario, CRM, Tickets, Tareas)
POST   /datasets/templates/{template_id}?workspace_id=&name=&include_sample=
                                          crea dataset desde plantilla

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
cd terraform && terraform show

# Listar ejecuciones del pipeline
aws codepipeline list-pipeline-executions --pipeline-name datavault-staging --max-items 5

# Disparar pipeline manualmente
aws codepipeline start-pipeline-execution --name datavault-staging

# Estado actual del pipeline por stage
aws codepipeline get-pipeline-state --name datavault-staging \
  --query "stageStates[].{Stage:stageName,Status:latestExecution.status}" --output table

# Logs de un build especifico (reemplazar <build-id> por el ID que aparece en CodePipeline)
aws logs tail /aws/codebuild/datavault-build-frontend-staging --follow

# Destruir toda la infraestructura (cuidado! ~62 recursos)
cd terraform && terraform destroy -var=environment=staging
```

---

## Notas de produccion

1. **SECRET_KEY** — generado automaticamente por `random_password.secret_key` en Terraform y guardado en SSM `/datavault/{env}/secret_key` como SecureString. Nunca esta en el repo.
2. **db_password** — no tiene default en `variables.tf`. Pasarlo via `TF_VAR_db_password` (en `~/.aws/datavault-<env>.env` o un secret manager). Una vez aplicado, la URL completa queda en SSM `/datavault/{env}/database_url`.
3. **NAT Gateway activado** — los ECS tasks corren en subnets privadas y salen a Internet via NAT. Costo: ~$32/mes + transferencia. Esto fue migrado desde la version inicial que usaba subnets publicas.
4. **Redis** — desactivado para reducir costos (~$10/mes). El rate limiter (`slowapi`) usa memoria local del proceso. Para multi-task hace falta descomentar el `aws_elasticache_*` en `main.tf` y configurar `REDIS_URL` en la task definition.
5. **bcrypt fijado en `4.0.1`** — `passlib 1.7.4` es incompatible con `bcrypt >= 4.1`. No actualizar sin probar.
6. **CORS** — `ALLOWED_ORIGINS` se inyecta desde SSM con el dominio de CloudFront via Terraform.
7. **GIN index** — ya aplicado en migracion `dataset_permissions_and_gin_index`. Necesario cuando el volumen de registros crezca.
8. **Aprobacion manual del CodeStar Connection** — paso obligatorio en cada nuevo entorno (`staging`, `prod`). No se puede automatizar 100% por diseno de AWS.

---

## Pendientes

- [x] CI/CD con deploy real (AWS ECS + RDS, S3, CloudFront, IaC con Terraform)
- [x] Migracion CI/CD de GitHub Actions a AWS CodePipeline (todo dentro de AWS)
- [x] NAT Gateway activado + ECS en subnets privadas
- [x] Secretos en AWS SSM Parameter Store
- [x] CloudFront como reverse proxy HTTPS end-to-end
- [x] Logs en CloudWatch + alarmas (ECS CPU high, ALB 5xx)
- [x] Drag & drop para reordenar columnas
- [x] Workspaces (equipos) con roles owner / admin_ws / member
- [x] Grupos de usuarios con permisos por dataset
- [x] Scripts Python (Computed Datasets) via AWS Lambda
- [x] AdminWorkspaces, AdminGroups, AdminUsers, AdminAudit con UX avanzada
- [ ] Notificaciones en tiempo real por WebSocket para todos los cambios
- [ ] Activar Redis para rate limiting distribuido (multi-task)
- [ ] Dominio personalizado con ACM certificate
- [ ] Pipeline de prod (`/datavault-aws-up prod`)

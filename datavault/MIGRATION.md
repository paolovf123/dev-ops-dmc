# TransExcel — Guía de migración

> Documento para reubicar el proyecto a otra carpeta o máquina desde cero.
> Mantener actualizado ante cambios de estructura, dependencias o modelo de datos.
>
> **Última actualización:** 2026-04-27

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
│   │                         #       DatasetPermission, ChangeHistory
│   ├── schemas.py            # Pydantic schemas (in/out)
│   ├── auth.py               # JWT utils, hash, get_current_user, require_roles,
│   │                         #   ds_require_* (dataset-aware), effective_role()
│   ├── alembic/
│   │   └── versions/
│   │       ├── 48460562010c_init.py                          # schema inicial
│   │       ├── a98108fe73ca_add_users_and_auth.py            # tabla users + auth cols en change_history
│   │       └── 29e5809b0914_dataset_permissions_and_gin_index.py  # permisos por dataset + GIN index
│   └── routers/
│       ├── auth.py           # /auth/* — register, login, me, users CRUD, /auth/audit
│       ├── datasets.py       # /datasets CRUD
│       ├── columns.py        # /datasets/{id}/columns CRUD
│       ├── records.py        # /datasets/{id}/records CRUD + paginación + import-excel + history
│       └── permissions.py    # /datasets/{id}/permissions — permisos por dataset
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    ├── .env                  # VITE_API_URL, VITE_WS_URL
    └── src/
        ├── main.tsx          # Router + providers: Query, Auth, Toast, Confirm
        ├── index.css         # Paolo Corp Design System (Inter, CSS custom props)
        ├── types.ts
        ├── auth/
        │   └── AuthContext.tsx       # JWT en localStorage, axios default header
        ├── api/
        │   ├── client.ts             # axios.create + interceptor de token
        │   └── datasets.ts           # fetch helpers — getRecords devuelve {data, total}
        ├── components/
        │   ├── Toast.tsx             # ToastProvider + useToast() — notificaciones
        │   ├── UserMenu.tsx          # Dropdown usuario en header (admin links incluidos)
        │   ├── ConfirmDialog.tsx     # Modal confirm (reemplaza window.confirm)
        │   ├── DataGrid.tsx          # Tabla editable con inline editing + selección
        │   ├── CellEditor.tsx        # Input adaptado por data_type
        │   ├── AddColumnModal.tsx    # Modal nueva columna
        │   ├── EditColumnModal.tsx   # Modal editar columna
        │   ├── ColumnPanel.tsx       # Panel lateral columnas + visibilidad
        │   ├── TrashPanel.tsx        # Panel papelera (soft delete + restaurar)
        │   ├── RecordHistoryPanel.tsx # Panel historial por registro
        │   ├── KanbanView.tsx        # Vista Kanban agrupada por enum
        │   ├── ChartPanel.tsx        # Vista gráficos (Recharts)
        │   ├── RelatedDatasets.tsx   # Datasets relacionados por FK (id_*)
        │   ├── CsvMappingModal.tsx   # Modal mapeo columnas al importar Excel
        │   ├── SchemaDiagram.tsx     # Diagrama de schema SVG inline
        │   └── GlobalSchemaDiagram.tsx # Diagrama global de todos los datasets
        └── pages/
            ├── Login.tsx             # Login + Register (primer usuario → admin)
            ├── DatasetList.tsx       # Home — cards + búsqueda global cross-dataset
            ├── DatasetView.tsx       # Vista principal: tabla/kanban/charts + paginación
            ├── CreateDataset.tsx     # Formulario nuevo dataset
            ├── RecordForm.tsx        # Formulario nuevo registro
            ├── AdminUsers.tsx        # /admin/users — gestión de usuarios y roles
            └── AdminAudit.tsx        # /admin/audit — registro de auditoría global
```

---

## Modelo de datos (PostgreSQL)

```sql
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
  created_at      TIMESTAMPTZ

column_definitions
  id              UUID PK
  dataset_id      UUID FK→datasets (CASCADE)
  name            TEXT NOT NULL
  field_key       TEXT NOT NULL          -- clave en records.data JSONB
  data_type       VARCHAR(20)            -- 'text'|'number'|'date'|'enum'
  rules           JSONB DEFAULT '{}'     -- {required, min, max, options:[...]}
  position        INTEGER DEFAULT 0
  created_at      TIMESTAMPTZ

records
  id              UUID PK
  dataset_id      UUID FK→datasets (CASCADE)
  data            JSONB DEFAULT '{}'     -- {field_key: value, ...}
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
  deleted_at      TIMESTAMPTZ NULL       -- soft delete; NULL = activo

  INDEXES:
    ix_records_data_gin   GIN(data)      -- búsqueda rápida en JSONB

dataset_permissions                     -- permisos por dataset (override del rol global)
  id              UUID PK
  dataset_id      UUID FK→datasets (CASCADE)
  user_id         UUID FK→users (CASCADE)
  role            VARCHAR(20) NOT NULL   -- 'admin'|'editor'|'viewer'|'none'
  granted_at      TIMESTAMPTZ

change_history
  id              UUID PK
  record_id       UUID FK→records
  field_key       TEXT NULL
  old_value       TEXT NULL
  new_value       TEXT NULL
  action          VARCHAR(20)            -- 'create'|'update'|'delete'|'restore'
  changed_at      TIMESTAMPTZ
  user_id         UUID FK→users NULL     -- quién hizo el cambio
  user_name       TEXT NULL              -- denormalizado para historial rápido
```

---

## Autenticación y roles

- JWT firmado con `SECRET_KEY` (env var). Default inseguro — **cambiar en producción**.
- Token en `localStorage` (`dv_token`). El cliente axios lo inyecta en cada request via interceptor.
- **Primer usuario registrado** → rol `admin` automáticamente.
- Roles globales vs. permisos por dataset:
  - El rol global aplica a todos los datasets por defecto.
  - `dataset_permissions` permite dar un rol diferente por dataset (e.g. un `viewer` global puede ser `editor` en un dataset específico).
  - Los admins globales siempre son admin en todos los datasets.

| Rol | Datasets | Columnas | Registros | Usuarios | Permisos dataset |
|-----|----------|----------|-----------|----------|-----------------|
| admin | CRUD | CRUD | CRUD | CRUD | CRUD |
| editor | lectura | lectura | CRUD | — | — |
| viewer | lectura | lectura | lectura | — | — |

---

## Endpoints principales

```
# Auth
POST   /auth/register             body: {email, username, password}
POST   /auth/login                body: {email, password} → {access_token, user}
GET    /auth/me
GET    /auth/users                (admin) lista todos los usuarios
PATCH  /auth/users/{id}/role      (admin) {role: "admin"|"editor"|"viewer"}
PATCH  /auth/users/{id}/deactivate (admin)
GET    /auth/audit                (admin) historial global de cambios
                                  ?skip=&limit=&action=&dataset_id=&user_id=

# Datasets
GET    /datasets
POST   /datasets                  {name, description?}
DELETE /datasets/{id}

# Columns
GET    /datasets/{id}/columns
POST   /datasets/{id}/columns     {name, field_key, data_type, rules, position}
PATCH  /datasets/{id}/columns/{col_id}
DELETE /datasets/{id}/columns/{col_id}

# Records (paginados)
GET    /datasets/{id}/records     ?search=&include_deleted=&skip=&limit=
                                  → array + header X-Total-Count
POST   /datasets/{id}/records     {data: {...}}
PATCH  /datasets/{id}/records/{rec_id}
DELETE /datasets/{id}/records/{rec_id}          (soft delete)
POST   /datasets/{id}/records/{rec_id}/restore
POST   /datasets/{id}/records/bulk-delete       {ids: [...]}
POST   /datasets/{id}/records/import-excel      multipart/form-data campo: file
GET    /datasets/{id}/records/{rec_id}/history

# Permisos por dataset
GET    /datasets/{id}/permissions              (admin del dataset)
PUT    /datasets/{id}/permissions              {user_id, role}
DELETE /datasets/{id}/permissions/{user_id}

# WebSocket (tiempo real)
WS     /ws/{dataset_id}?token=<jwt>
       → eventos: {type: "record_create"|"record_update"|"record_delete", dataset_id, record_id?}
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

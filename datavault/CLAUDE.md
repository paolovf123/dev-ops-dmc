# DataVault — Contexto del proyecto

Gestor de datos tabulares dinámicos (similar a Airtable). Permite crear datasets con columnas configurables en runtime, editar registros inline, importar Excel y mantener historial de cambios.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11 + FastAPI (async) |
| Base de datos | PostgreSQL 16 (columnas dinámicas via JSONB) |
| Frontend | React 18 + Vite + TypeScript |
| ORM / Migraciones | SQLAlchemy async + Alembic |
| Contenerización | Docker Compose (Docker Engine en WSL2 Ubuntu 24.04) |

## Cómo levantar los servicios

```bash
# Desde cualquier terminal de Windows:
wsl -d Ubuntu -- bash -c "service docker start 2>/dev/null; sleep 2; cd /mnt/c/Users/USER/Documents/migra/datavault && docker compose up -d && docker compose ps"
```

O usar la skill de Claude Code: `/datavault-start`

## URLs locales

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 (user: dev / pass: dev / db: datavault) |

## Ver desde VSCode sin abrir navegador

`Ctrl+Shift+P` → `Simple Browser: Show` → `http://localhost:5173`

## Estructura del proyecto

```
datavault/
├── docker-compose.yml
├── backend/
│   ├── main.py              # FastAPI app + CORS
│   ├── database.py          # SQLAlchemy async engine
│   ├── models.py            # ORM: Dataset, ColumnDefinition, Record, ChangeHistory
│   ├── schemas.py           # Pydantic schemas (in/out)
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── alembic.ini
│   └── routers/
│       ├── datasets.py      # GET/POST/DELETE /datasets
│       ├── columns.py       # CRUD /datasets/{id}/columns
│       └── records.py       # CRUD + soft-delete + restore + import-excel
└── frontend/
    ├── src/
    │   ├── types.ts
    │   ├── api/
    │   │   ├── client.ts        # axios base URL
    │   │   └── datasets.ts      # funciones fetch
    │   ├── components/
    │   │   ├── DataGrid.tsx         # tabla editable (click-to-edit)
    │   │   ├── CellEditor.tsx       # input según data_type
    │   │   └── AddColumnModal.tsx   # modal nueva columna con reglas
    │   └── pages/
    │       ├── DatasetList.tsx      # lista y crea datasets
    │       └── DatasetView.tsx      # vista principal con grid
    ├── .env                 # VITE_API_URL=http://localhost:8000
    └── Dockerfile
```

## Modelo de datos

```
datasets           → column_definitions  (1:N, define el schema)
datasets           → records             (1:N, datos en JSONB)
records            → change_history      (1:N, audit log)
```

- Los datos de cada registro viven en `records.data (JSONB)` con claves = `field_key` de cada columna.
- Soft delete: `records.deleted_at` — los registros eliminados se ocultan pero no se borran.
- `change_history` registra cada update con `old_value` / `new_value` / `action`.

## Endpoints principales

```
GET    /datasets
POST   /datasets
DELETE /datasets/{id}

GET    /datasets/{id}/columns
POST   /datasets/{id}/columns       body: {name, field_key, data_type, rules, position}
PATCH  /datasets/{id}/columns/{col_id}
DELETE /datasets/{id}/columns/{col_id}

GET    /datasets/{id}/records       ?search=&include_deleted=&skip=&limit=
POST   /datasets/{id}/records       body: {data: {...}}
PATCH  /datasets/{id}/records/{rec_id}
DELETE /datasets/{id}/records/{rec_id}   (soft delete)
POST   /datasets/{id}/records/{rec_id}/restore
POST   /datasets/{id}/records/import-excel  (multipart/form-data, campo: file)
```

## Tipos de columna y reglas soportadas

| data_type | Reglas disponibles |
|-----------|--------------------|
| text | required |
| number | required, min, max |
| date | required |
| enum | required, options: ["A","B",...] |

## Migraciones Alembic

```bash
# Generar nueva migración (correr dentro del contenedor backend):
docker compose exec backend alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones:
docker compose exec backend alembic upgrade head
```

## Datos de ejemplo cargados

- **Dataset:** "Eventos Gestora"
- **Fuente:** `Bd_Eventos Gestora.xlsx` (2 hojas: 26Feb y 25Mar)
- **Registros:** 233 importados (113 de Feb + 120 de Mar)
- **Columnas:** 15 (text, date, enum, number)

## Decisiones de diseño tomadas

- **Sin autenticación** por ahora — single-tenant, todos los usuarios ven todo.
- **Sin índice GIN** en JSONB — pendiente agregar cuando el volumen crezca (`CREATE INDEX USING GIN (data)`).
- **Docker Engine en WSL2** en lugar de Docker Desktop — el sistema corre en VM y Docker Desktop no soporta virtualización anidada.
- **JSONB para datos dinámicos** — permite agregar/quitar columnas sin ALTER TABLE.

## Próximos pasos pendientes

- [ ] Autenticación (usuarios y roles)
- [ ] Índice GIN en `records.data` para búsqueda rápida
- [ ] Drag & drop para reordenar columnas (necesita `@dnd-kit`)
- [ ] Vista de "papelera" para registros eliminados con botón restaurar
- [ ] Exportar a Excel desde la interfaz
- [ ] Deploy a AWS ECS + RDS

## Scripts útiles (en `C:\Users\USER\Documents\migra\`)

- `setup_dataset.py` — Crea el dataset Eventos Gestora con sus 15 columnas vía API
- `import_excel.py` — Importa `Bd_Eventos Gestora.xlsx` al dataset creado
- `install_docker.sh` — Script de instalación de Docker Engine en Ubuntu WSL2

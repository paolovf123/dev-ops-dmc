# Brief de diseño — OpsGrid

> Documento para diseñar la interfaz de **OpsGrid** (antes "DataVault"). Gestor de
> datos tabulares dinámicos tipo Airtable: subir Excels caóticos → detectar
> relaciones → limpiar → trabajar en tablas relacionadas. Pensado para que un
> diseñador (humano o agente) rediseñe la UI **sin leer el código**.

---

## 1. Contexto del producto

| | |
|---|---|
| **Qué es** | App web para convertir hojas de cálculo desordenadas en tablas relacionales editables, con permisos por equipo, scripts de transformación y auditoría. |
| **Promesa** | "Tus Excels caóticos, **limpios**." Subís un Excel, el sistema detecta las relaciones (FK / N:N) por contenido, propone limpiezas y te deja editar todo en una grilla tipo Airtable. |
| **Audiencia** | PyMEs y equipos de operaciones en Perú (ventas, finanzas, RR.HH., logística). Usuarios no técnicos que hoy viven en Excel. |
| **Idioma / moneda** | Español (es-PE) en toda la UI. Moneda por defecto **S/ (PEN)**. |
| **Stack** | React 19 + Vite + TypeScript · React Query · react-router v7 · Monaco (editor de scripts) · Recharts (gráficos). Backend FastAPI + PostgreSQL (JSONB). |
| **Estado del rediseño** | Rebrand **DataVault → OpsGrid** en curso. Ya existe una base de design tokens (`tokens.css`, paleta "Citrus") y un *design kit* (`dk-*` + primitivos `ui/`). Hay libertad para evolucionar lo visual; la información y los flujos de abajo son los reales. |
| **Objetivo del rediseño** | Unificar el lenguaje visual OpsGrid sobre los tokens existentes; subir la calidad de pantallas densas (grilla, matrices de permisos, editor de scripts) y de los estados vacíos/onboarding; soportar **modo claro y oscuro** y **6 paletas** intercambiables. |

---

## 2. Roles y navegación

### Dos niveles de rol

**Rol global** (en el token de sesión): `admin` · `editor` · `viewer`.
- El **primer usuario** registrado se vuelve `admin` automáticamente.
- Los siguientes nacen `viewer` e **inactivos**, hasta que un admin los active/promueva
  (salvo que su email pertenezca a un dominio corporativo auto-aceptado → activo).

**Rol de workspace** (por equipo): `owner` · `admin_ws` · `member`.

### Rol efectivo sobre un dataset
Se resuelve por prioridad (de mayor a menor): **admin global → permiso directo de usuario →
mejor permiso de grupo → membresía de workspace → rol global**. Un permiso directo o de
grupo con valor `none` **oculta/bloquea** el dataset explícitamente.

| Rol de workspace | Rol efectivo sobre datos | Edita datos | Gestiona equipo/grupos | Borra workspace |
|---|---|---|---|---|
| `member`   | editor | ✓ | ✗ | ✗ |
| `admin_ws` | editor | ✓ | ✓ | ✗ |
| `owner`    | admin  | ✓ | ✓ | ✗ (solo admin global) |

### Qué ve cada quién (navegación del shell)

| Destino (sidebar) | viewer / member | editor | owner / admin_ws | admin global |
|---|---|---|---|---|
| Datasets (`/`, `/ws/:id`) | ✓ (lectura) | ✓ | ✓ | ✓ |
| Crear dataset / registros | — | ✓ | ✓ | ✓ |
| Scripts (`/scripts`) | ver resultados | ✓ | ✓ | ✓ |
| Personas y accesos (`/admin/personas`) | — | — | ✓ (su ws) | ✓ (todo) |
| Workspaces (`/admin/workspaces`) | — | — | ✓ (sus ws) | ✓ (todos) |
| Auditoría (`/admin/audit`) | — | — | — | ✓ |
| Facturación (`/billing`) | — | — | ✓ | ✓ |
| Integraciones (`/settings`) | ✓ (tokens propios) | ✓ | ✓ | ✓ |

> "Manager" = `isManager` = admin global **o** owner/admin_ws de algún workspace. Es la
> condición que prende los enlaces administrativos.

### Sesión / auth
- Login con **email + contraseña**. JWT en **cookie httpOnly** + refresh token; el front
  rehidrata la sesión vía `GET /auth/me`.
- Alta por **invitación**: el admin genera un link de un solo uso → pantalla
  `/set-password` para definir contraseña y activar la cuenta (auto-login).
- WebSocket (edición en vivo) se autentica con un **ticket efímero** (60 s) como primer
  mensaje; nunca se expone el token de sesión.

---

## 3. Sistema de diseño (punto de partida)

Ya existe `tokens.css` (marca OpsGrid). **No hardcodear hex en componentes**: leer variables.

**Tipografía** — `Inter` (sans + display), `JetBrains Mono` (código, claves, montos).
Escala: 11/12/13/14/15 (cuerpo y tablas) · 18 (h4) · 22 (h3) · 28 (h2) · 36 (h1) · 48 (display).
Pesos 400/500/600/700.

**Color — 3 acentos semánticos** (clave del producto, varían por paleta):
- `--accent-pri` — marca / CTA / foco / badge "Live" (azul `#1e4cff` en Citrus).
- `--accent-rel` — **relaciones, lookups, chips entre tablas** (naranja `#ff6a18`).
- `--accent-calc` — **scripts / columnas calculadas / derivadas** (magenta `#e436b6`).
- Estados: success `#0fb583` · warning `#f4a300` · danger `#e8455a`.
- Neutros fríos (0→900) con roles semánticos: `--bg`, `--surface`, `--surface-alt`,
  `--border`, `--text`, `--text-soft`, `--text-mute`.

**Paletas intercambiables** (`<html data-palette>`): `citrus` (default), `electric`,
`mint`, `dusk`, `tropic`, `y2k`. **Modo oscuro** con `data-theme="dark"`.

**Forma** — radios 4/8/12/16/24/pill · sombras 1→4 + `--shadow-focus` · transiciones
120/150/240 ms. **Densidad de filas**: compacta 28px / regular 34px / cómoda 42px.

**Necesidades transversales**: responsive mobile-first, estados de carga/vacío/error en
cada vista con datos, microinteracciones sobrias (estilo Linear/Stripe), accesibilidad
(foco visible ya definido, navegación por teclado en la grilla).

---

## 4. Mapa de pantallas

**Públicas / sesión**
- `/login` — **Login** (pestañas Entrar / Crear cuenta) + CTA "Adquiere OpsGrid".
- `/set-password` — **SetPassword** (activar cuenta vía invitación).

**De usuario**
- `/` — **DatasetList** (home; el admin global ve el AdminDashboard).
- `/ws/:workspaceId` — **WorkspaceView** (datasets de un workspace, vista de manager).
- `/create` — **CreateDataset** (importar archivo / plantilla / desde cero).
- `/datasets/:id` — **DatasetView** (vista principal: Tabla · Kanban · Gráficos · Papelera).
- `/datasets/:id/new` — **RecordForm** (alta de registro + hijos/nietos vinculados).
- `/scripts` — **ScriptsHub** (hub de scripts Python calculados).
- `/computed/new` y `/datasets/:id/computed` — **ComputedDatasetEditor** (editor Monaco).
- `/settings` — **Settings** (Integraciones: API tokens / Webhooks).

**Administración**
- `/admin/personas` y `/admin/accesos` — **AdminPeople** (Personas y accesos; 4 tabs).
- `/admin/workspaces` — **AdminWorkspaces** (CRUD de equipos + datasets + config).
- `/admin/audit` — **AdminAudit** (registro de auditoría).
- `/billing` — **Billing** (planes, uso y pagos).
- Rutas legacy (`/admin/users`, `/admin/groups`, `/admin/permissions`) redirigen a las anteriores.

---

## 5. Componentes transversales

### 5.1 AppShell (marco de la app)
- **Topbar** (sticky): logo OpsGrid (→ home) · **WorkspaceSwitcher** · **GlobalSearch** ·
  toggle de tema (claro/oscuro, persistido) · campana admin · acceso a Integraciones · **UserMenu**.
- **Sidebar** (sticky, izquierda): Datasets · Scripts · Personas* · Workspaces* · Auditoría** ·
  Facturación* (con badge de conteo donde aplica). Al pie: **tarjeta de upgrade** si el
  workspace está en plan Free ("Plan Free · Suscríbete a Pro · Ver planes") + Cerrar sesión.
  (*solo managers, **solo admin global*).
- **Estados**: enlace activo resaltado; tema persiste; nombre del workspace en el topbar.

### 5.2 WorkspaceSwitcher
- Botón con avatar (gradiente por nombre) + nombre del workspace + chevron.
- Dropdown: "Dashboard general" (admin), lista de workspaces con **pill de rol**
  (owner=morado / admin_ws=azul / member=verde) y check del activo; pie "Nuevo workspace"
  (admin) con form inline (nombre* + descripción).
- owner/admin_ws/admin navegan a `/ws/:id`; members regulares solo cambian el contexto.

### 5.3 GlobalSearch
- Input en topbar ("Buscar dataset, registro…"), búsqueda **server-side con debounce**.
- Dropdown agrupado por dataset, máx 24 resultados; muestra el primer valor del registro.
- Estados: "Buscando…" · "Sin resultados" · "N resultados (máx)". Click → `/datasets/:id`. Esc cierra.

### 5.4 UserMenu
- Pill con avatar (gradiente por rol), nombre y **badge de rol** (admin=violeta /
  editor=azul / viewer=slate). Dropdown: Personas y accesos*, Planes y facturación*,
  Registro de auditoría**, Integraciones, Cerrar sesión (rojo).

### 5.5 DataGrid (grilla editable — núcleo del producto)
- **Header sticky** + columnas congeladas (checkbox de selección + nº de fila). Columnas:
  reales (editables), **vínculos/joins** (solo lectura, marca naranja), **fórmulas**
  (solo lectura, prefijo ƒ). Última columna: acciones (historial, eliminar fila).
- **Encabezado de columna**: nombre · orden (↑/↓/↕) · filtro (popover con búsqueda +
  checkboxes de valores) · editar · eliminar · (modo hoja: letra A, B, C…).
- **Render por tipo**: boolean "Sí/No" · url/email como enlace · rating ★ · currency
  `S/ 1,234.56` · percent `42%` · multiselect y relation como **chips** · nulo "—" ·
  fórmula con `#ERROR` en rojo.
- **Edición inline** (ver CellEditor) con validación viva (borde rojo + burbuja).
- **Selección de rango** (arrastrar / Shift-click) → barra de stats: Cuenta · Suma ·
  Promedio · Mín · Máx (numéricos).
- **Teclado**: ↑↓←→ navegar · Enter/F2 editar · Supr borrar · Ctrl+C/Ctrl+V (TSV) ·
  Ctrl+D rellenar abajo · Ctrl+R rellenar derecha · Ctrl+H buscar y reemplazar · Ctrl+Z deshacer.
- **Menú contextual** (click derecho): Copiar · Borrar contenido · Rellenar abajo/derecha ·
  Buscar y reemplazar… · Ver historial de la fila · Eliminar fila (rojo).
- **Pie**: "+ fila vacía" · "N registros" · indicador de filtros y de orden (con × para limpiar).
- **Estados**: vacío "Sin registros" · celda en error (borde rojo + ⚠ + tooltip) · fila
  eliminada atenuada · formato condicional aplicado.

### 5.6 CellEditor (editor por tipo)
- Render del input según `data_type`: select Sí/No (boolean) · select de opciones (enum) ·
  botones toggle + OK (multiselect) · estrellas (rating) · textarea (long_text) · number /
  date / url / email / phone nativos · **RelationCellEditor** multi-chip con autocomplete
  server-side (debounce 220 ms, chips naranjas, "Buscar y agregar…", opción "Agregar como
  texto libre", Backspace borra el último chip).
- Validación viva: burbuja roja flotante (`⚠ mensaje`). Esc cancela; Enter/Tab confirman y navegan.

### 5.7 Otras vistas de datos
- **KanbanView**: "Agrupar por:" (columnas enum) → columnas con tarjetas (4 campos) y
  selector "— mover a —" para cambiar de grupo. Vacío: "Necesitas al menos una columna **enum**…".
- **ChartPanel**: por columna enum → barras + dona (top 12); por columna número → línea +
  stats (mín/máx/prom). Vacío: "No hay columnas de tipo **enum** o **número** para graficar.".
- **TrashPanel**: registros soft-deleted con checkbox, "Restaurar" / "Eliminar
  definitivamente" (bulk). Vacío: "La papelera está vacía".

### 5.8 Primitivos del Design Kit (`ui/`)
`PageHeader` (título + subtítulo + acciones) · `Tabs` (key/label/icon, tab activa) ·
`Toolbar` (+ `ToolbarSpacer`) · `SearchInput` · `Select` · `Count` (n + sustantivo) ·
`Badge` (tonos: neutral/primary/violet/danger/warn/success, con dot opcional) ·
`DataTable` (columnas con render/align/primary, prop `empty`) · `EmptyState` (icono +
título + subtítulo). Más `Toast` (notificaciones) y `ConfirmDialog` (confirmaciones destructivas).

### 5.9 Familias de modales
- **Columnas/datos**: AddColumnModal, EditColumnModal, ColumnPanel (tabs Columnas/Vínculos/Fórmulas),
  ConditionalFormattingModal, SearchReplaceModal.
- **Importar/plantillas**: ImportExcelModal (wizard 4 pasos), CsvMappingModal, TemplatePickerModal.
- **Relaciones/esquema**: RelationsManagerModal, RelationScanModal, LinkTableModal,
  SchemaDiagram, GlobalSchemaDiagram, RelatedDatasets, RelatedRecordsPanel.
- **Permisos/acceso**: PermissionsPanel, DatasetAccessModal, InviteUserModal.
- **Historial**: RecordHistoryPanel, AuditTimeline.

---

## 6. Pantallas

### 6.1 Login — `/login`
- **Objetivo**: entrar o crear cuenta; comunicar la promesa de marca.
- **Layout**: bifold. Izquierda visual (logo, eyebrow "✨ Excel en, tablas relacionadas
  fuera", H1 "Tus Excels caóticos, **limpios.**", testimonial). Derecha: form con pestañas
  **Entrar / Crear cuenta**.
- **Datos (endpoint)**: `POST /auth/login` · `POST /auth/register` · hint de dominios y
  SMTP vía `GET /auth/signup-config`.
- **Componentes**: tabs, inputs email/usuario/password (con toggle ver/ocultar), alertas,
  CTA "Adquiere OpsGrid para tu empresa" (→ AcquireModal).
- **Estados**: cargando ("Iniciando sesión…" / "Creando cuenta…") · error (alerta roja) ·
  registro pendiente (nota verde: "Cuenta creada. Un administrador debe aprobarla…").
- **Notas**: nota informativa en registro ("El **primer usuario registrado** se vuelve
  administrador… los siguientes empiezan como *viewer*"). Si ya hay sesión → redirige a `/`.

### 6.2 DatasetList — `/` (home)
- **Objetivo**: listar/crear datasets del workspace activo y dar entrada a relaciones.
- **Layout**: header (título + descripción del workspace + "Detectar relaciones" + "Nuevo
  dataset") → toolbar (búsqueda global + "Diagrama" + "Relaciones" + toggle "Intermedias
  (N)") → grilla de **cards de dataset** (icono, nombre, código, stats cols/filas/relaciones,
  menú ⋯) + card "Nuevo dataset" → sección opcional "Mapa de relaciones" (mini-SVG).
- **Datos (endpoint)**: `GET /datasets?workspace_id=` · por card `GET /datasets/:id/columns`
  y `GET /datasets/:id/records` (conteos) · búsqueda usa `GET /datasets/:id/records?search=`.
- **Estados**: carga (SkeletonCard×3) · sin workspace ("Sin workspace asignado · Pide a un
  administrador que te agregue") · sin datasets ("Sin datasets todavía" + CTA) · solo puentes
  ("Solo hay tablas intermedias").
- **Interacciones**: click card → DatasetView · ⋯ → EditDatasetModal · "Detectar relaciones"
  → RelationScanModal · "Relaciones" → RelationsManagerModal · "Diagrama" → GlobalSchemaDiagram ·
  toggle intermedias (persistido).
- **Notas**: el **admin global** ve el AdminDashboard en `/` en vez de esta lista. Las tablas
  `is_bridge` se ocultan por defecto.

### 6.3 WorkspaceView — `/ws/:workspaceId`
- **Objetivo**: vista de manager de los datasets de un workspace, con stats y acciones.
- **Layout**: hero (nombre + descripción + stats: datasets / registros / columnas) +
  acciones (Diagrama · Relaciones · Scripts · Importar Excel · Nuevo dataset) → búsqueda →
  grilla de cards (header con gradiente, badges, "Abrir →", borrar/editar) → "Mapa de relaciones".
- **Datos**: `GET /workspaces` (resuelve el ws + `my_role`) · `GET /datasets?workspace_id=` ·
  columnas/registros por card · `DELETE /datasets/:id`.
- **Estados**: skeleton · "Sin datasets todavía" · "Solo hay tablas intermedias".
- **Gating**: crear/borrar/importar/Scripts solo para owner/admin_ws/admin; member solo lee.

### 6.4 CreateDataset — `/create`
- **Objetivo**: crear un dataset desde archivo, plantilla o vacío, configurando columnas.
- **Layout**: **Paso 1 (elegir)**: zona drag-drop (.xlsx/.xls/.csv) + grilla de **plantillas**
  (emoji, nombre, descripción, nº columnas) + "o empezá desde cero →". **Paso 2 (form)**:
  nombre* + descripción + lista de **ColRow** (nombre · field_key · tipo · requerido · borrar)
  con extras por tipo (opciones enum, símbolo de moneda, escala de rating).
- **Datos**: sin fetch en la página; al guardar: `POST /datasets` → `POST /datasets/:id/columns`
  (×N) → `POST /datasets/:id/records` (×N filas importadas, tope 1000). Excel multi-hoja →
  abre ImportExcelModal.
- **Estados**: estado de lectura del archivo (p.ej. "4 hojas detectadas…") · guardando
  ("Creando…") · error de nombre bajo el campo.
- **Notas**: el field_key se auto-slugifica desde el nombre. Param `linkedName` pre-crea una
  columna FK bloqueada hacia ese dataset (badge verde).

### 6.5 DatasetView — `/datasets/:id` (vista principal)
- **Objetivo**: editar el dataset completo: grilla, columnas, relaciones, fórmulas, vistas y papelera.
- **Layout**:
  - **Header**: nombre + editar (admin) + badge **"Live"** (si hay sync WS) · meta
    "N columnas · M filas (+ fórmulas, + joins)" · **tabs de vista**: Tabla · Kanban ·
    Gráficos · Papelera.
  - **Toolbar (vista Tabla)**: Buscar… · Filtros (con conteo) · Columnas (visible/total) ·
    [si hay selección] Relacionados / "Eliminar (N)" · importar CSV · Exportar (CSV/XLSX/
    Imprimir) · menú ⋯ (Vistas guardadas, Ver diagrama, Vincular tabla [admin], Buscar y
    reemplazar, Vista hoja A/B/C, Copiar enlace de la vista, Formato condicional) ·
    "+ Columna" (admin) · "+ Nuevo registro" (editor+).
  - **Banners**: resultado de import CSV (verde/naranja) · heurística "Este dataset parece
    una tabla intermedia → Marcar como intermedia".
  - **Chips de filtros activos** + "Limpiar todo".
  - **Contenido**: DataGrid / KanbanView / ChartPanel / TrashPanel + paginación
    ("Mostrando X–Y de Z registros") + sección **RelatedDatasets** debajo.
- **Datos (endpoint)**: `GET /datasets/:id/columns` · `GET /datasets/:id/records?search=&skip=&limit=`
  (con `X-Total-Count` y cursor) · `POST/PATCH/DELETE` de registros · `POST .../bulk-delete` ·
  `POST .../import-excel` · columnas `POST/PATCH/DELETE` · joins/fórmulas/vistas se guardan en
  localStorage. Edición en vivo por **WebSocket** (`/ws/:datasetId`).
- **Estados**: dataset vacío ("Agrega columnas para empezar…" + CTA) · importando ("Importando…") ·
  toolbar oculta fuera de la vista Tabla.
- **Gating**: viewer solo lee (sin botones de edición); editor edita registros/importa;
  admin/owner/admin_ws además gestiona columnas, vincula tablas y renombra.

### 6.6 RecordForm — `/datasets/:id/new`
- **Objetivo**: crear un registro y, opcionalmente, **registros vinculados** (hijos y nietos)
  en la misma operación; la FK se asigna sola.
- **Layout**: "Volver a {Dataset}" → secciones agrupadas: **campos propios** ("N campos") ·
  **relaciones** (apuntan a otras tablas) · **datasets hijos** colapsables (badge "Se creará /
  Omitir") con **sub-tablas (nietos)** anidadas · pie ("Guardando en {Dataset} · cambios sin
  guardar" + Cancelar + "Guardar registro").
- **Datos**: `GET /datasets/:id/columns` (propias y de cada FK) · `GET .../records?limit=1000`
  para los dropdowns de relación · al guardar, `POST .../records` en cadena (padre → hijos →
  nietos), con **rollback** (`DELETE`) si falla un hijo.
- **Estados**: "Cargando campos…" · errores por campo (rojo) · "Guardando…" · error de guardado
  arriba del pie.
- **Notas**: campo relación en modo dropdown o "+ Crear nuevo" inline ("Este registro se creará
  automáticamente al guardar…"). Solo editor+.

### 6.7 ScriptsHub — `/scripts`
- **Objetivo**: hub de **scripts Python calculados** (cada script = su propio dataset
  `is_computed`, independiente).
- **Layout**: header ("Scripts calculados" + "Nuevo script" [admin]) → form inline de creación →
  tabla: Icono · Script (nombre + badges SIN CÓDIGO / SIN FUENTES) · Fuentes · Programación
  (manual) · Última corrida · Acciones (Ejecutar ▷ · Editar · Ver resultados · Eliminar).
- **Datos**: `GET /datasets` (filtra `is_computed`) · conteo `GET .../records` · ejecutar
  `POST /datasets/:id/compute`.
- **Estados**: "Cargando…" · vacío "Sin scripts todavía" + CTA · fila ejecutándose (spinner,
  opacidad) · toast de error con detalle del executor.
- **Gating**: crear/eliminar solo admin; ejecutar requiere plan **Pro+** (si no, 402).

### 6.8 ComputedDatasetEditor — `/computed/new` y `/datasets/:id/computed`
- **Objetivo**: escribir el código del script con contexto de las tablas fuente y ver el resultado.
- **Layout**: 3 columnas. **Izquierda** "Fuentes de datos" (lista seleccionable + chips de
  columnas; en nuevo: nombre/descripción) → tarjeta "Salida del script". **Centro** editor
  **Monaco** (Python, tema azul-morado) + toolbar (pill "ƒ Computed dataset" · Plantilla ·
  Guardar · Crear/Ejecutar) + barra de estado (Python 3.11 · pandas · numpy · duckdb · Ln/Col).
  **Derecha** panel de salida (tabs Resumen / Logs): métricas (filas, columnas, errores) o
  traceback + "Ver dataset →".
- **Datos**: `GET /datasets` · `GET /datasets/:id/columns` (por fuente) · `PATCH /datasets/:id`
  (guardar código/fuentes) · `POST /datasets/:id/compute` (ejecutar).
- **Estados**: nuevo (botón "Crear dataset", deshabilitado sin nombre/fuentes) · ejecutando
  ("Ejecutando…") · sin salida ("Pulsa Ejecutar (Ctrl+↵)…") · éxito (métricas verdes) · error
  (traceback rojo).
- **Interacciones**: "Generar plantilla" introspecta columnas y escribe pandas/DuckDB · Ctrl+Enter
  ejecuta · Ctrl+S guarda.

### 6.9 Settings (Integraciones) — `/settings`
- **Objetivo**: gestionar **API tokens** (personales) y **Webhooks** (por workspace).
- **Layout**: sidebar (API tokens / Webhooks) + panel.
  - **Tokens**: form (nombre + scope "Solo lectura / Lectura + escritura") → al crear, muestra
    el token **una sola vez** (card verde con copiar) → lista (nombre, prefijo, scope, fechas,
    "Revocar").
  - **Webhooks**: form (URL + checkboxes de eventos: record.create/update/delete,
    dataset.create/delete) → al crear muestra el **secret** una vez → lista (URL, eventos,
    último status, fail_count, "Test", "Eliminar").
- **Datos**: `GET/POST/DELETE /api-tokens` · `GET/POST/DELETE /webhooks` + `POST /webhooks/:id/test`.
- **Estados**: creando · recién creado (mostrar secreto) · vacío ("No tienes tokens…", "No hay
  webhooks configurados.") · cargando.
- **Gating**: tokens personales (cualquier usuario); webhooks requieren **Pro+** y owner/admin_ws.

---

## 7. Panel de administración

### 7.1 AdminPeople — `/admin/personas` (y `/admin/accesos`)
- **Objetivo**: centro único de **Personas y accesos**.
- **Layout**: PageHeader + **tabs**: **Usuarios del sistema** (solo admin global) · **Miembros** ·
  **Grupos** · **Accesos a datasets** + selector de workspace.
  - *Usuarios*: todos los usuarios + rol global + activar/desactivar + invitar.
  - *Miembros*: miembros del workspace con **rol inline** (owner/admin_ws/member) + agregar/quitar.
  - *Grupos*: grupos del workspace + membresías.
  - *Accesos*: **matriz dataset × grupo** (o × usuario) con **RoleSegmented**
    (Sin acceso / Ver / Editar / Admin), mutación optimista.
- **Datos**: `GET /workspaces` · `GET /auth/users` (`?workspace_id=` / `?list_all=true`) ·
  `GET /groups?workspace_id=` · `GET /workspaces/:id/access-matrix?mode=groups|users` ·
  `PUT/DELETE /datasets/:id/permissions[/groups]`.
- **Estados**: sin acceso ("Necesitás ser owner o admin_ws…") · "Elegí un workspace".
- **Gating**: admin global ve todo (incluida la tab Usuarios); owner/admin_ws solo sus workspaces.

### 7.2 AdminWorkspaces — `/admin/workspaces`
- **Objetivo**: CRUD de equipos + sus datasets y configuración.
- **Layout**: sidebar (lista + "Nuevo" con form inline, incluye checkbox **sandbox** que
  pre-puebla 4 plantillas) + panel (header del ws + tabs **Datasets** / **Configuración**).
- **Datos**: `GET/POST/PATCH/DELETE /workspaces` · contenido de tabs en sub-componentes.
- **Estados**: skeleton · "No hay workspaces aún" · "Seleccioná un workspace".
- **Gating**: borrar workspace solo admin global; owner/admin_ws ven los suyos.

### 7.3 AdminAudit — `/admin/audit`
- **Objetivo**: registro inmutable de cambios (auditoría).
- **Layout**: PageHeader + toggle **Tabla / Línea de tiempo** + Exportar (CSV/Excel) + barra de
  **filtros** (Acción · Workspace · Dataset · Persona multi-select) + chips activos →
  tabla (Cuándo · Quién · Acción · Objetivo · Cambio) o **AuditTimeline** + paginación.
- **Datos**: `GET /auth/audit?action=&workspace_id=&dataset_id=&user_id=&skip=&limit=` ·
  `GET /workspaces` · `GET /datasets` · `GET /auth/users`.
- **Estados**: "Cargando registros…" · sin datos ("Aún no hay actividad registrada." / "Probá
  ajustando los filtros.") · exportando.
- **Gating**: **solo admin global** (si no, EmptyState con candado).
- **Notas**: exporta CSV (BOM) y Excel (SpreadsheetML) **sin librerías** npm.

### 7.4 Billing — `/billing`
- **Objetivo**: ver uso, elegir plan y pagar; el admin global revisa avisos de pago.
- **Layout**: PageHeader + selector de workspace → **Uso del plan actual** (3 UsageCard:
  Miembros / Datasets / Registros, con barra y aviso al 80% / 95%) → **Elegir plan**
  (cards Free / Pro / Business con precio en S/, features, "PLAN ACTUAL") → **método de
  pago** (Mercado Pago / Transferencia bancaria con datos de cuenta + referencia) →
  **avisos de pago** (solo admin: aprobar/rechazar).
- **Datos**: `GET /billing/plans` · `GET /workspaces/:id/billing` · `POST .../billing/checkout`
  (Mercado Pago) · `POST .../billing/transfer` · `GET /billing/claims` · `POST /billing/claims/:id/approve|reject`.
- **Estados**: sin workspace gestionable · uso normal/alto (warning naranja al 80%, danger al
  95% "⚠ Estás casi al tope") · procesando pago ("Redirigiendo…" / "Enviando…").
- **Gating**: elegir/pagar solo owner/admin_ws/admin; aprobar avisos solo admin global.

---

## 8. Reglas de negocio que la UI debe reflejar

**Tipos de columna (14) y reglas** (la UI configura y valida según el tipo):

| Tipo | Reglas / comportamiento visible |
|---|---|
| text / long_text | required · unique · regex (+ mensaje); long_text = textarea |
| number / currency / percent / rating | required · min · max · `currency_symbol` · `max_rating`; percent 0–100; rating 1–N estrellas |
| date | required; selector de fecha |
| enum | required · `options[]`; un valor de la lista |
| multiselect | `options[]`; varios valores (chips) |
| boolean | "Sí" / "No" |
| email / phone / url | required + validación de formato; url debe iniciar con http(s):// |
| **relation** | required · `related_dataset_id` · `display_field`; **siempre un array JSONB** (1 elem = 1:N, N elems = N:N), editor multi-chip con búsqueda server-side |

**Relaciones**
- Modelo **N:N unificado**: toda relación se guarda como array; cambiar una columna a
  `relation` migra los escalares a arrays de 1 elemento.
- **Tablas intermedias** (`is_bridge=true`): ocultas por defecto en la lista; solo se usan
  cuando la relación necesita atributos (cantidad, fecha, monto).
- **Scanner de relaciones**: detecta candidatos cruzando datasets accesibles. **El contenido
  manda** (score = `0.85×match_contenido + 0.15×match_nombre`); un match de puro nombre sin
  datos baja a 0.05 y se marca "solo nombre · sin datos". Sugiere también **limpiezas** de
  variantes (mayúsculas/tildes) → "unificar como …".

**Datos / registros**
- **Soft delete**: los registros borrados van a la **Papelera** (recuperables), no se eliminan.
- **Historial**: cada cambio guarda campo, valor anterior/nuevo, acción y autor.
- **Import Excel/CSV**: límite **10 MB**; detección de tipos automática; dedupe opcional por
  columnas clave (filas duplicadas se omiten en silencio); import **all-or-nothing** si hay
  errores de validación.
- Edición en vivo por WebSocket → badge **"Live"**; si el usuario pierde acceso, el WS se cierra.

**Permisos**
- Prioridad: admin global > directo > grupo > workspace > rol global. `none` = bloqueo explícito.
- Solo el **admin de un dataset** gestiona sus permisos. No se puede quitar el rol al **único admin**.

**Planes (Billing)** — precios mensuales en **S/ (PEN)**; al exceder, la API responde **402**:

| Plan | Precio | Miembros | Datasets | Registros | Scripts / API |
|---|---|---|---|---|---|
| Free | S/ 0 | 3 | 3 | 2 000 | ✗ |
| Pro | S/ 490 | 50 | 50 | 200 000 | ✓ |
| Business | S/ 980 | 100 | 100 | 400 000 | ✓ |

- **Sin** planes ilimitados (decisión de negocio). Trial de 14 días al crear suscripción.
- **Scripts calculados** y **API tokens/webhooks** requieren **Pro+**.
- Pago: **Mercado Pago** (checkout) o **transferencia bancaria** (aviso que un admin aprueba).

**Onboarding / cuentas**
- Primer usuario → admin. Resto → viewer **inactivo** hasta aprobación (o auto-activado por
  dominio corporativo permitido). Alta por invitación con link de un solo uso (`/set-password`).

**Mensajes de error frecuentes**: "Email o contraseña incorrectos" · "Cuenta desactivada" ·
"'{campo}' is required" / "must be a number" / "must be one of […]" / "ya existe … (debe ser
único)" · "Alcanzaste el límite de N … del plan …" · "Los scripts/datasets calculados requieren
el plan Pro o superior.".

---

## 9. Estados, accesibilidad y responsive (global)

- **Carga**: usar **skeletons** en listas/cards (ya hay SkeletonCard) y spinners con texto
  ("Cargando…", "Buscando…", "Ejecutando…") en acciones puntuales.
- **Vacío**: cada vista con datos declara su EmptyState con **CTA** (crear dataset, crear
  script, invitar usuario, papelera vacía…). Reutilizar el primitivo `EmptyState`.
- **Error**: alertas inline (rojo) con el `detail` del backend; toasts para acciones async;
  validación de celda con borde rojo + burbuja. 401/403 no reintentan.
- **Feedback**: Toast para éxitos/errores; ConfirmDialog para acciones destructivas
  (eliminar dataset/columna/registro, revocar token).
- **Densidad**: tablas y matrices son densas → respetar las densidades de fila (28/34/42px) y
  permitir scroll horizontal con columnas congeladas.
- **Responsive mobile-first**: la grilla y las matrices necesitan estrategia móvil (scroll
  horizontal / vista de tarjetas); el shell colapsa el sidebar.
- **A11y**: foco visible ya tokenizado (`--shadow-focus`); navegación por teclado completa en
  DataGrid; contraste válido en claro y oscuro y en las 6 paletas; roles ARIA en tabs y diálogos.

---

## 10. Wireframes (ASCII)

### 10.0 Marco general (AppShell)
```
┌───────────────────────────────────────────────────────────────────────┐
│ ◧ OpsGrid   [▾ Ventas · owner]   🔍 Buscar dataset, registro…   ◐ 🔔 ⚙  (PV)│
├──────────────┬────────────────────────────────────────────────────────┤
│ ▦ Datasets   │                                                        │
│ ƒ Scripts  3 │                  (contenido de la ruta)                │
│ ◌ Personas   │                                                        │
│ ▢ Workspaces │                                                        │
│ ◷ Auditoría  │                                                        │
│ ◉ Facturación│                                                        │
│ ───────────  │                                                        │
│ ┌──────────┐ │                                                        │
│ │Plan Free │ │                                                        │
│ │Sube a Pro│ │                                                        │
│ │[Ver planes]│                                                        │
│ └──────────┘ │                                                        │
│ ⎋ Salir      │                                                        │
└──────────────┴────────────────────────────────────────────────────────┘
```

### 10.1 Login
```
┌───────────────────────────────┬───────────────────────────────────────┐
│  ◧ OpsGrid                     │   ( Entrar | Crear cuenta )           │
│                                │                                       │
│  ✨ Excel en, tablas fuera     │   Hola de nuevo 👋                    │
│                                │   Email     [______________________]  │
│  Tus Excels caóticos,          │   Password  [_______________] (👁)    │
│  **limpios.**                  │                                       │
│                                │   [        Entrar  →        ]         │
│  Subí un Excel → detectamos    │                                       │
│  relaciones → tablas en        │   ¿No tienes cuenta? Crea una…        │
│  minutos.                      │   ─────────────────────────────       │
│  “…nos ahorró semanas.”        │   [ 💼 Adquiere OpsGrid p/ tu empresa]│
└───────────────────────────────┴───────────────────────────────────────┘
```

### 10.2 DatasetList (home)
```
▦ Ventas · 6 datasets                       [ Detectar relaciones ] [ + Nuevo dataset ]
  🔍 [ buscar… ]        [ Diagrama ] [ Relaciones ]   Intermedias (2) [○]
  Tus datasets — 6 datasets · 1,240 filas · 38 columnas
  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────────┐
  │ ▦ Clientes    │ │ ▦ Pedidos     │ │ ƒ Ventas x mes│ │   ⊕         │
  │ 100 filas     │ │ 120 filas     │ │ calculado     │ │  Nuevo      │
  │ 7 col · 0 rel │ │ 6 col · 2 rel │ │ 3 col         │ │  dataset    │
  │            ⋯  │ │            ⋯  │ │           ⋯   │ │             │
  └───────────────┘ └───────────────┘ └───────────────┘ └─────────────┘
  Mapa de relaciones:  [Clientes]──<[Pedidos]>──[Detalle]──[Producto]
```

### 10.3 DatasetView — vista Tabla
```
▦ Pedidos  ✎              ● Live          [ Tabla ][ Kanban ][ Gráficos ][ Papelera ]
6 columnas · 120 filas · ƒ1 · ⛓2
  🔍 [buscar…] | Filtros (1) · Columnas 5/6 ·        ⇪CSV  Exportar▾  ⋯  [+Columna][+ Nuevo registro]
  Filtros activos:  estado: pendiente ✕     [ Limpiar todo ]
  ┌─┬──┬──────────┬───────────┬──────────┬─────────┬──────────┬────────┐
  │☑│# │ codigo   │ cliente⛓  │ fecha    │ total   │ estado   │  ⤺  🗑  │
  ├─┼──┼──────────┼───────────┼──────────┼─────────┼──────────┼────────┤
  │☐│1 │ PED-0001 │ ‹Ana G.›  │2026-05-01│ S/ 1,240│ ●pendiente│  ⤺  🗑  │
  │☑│2 │ PED-0002 │ ‹Carlos M›│2026-05-02│ S/   980│ ●pagado   │  ⤺  🗑  │
  │☐│3 │ PED-0003 │ ‹Lucía P.›│2026-05-02│ S/ 2,100│ ●anulado  │  ⚠ 🗑  │
  └─┴──┴──────────┴───────────┴──────────┴─────────┴──────────┴────────┘
  + fila vacía            120 registros · 1 filtro ✕     Suma: S/ 4,320
                                       [ ‹ Ant ] 1–40 de 120 [ Sig › ]
  ── Tablas relacionadas ────────────────────────────────────────────
  ↑ referencia a:  [Clientes]      ↓ referencian:  [Detalle · 200]
```

### 10.4 RecordForm (alta con hijos)
```
‹ Volver a Pedidos
Nuevo registro · Pedidos                                           [Nuevo]
┌─ ◌ Pedidos · 4 campos ─────────────────────────────────────────────┐
│ Código *  [____________]      Fecha   [ 2026-05-30 ]               │
│ Total *   [____________]      Estado  [ pendiente ▾ ]             │
└────────────────────────────────────────────────────────────────────┘
┌─ ⛓ Relaciones · 1 campo ───────────────────────────────────────────┐
│ Cliente * [ — Seleccionar — ▾ ]            ( + Crear nuevo )       │
└────────────────────────────────────────────────────────────────────┘
  Puedes crear registros vinculados al mismo tiempo (la FK va sola):
  ▸ Detalle                                          [ Se creará ▾ ]
    ┌──────────────────────────────────────────────────────────────┐
    │ Producto [ ▾ ]   Cantidad [__]   Precio [____]               │
    └──────────────────────────────────────────────────────────────┘
  Guardando en Pedidos · cambios sin guardar    [ Cancelar ][ Guardar registro ]
```

### 10.5 ScriptsHub
```
ƒ Scripts calculados                                       [ + Nuevo script ]
  ┌────┬───────────────────┬───────────────┬─────────┬───────────┬──────────┐
  │ ƒ  │ Script            │ Fuentes       │ Programa│ Última     │ Acciones │
  ├────┼───────────────────┼───────────────┼─────────┼───────────┼──────────┤
  │ ƒ  │ Ventas por mes    │ Pedidos,Detalle│ manual │ hace 2 h  │ ▷ ✎ ↗ 🗑 │
  │ ƒ  │ Top productos     │ Detalle,Produc.│ manual │ —          │ ▷ ✎ ↗ 🗑 │
  │ ƒ  │ Limpieza clientes │ ⚠ SIN FUENTES │ manual │ —          │ ▷ ✎ ↗ 🗑 │
  └────┴───────────────────┴───────────────┴─────────┴───────────┴──────────┘
```

### 10.6 ComputedDatasetEditor (Monaco)
```
┌─ Fuentes de datos ─┐┌─ ƒ Ventas por mes ───── [Plantilla][Guardar][Ejecutar]┐┌─ Salida ──┐
│ ☑ Pedidos          ││ 1  import duckdb                                       ││ Resumen|Logs│
│   · codigo · total ││ 2  df = duckdb.query("""                               ││           │
│ ☑ Detalle          ││ 3    SELECT mes, SUM(total) AS ventas                  ││ ✓ 12 filas │
│   · cantidad …     ││ 4    FROM pedidos GROUP BY mes                         ││   3 cols   │
│ ☐ Producto         ││ 5  """).df()                                          ││   0 errores│
│                    ││                                                        ││           │
│ ── Salida ──       ││                                                        ││ [Ver       │
│ 12 filas · 3 cols  ││ Python3.11·pandas·numpy·duckdb     ✓ OK    Ln 5, Col 9 ││  dataset →]│
└────────────────────┘└────────────────────────────────────────────────────────┘└───────────┘
```

### 10.7 AdminPeople — tab Accesos (matriz)
```
Personas y accesos                                     Workspace [ Ventas ▾ ]
( Usuarios | Miembros | Grupos | ‹Accesos a datasets› )
  ┌───────────────┬──────────────────────────────────────────────────────┐
  │ Grupos        │  Dataset: Pedidos                                     │
  │ ‹Ventas›   ●  │   Ventas      ( Sin acceso · Ver · ‹Editar› · Admin ) │
  │ Operaciones   │   Operaciones ( Sin acceso · ‹Ver› · Editar · Admin ) │
  │ Gerencia      │   Gerencia    ( Sin acceso · Ver · Editar · ‹Admin› ) │
  └───────────────┴──────────────────────────────────────────────────────┘
```

### 10.8 AdminAudit
```
◷ Registro de auditoría                       [Tabla|Línea]  [ Exportar ▾ ]
  FILTROS  Acción[Toda ▾] Workspace[Todo ▾] Dataset[Todo ▾] Persona[Toda ▾]   142
  Acción: Ediciones ✕   Persona: Ana ✕                       [ Limpiar todo ]
  ┌─────────────┬──────────┬─────────┬──────────────┬───────────────────────┐
  │ Cuándo      │ Quién    │ Acción  │ Objetivo     │ Cambio                │
  ├─────────────┼──────────┼─────────┼──────────────┼───────────────────────┤
  │ hace 5 min  │ (AG) Ana │ EDITÓ   │ Pedidos·total│ 980 → 1,240           │
  │ hace 12 min │ (CM) Car.│ CREÓ    │ Clientes     │ vacío → (nuevo)       │
  │ 14:02       │ (LP) Luc.│ ELIMINÓ │ Detalle      │ —                     │
  └─────────────┴──────────┴─────────┴──────────────┴───────────────────────┘
                                       [ ‹ Anterior ] página 1 / 4 [ Siguiente › ]
```

### 10.9 Billing
```
◉ Planes y facturación                              Workspace [ Ventas ▾ ]
  Uso del plan actual · Pro · ●Activo
  ┌── Miembros ──┐ ┌── Datasets ──┐ ┌── Registros ─────┐
  │ 18 / 50      │ │ 12 / 50      │ │ 184,300 / 200,000 │
  │ ▓▓▓▓░░░░░░   │ │ ▓▓░░░░░░░░   │ │ ▓▓▓▓▓▓▓▓▓░ ⚠ casi │
  └──────────────┘ └──────────────┘ └──────────────────┘
  Elegir plan
  ┌── Free ──────┐ ┌── Pro ◀ACTUAL ┐ ┌── Business ───┐
  │ S/ 0 /mes    │ │ S/ 490 /mes   │ │ S/ 980 /mes   │
  │ ✓ 3 miembros │ │ ✓ 50 miembros │ │ ✓ 100 miembros│
  │ ✗ Scripts    │ │ ✓ Scripts/API │ │ ✓ Scripts/API │
  │ [Tu plan]    │ │ [Plan actual] │ │ [Cambiar a …] │
  └──────────────┘ └───────────────┘ └───────────────┘
  ── Aviso de pago (admin) ──  Ventas · S/490 · transfer #0012  [Rechazar][Aprobar]
```

### 10.10 ImportExcelModal (wizard)
```
┌─ Importar Excel ──────────────────────────────────────────────────┐
│  ① Subir ─── ② Vista previa ─── ③ Mapear ─── ④ Confirmar          │
│                                                                    │
│   Hojas detectadas:                                                │
│   ☑ Clientes   → dataset [ Clientes      ]   100 filas · 7 col     │
│   ☑ Pedidos    → dataset [ Pedidos       ]   120 filas · 6 col     │
│   ☐ Hoja3 (vacía)                                                  │
│                                                                    │
│   🔒 Cifrado en tránsito y reposo · lo eliminamos al confirmar     │
│                                  [ ‹ Atrás ]      [ Continuar › ]  │
└────────────────────────────────────────────────────────────────────┘
```

### 10.11 RelationScanModal (detección)
```
┌─ Detectar relaciones ─────────────────────────────────────────────┐
│ ( Relaciones (24) | Limpieza sugerida (3) )   [ Re-escanear ]      │
│ Filtro: [Todas ▾]  🔍[ buscar… ]                                   │
│ ┌────────────┬─────────┬───────────┬──────────────┬──────┬───────┐ │
│ │ Desde      │ Columna │ → Hacia   │ Match        │ Score│       │ │
│ ├────────────┼─────────┼───────────┼──────────────┼──────┼───────┤ │
│ │ Pedidos    │ cliente │ Clientes  │ contenido 98%│ 0.98 │[Aplicar]│
│ │ Detalle    │ producto│ Producto  │ contenido 91%│ 0.91 │[Aplicar]│
│ │ Pedidos    │ vendedor│ Empleado  │ solo nombre· │ 0.05 │[Aplicar]│
│ └────────────┴─────────┴───────────┴──────────────┴──────┴───────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## 11. Apéndice — Referencia de endpoints

Base URL local: `http://localhost:8000`. Salvo indicación, todos requieren sesión. Forma de
respuesta = resumen de tipos.

### Auth `/auth`
| Método · Ruta | Notas / parámetros | Respuesta |
|---|---|---|
| POST `/auth/register` | `{email, username, password}` (rate 5/min) | `{access_token, user}` + cookies |
| POST `/auth/login` | `{email, password}` (rate 10/min) | `{access_token, user}` + cookies |
| POST `/auth/logout` · `/auth/refresh` | cookies | `{ok}` / nuevo token |
| GET `/auth/me` | — | `User {id,email,username,role,is_active,created_at}` |
| GET `/auth/signup-config` | — | `{allowed_email_domains[], smtp_configured}` |
| POST `/auth/invite` | `{email, username?}` (manager) | `{user_id, invite_link, email_sent}` |
| POST `/auth/set-password` | `{token, password}` | `{access_token, user}` |
| POST `/auth/ws-ticket` | — | `{ticket}` (JWT 60 s para el WS) |
| GET `/auth/users` | `?workspace_id=` · `?list_all=true` | `User[]` |
| PATCH `/auth/users/{id}/role` | `{role}` (admin) | `User` |
| PATCH `/auth/users/{id}/activate|deactivate` | (admin) | `User` |
| POST `/auth/users/import-excel` | `multipart` (admin) | `{created, skipped, errors[]}` |
| GET `/auth/audit` | `?action=&workspace_id=&dataset_id=&user_id=&skip=&limit=` (admin) | `{total, items[]}` |
| GET `/auth/users/{id}/dataset-access` | — | `[{dataset_id,dataset_name,workspace_name,role,source,is_bridge}]` |

### Workspaces `/workspaces`
| Método · Ruta | Notas | Respuesta |
|---|---|---|
| GET `/workspaces` | — | `[{id,name,description,created_at,my_role}]` |
| POST `/workspaces` | `{name,description?,is_sandbox?}` (admin) | `Workspace` (creador = owner) |
| GET/PATCH/DELETE `/workspaces/{id}` | PATCH owner/admin_ws · DELETE admin | `Workspace` / 204 |
| GET `/workspaces/{id}/members` | — | `[{user_id,username,email,role,joined_at}]` |
| POST/PATCH/DELETE `/workspaces/{id}/members[/{uid}]` | `{user_id,role}` (owner/admin_ws) | `Member` / 204 |
| GET `/workspaces/{id}/access-matrix` | `?mode=groups|users` | `{mode, entries:[{dataset_id,subject_id,role}]}` |

### Datasets `/datasets`
| Método · Ruta | Notas | Respuesta |
|---|---|---|
| GET `/datasets` | `?workspace_id=` (filtra por acceso efectivo) | `Dataset[]` |
| POST `/datasets` | `{name,description?,workspace_id?,is_computed?,source_code?,source_dataset_ids[]?,is_bridge?}` | `Dataset` |
| PATCH/DELETE `/datasets/{id}` | manager del ws | `Dataset` / 204 |
| POST `/datasets/{id}/compute` | dataset calculado (Pro+) | `{records_created,columns_created,last_computed_at}` |
| POST `/datasets/import-from-excel/preview` | `multipart` | `{filename, sheets:[{name,row_count,columns[]}]}` |
| POST `/datasets/import-from-excel` | `?workspace_id=&name=&sheet=` | `{dataset_id,columns_created,records_created}` |
| POST `/datasets/import-from-excel/multi` | `multipart` + `payload` JSON | `{imported:[…]}` |
| GET `/datasets/templates/catalog` | — | `[{id,name,description,icon,color,columns_count,sample_rows_count}]` |
| POST `/datasets/templates/{template_id}` | `?workspace_id=&name=&include_sample=` | `Dataset` |
| GET `/datasets/relationships/scan` | `?workspace_id=&sample_size=&min_content_ratio=` | `{scanned, candidates[], cleanup_suggestions[]}` |
| POST `/datasets/{id}/columns/{col}/normalize-values` | editor | `{updated, groups_unified, canonical_map}` |

> **Dataset** = `{id,name,description,workspace_id,created_at,is_computed,source_code,source_dataset_ids[],last_computed_at,is_bridge}`.

### Columnas `/datasets/{id}/columns`
| Método · Ruta | Notas | Respuesta |
|---|---|---|
| GET `` | viewer+ (`X-Total-Count`) | `Column[]` |
| POST `` | admin · `{name,field_key,data_type,rules,position}` | `Column` |
| PATCH/DELETE `/{col}` | admin (cambiar a relation migra a array) | `Column` / 204 |

> **Column** = `{id,dataset_id,name,field_key,data_type,rules{required,unique,regex,min,max,options[],related_dataset_id,display_field,currency_symbol,max_rating},position,created_at}`.

### Registros `/datasets/{id}/records`
| Método · Ruta | Notas | Respuesta |
|---|---|---|
| GET `` | `?search=&include_deleted=&skip=&limit=&cursor=` (viewer+) | `Record[]` + `X-Total-Count`, `X-Next-Cursor` |
| POST `` | editor · `{data:{…}}` | `Record` |
| PATCH/DELETE `/{rec}` | editor (DELETE = soft) | `Record` / 204 |
| POST `/{rec}/restore` | editor | `Record` |
| GET `/{rec}/history` | viewer+ | `[{field_key,old_value,new_value,action,changed_at,user_name}]` |
| POST `/bulk-delete` | `{ids[]}` (≤1000) | `{deleted,not_found[],invalid[]}` |
| POST `/import-excel` | `multipart` · `?dedupe_on=k1,k2` | `{created,skipped_duplicates,errors[]}` |

> **Record** = `{id,dataset_id,data:{field_key→valor},created_at,updated_at,deleted_at}`.

### Permisos `/datasets/{id}/permissions`
| Método · Ruta | Notas | Respuesta |
|---|---|---|
| GET `` · PUT `` · DELETE `/{user_id}` | admin del dataset · `{user_id,role}` (admin/editor/viewer/none) | `Permission{…,user_email,user_name}` |
| GET `/groups` · PUT `/groups` · DELETE `/groups/{gid}` | `{group_id,role}` | `GroupPermission{…,group_name}` |

### Grupos `/groups`
| Método · Ruta | Notas | Respuesta |
|---|---|---|
| GET `` | `?workspace_id=` | `[{id,name,description,workspace_id,member_count}]` |
| POST `` · PATCH/DELETE `/{id}` | admin / owner/admin_ws | `Group` / 204 |
| GET/POST/DELETE `/{id}/members[/{uid}]` | `{user_id}` | `[{user_id,email,username,role}]` / 204 |
| GET `/{id}/dataset-access` | — | `[{dataset_id,dataset_name,workspace_name,role,is_bridge}]` |

### Billing
| Método · Ruta | Notas | Respuesta |
|---|---|---|
| GET `/billing/plans` | — | `{plans[], mercadopago_enabled, bank, bank_configured}` |
| GET `/workspaces/{id}/billing` | miembro | `{subscription,plan_key,plan,usage{members,datasets,records},can_manage}` |
| POST `/workspaces/{id}/billing/checkout` | `{plan}` (manager) | `{init_point, preference_id}` (Mercado Pago) |
| POST `/workspaces/{id}/billing/transfer` | `{plan,reference?,note?}` (manager) | `{id,status:"pending"}` |
| POST `/billing/webhook` | Mercado Pago | `{ok}` |
| GET `/billing/claims` · POST `/billing/claims/{id}/approve|reject` | admin global | `[claim…]` / `{ok}` |

### Integraciones
| Método · Ruta | Notas | Respuesta |
|---|---|---|
| GET/POST/DELETE `/api-tokens[/{id}]` | `{name,scope:read|write,workspace_id?,expires_at?}` | token completo **solo al crear**; luego solo `prefix` |
| GET/POST/DELETE `/webhooks[/{id}]` | `{url,events[],workspace_id?,dataset_id?}` (Pro+, manager) | `secret` solo al crear; eventos: record.create/update/delete, dataset.create/delete |
| POST `/webhooks/{id}/test` | manager | `{sent, status}` |
| WS `/ws/{dataset_id}` | primer mensaje = ticket JWT | eventos `record_create/update/delete` |
| GET `/health` | — | `{status:"ok"}` |

---

### Entregables esperados del diseño
1. **Sistema visual OpsGrid** sobre los tokens existentes (claro + oscuro; al menos la paleta
   Citrus afinada) con los 3 acentos semánticos (marca / relaciones / calculadas).
2. **Cada pantalla** en desktop **y** móvil (especial atención a DatasetView, la matriz de
   accesos, el editor de scripts y Billing).
3. **Estados de los componentes clave**: DataGrid (celda normal/editando/error/seleccionada,
   fila eliminada, formato condicional), CellEditor por tipo, chips de relación, cards de
   dataset, UsageCard, badges de rol/estado.
4. **Flujos visuales principales**: onboarding/invitación → activación; importar Excel →
   detectar relaciones → limpiar → grilla; crear registro con hijos; ejecutar un script;
   upgrade de plan (selección → pago).
```

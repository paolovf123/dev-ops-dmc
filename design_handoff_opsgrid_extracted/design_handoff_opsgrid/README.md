# Handoff: OpsGrid — App de datos tabulares relacionales

## Overview
OpsGrid convierte Excels desordenados en tablas relacionales editables (estilo Airtable), con
permisos por equipo, scripts Python calculados y auditoría. Audiencia: PyMEs/operaciones en Perú,
usuarios no técnicos. UI 100% en **español (es-PE)**, moneda por defecto **S/ (PEN)**.
Stack target: **React 19 + Vite + TypeScript · React Query · react-router v7 · Monaco · Recharts**.

## About the Design Files
Los archivos de este bundle son **referencias de diseño hechas en HTML** (prototipos del look &
behavior previstos), **no código de producción para copiar tal cual**. La tarea es **recrear estos
diseños en el codebase real** (React 19 + Vite + TS) usando sus patrones y librerías. El prototipo
usa React 18 + Babel inline solo para previsualizar en el navegador; **portá la intención, no el
andamiaje**. El panel "Tweaks" (esquina) es solo para revisar tema/paleta/densidad — **no va a producción**.

## Fidelity
**Alta fidelidad (hi-fi).** Colores, tipografía, espaciado, estados e interacciones son finales y
deben recrearse fiel. Todo el visual sale de `opsgrid/tokens.css` (ver §Design Tokens) — **no hay
hex hardcodeados en componentes**, solo `var(--*)`. Portá los tokens 1:1 y construí los componentes
sobre ellos. (También se incluye `OpsGrid Wireframes.html`, lo-fi, solo como contexto de exploración.)

## Cómo correr la referencia
- Sin servidor: abrir `OpsGrid-standalone.html` (todo embebido).
- Fuente editable: servir la carpeta y abrir `OpsGrid.html` (los `.jsx` se cargan por `<script src>`,
  requiere server local — no funciona por `file://`).

## Arquitectura del prototipo (qué mapear)
- **Routing:** `useState('route')` en `OpsGrid.html` → migrar a **react-router v7** con las rutas del
  brief (`/`, `/datasets/:id`, `/datasets/:id/new`, `/scripts`, `/computed/...`, `/admin/personas`,
  `/admin/workspaces`, `/admin/audit`, `/billing`, `/settings`, `/login`, `/set-password`).
- **Datos:** mocks por módulo (`ROWS0`, `DSETS`, `SCAN`, …) → **React Query** sobre los endpoints del
  apéndice del brief. Moneda `S/` con `Intl.NumberFormat('es-PE')`.
- **Modales:** API imperativa global `openModal(name, props)` + `<ModalHost>` (en `modals.jsx`) →
  reemplazar por tu store/portal (Context/Zustand). Toasts y `ConfirmDialog` igual.
- **Iconos:** set propio `<Icon name>` (line icons SVG, stroke 1.7, viewBox 24) en `ds.jsx` →
  reemplazable por lucide/tabler manteniendo nombres.

## Screens / Views
Cada pantalla vive en su módulo bajo `opsgrid/`. Resumen (layout + propósito); el detalle visual
exacto está en el código fuente referenciado.

1. **AppShell** (`shell.jsx`) — marco global. Topbar 58px (logo→home · WorkspaceSwitcher con avatar
   gradiente + pill de rol · GlobalSearch con `⌘K` y dropdown de resultados · toggle tema · campana ·
   engranaje→Integraciones · UserMenu). **Riel izquierdo colapsable**: 66px (solo iconos) que se
   expande a 236px al hover o fijado con pin; ítems Datasets/Scripts(badge)/Personas/Workspaces/
   Auditoría/Facturación con marca de manager (★) / admin-global (★★), tarjeta de upgrade al pie + logout.
2. **DatasetList / Home** (`home.jsx`) — header (título + acciones Detectar relaciones / Nuevo dataset),
   toolbar (buscar · Diagrama · Relaciones · toggle Intermedias), **grid de cards** (icono por tipo,
   nombre, código mono, stats, badges de relación naranjas / calculadas magenta / intermedia) + card
   "Nuevo dataset" punteada + **Mapa de relaciones** (SVG con aristas 1:N/N:N). Skeletons al cargar,
   entrada en cascada.
3. **DatasetView** (`datasetview.jsx`) — núcleo. Header (nombre + editar + badge **Live** pulsante +
   meta) + tabs **Tabla/Kanban/Gráficos/Papelera**. Toolbar (Buscar · Filtros(n) · Columnas · Exportar ·
   Accesos · menú ⋯ · +Columna · +Nuevo registro) + chips de filtros activos. **DataGrid**: header
   sticky, columnas congeladas (checkbox + #), render por tipo (relación=chips naranja read-only,
   fórmula=ƒ magenta con `#ERROR` rojo, currency `S/ 1,234.56` mono, enum=badge con dot, date mono),
   edición inline (ver Interactions), barra de selección con stats (Cuenta/Suma/Promedio con count-up),
   acciones de fila (historial/eliminar) al hover, pie con paginación, sección Tablas relacionadas.
   Kanban (columnas por enum), Gráficos (barras + dona SVG), Papelera (soft-deleted + restaurar).
4. **ComputedDatasetEditor** (`computed.jsx`) — 3 columnas: fuentes (datasets seleccionables + chips de
   columnas) · editor estilo Monaco (Python con coloreado de tokens, toolbar, status bar) · panel de
   salida (tabs Resumen/Logs: métricas + vista previa + "Ver dataset"). El editor es dark fijo.
5. **AdminPeople · Accesos** (`matrix.jsx`) — PageHeader + tabs (Usuarios/Miembros/Grupos/Accesos) +
   selector de workspace + acciones (Invitar / Accesos directos). **Heatmap** dataset × grupo: cada
   celda es un bloque coloreado por rol (Sin acceso=neutro · Ver=pri · Editar=success · Admin=violet),
   click cicla el rol; leyenda + nota de prioridad. Toggle Por grupos / Por usuarios.
6. **ScriptsHub · AdminWorkspaces · AdminAudit** (`admin.jsx`) — Hub de scripts (tabla con badges
   SIN CÓDIGO/SIN FUENTES, ejecutar/editar/eliminar) · CRUD de workspaces (lista + panel con tabs
   Datasets/Configuración, checkbox sandbox) · Auditoría (toggle Tabla/Línea de tiempo, filtros, chips,
   badges de acción CREÓ/EDITÓ/ELIMINÓ/INVITÓ).
7. **Billing** (`billing.jsx`) — uso (3 UsageCards con barra y aviso al 80%/95%) · planes Free/Pro/
   Business en S/ (Pro = actual, recomendado) · método de pago (Mercado Pago / Transferencia con datos
   bancarios) · aviso de pago para aprobar (admin).
8. **Settings · Integraciones** (`settings.jsx`) — sidebar API tokens / Webhooks. Tokens: form + token
   mostrado una vez (card verde con copiar) + lista con revocar. Webhooks (Pro+): form con eventos +
   lista con status/fail_count + test/eliminar.
9. **CreateDataset + RecordForm** (`flows.jsx`) — wizard (Elegir origen: drop Excel/CSV + galería de
   plantillas + desde cero · Configurar columnas: nombre + tabla de columnas con tipo/requerido) ·
   alta de registro con secciones (campos propios · relaciones con "crear nuevo" · datasets hijos
   colapsables con sub-tablas · footer sticky "Guardando en…").
10. **Login + activación** (`auth.jsx`) — bifold: panel de marca (gradiente pri→calc, eyebrow,
    H1 "Tus Excels caóticos, **limpios.**", testimonial) + form con tabs Entrar/Crear cuenta (toggle
    ver/ocultar contraseña, nota "primer usuario = admin"), CTA "Adquiere OpsGrid", y modo set-password.
11. **Modales** (`modals.jsx`) — ImportExcel (wizard 4 pasos), RelationScan (relaciones + limpieza con
    score), AddColumn / EditColumn (type-aware, 14 tipos), DatasetAccess (permisos por usuario con
    RoleSegmented), InviteUser, RecordHistory (slide-over timeline), ConditionalFormatting,
    SearchReplace, SchemaDiagram, CsvMapping, TemplatePicker, RelationsManager, LinkTable. + Toasts +
    ConfirmDialog.

## Interactions & Behavior
- **Riel:** hover expande (66↔236px); pin lo fija (desplaza el contenido). Transición de width
  instantánea (ver Notes). Ítem activo = `--pri-soft` + barra lateral; hover = `--surface-alt`.
- **DataGrid — edición inline:** click en celda editable → input con anillo `--accent-pri` y
  **autoselección**. `Enter` confirma y baja a la fila siguiente · `Tab` salta a la derecha · `Esc`
  revierte. **Validación viva**: borde rojo + burbuja flotante (`⚠ msg`) mientras es inválido
  (`currency`→numérico≥0, `codigo`→regex `^PED-\d{4}$`, `date`→fecha válida); al intentar confirmar
  inválido la celda hace **shake** (~380ms). Al guardar, la celda **destella verde** (~650ms).
- **Selección:** checkboxes por fila + header select-all → barra de stats con **count-up** (~360ms,
  ease-out cubic) en Cuenta/Suma/Promedio; acciones bulk (Relacionados / Eliminar(N) con ConfirmDialog).
- **Heatmap permisos:** click en celda cicla rol (mutación optimista). Único admin bloqueado (lock).
- **Modales:** overlay `--overlay` + card centrada, cierra con Esc o click backdrop. SlideOver entra
  desde la derecha. Toasts abajo-derecha, autodismiss ~3.2s.
- **Tema/paleta:** al cambiar, **cross-fade** ~0.3s (transición temporal de background/border/color/
  shadow vía clase `theme-anim` en `<html>` durante ~420ms).
- **Carga:** skeletons con shimmer (~0.8s) en Home; entrada en cascada (stagger) de cards.
- **Estados requeridos por vista** (del brief): carga (skeleton/spinner con texto) · vacío (EmptyState
  + CTA) · error (alerta inline roja con `detail` + toast) · 401/403 no reintentan.

## State Management
- Sesión/rol (admin/editor/viewer global; owner/admin_ws/member por workspace) → gating de UI.
- Workspace activo (contexto global) · route actual.
- Por dataset: columnas, registros (paginados con cursor), filtros/orden activos, selección, celda en
  edición + validez, papelera. Edición en vivo por **WebSocket** → badge Live.
- Modales/toasts: estado de UI global. Tema/paleta/densidad: persistidos (localStorage) y aplicados a
  `<html data-theme|data-palette|data-density>`.

## Design Tokens (`opsgrid/tokens.css` — portar 1:1)
Set en `<html>`: `data-theme=light|dark`, `data-palette=citrus|electric|mint|dusk|tropic|y2k`,
`data-density=compact|regular|comfy`.

**3 acentos semánticos por paleta** (`--accent-pri` marca/CTA/foco/Live · `--accent-rel` relaciones ·
`--accent-calc` calculadas):
| paleta | pri | rel | calc |
|---|---|---|---|
| citrus (default) | `#1e4cff` | `#ff6a18` | `#e436b6` |
| electric | `#4361ff` | `#ff4d6d` | `#b14dff` |
| mint | `#0ea371` | `#ff8a3d` | `#c44ddb` |
| dusk | `#7b6cff` | `#f0875a` | `#d96bb4` |
| tropic | `#0bb3c9` | `#ff7a45` | `#f25c8a` |
| y2k | `#3b5bff` | `#ff5fb0` | `#9b6bff` |

**Estados (constantes):** success `#0fb583` · warning `#f4a300` · danger `#e8455a` · violet `#7a5ae0`.
**Tints** `--pri-soft/--rel-soft/--calc-soft/…` vía `color-mix` (alpha mayor en dark).

**Neutros LIGHT:** bg `#f3f5f9` · surface `#ffffff` · surface-alt `#eef1f6` · surface-2 `#f8fafc` ·
border `#e4e8ef` · border-strong `#d0d7e2` · text `#161b24` · text-soft `#586173` · text-mute `#98a1b2`.
**Neutros DARK:** bg `#0b0e14` · surface `#141922` · surface-alt `#1b212c` · surface-2 `#10151d` ·
border `#29313e` · border-strong `#3a4452` · text `#e9edf4` · text-soft `#9ba6b6` · text-mute `#647082`.

**Radii:** 4/8/12/16/24/pill (`--r-1..--r-5`, `--r-pill`). **Sombras:** `--shadow-1..--shadow-4` +
`--shadow-focus` (anillo `--accent-pri` 32%). **Transiciones:** 120/150/240ms (`--t-fast/-mid/-slow`).
**Densidad de fila:** `--row-h` = 30/38/44 (compact/regular/comfy). **Tipo:** Inter (UI, 11–48px,
pesos 400/500/600/700) + JetBrains Mono (`.mono`: claves, montos, fechas, código).

## Reglas de negocio que la UI refleja (resumen — ver brief completo)
- 14 tipos de columna con reglas (text/long_text · number/currency/percent/rating · date · enum ·
  multiselect · boolean · email/phone/url · **relation** = siempre array JSONB, editor multi-chip).
- Relaciones N:N unificadas; tablas intermedias (`is_bridge`) ocultas por defecto. Scanner: el
  contenido manda (score 0.85×contenido + 0.15×nombre).
- Soft delete → Papelera. Historial por cambio. Import ≤10 MB, all-or-nothing, dedupe opcional.
- Permisos por prioridad: admin global › directo › grupo › workspace › rol global; `none` = bloqueo.
- Planes en S/: Free 0 / Pro 490 / Business 980. Scripts y API/webhooks requieren Pro+. 402 al exceder.

## Assets
- Iconos: SVG inline propios en `ds.jsx` (`ICONS`), sin dependencias. Reemplazables por lucide/tabler.
- Fuentes: Inter + JetBrains Mono (Google Fonts). Sin imágenes de marca; los avatares son gradientes
  determinísticos por nombre (`hashHue` en `ds.jsx`). Las plantillas usan emoji.

## Files (referencia)
```
OpsGrid.html              entrypoint (routing + Tweaks + carga de módulos)
OpsGrid-standalone.html   build de 1 archivo (abrir sin servidor)
opsgrid/tokens.css        ★ design tokens
opsgrid/ds.jsx            iconos + primitivos (Badge, Chip, Btn, IconBtn, Avatar, Toggle, Kbd)
opsgrid/shell.jsx         AppShell
opsgrid/home.jsx          DatasetList
opsgrid/datasetview.jsx   DataGrid + Kanban/Chart/Trash
opsgrid/matrix.jsx        AdminPeople (heatmap)
opsgrid/computed.jsx      ComputedDatasetEditor
opsgrid/billing.jsx       Billing
opsgrid/admin.jsx         ScriptsHub + AdminWorkspaces + AdminAudit
opsgrid/settings.jsx      Integraciones
opsgrid/flows.jsx         CreateDataset + RecordForm
opsgrid/auth.jsx          Login
opsgrid/modals.jsx        sistema de modales + toasts + confirm + todas las familias
wireframes/               lo-fi + tweaks-panel.jsx
OpsGrid Wireframes.html   wireframes lo-fi (contexto)
```
> El DESIGN_BRIEF.md original (en `uploads/`) es la especificación funcional completa: roles,
> endpoints, reglas por tipo y wireframes ASCII. Adjuntarlo es muy recomendable.

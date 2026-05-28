# OpsGrid · Handoff de diseño · Fase 1

Estás recibiendo **wireframes** (low/mid-fi) — la estructura, los flujos y el sistema base están firmes; los pixels finales (sombras, micro-interacciones, ilustraciones) vendrán en la fase hi-fi. Lo que ya puedes empezar a montar en frontend:

1. **Tokens de diseño** (`tokens.css` + `tokens.json`)
2. **Tipografías** (Google Fonts)
3. **Estructura de chrome** (top bar + sidebar + page header + toolbar)
4. **Reglas de columnas relacionadas / lookup / calc** ← lo más importante del diseño
5. **Convención de paletas swappeables**

---

## 1 · Tokens

### Cómo cargarlos

```html
<!-- index.html -->
<html lang="es" data-palette="electric" data-theme="light">
  <head>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/styles/tokens.css">
  </head>
</html>
```

Cambia la paleta global con `data-palette="electric|citrus|mint|dusk|tropic|y2k"` en `<html>`. Cambia tema con `data-theme="light|dark"`.

### Reglas duras

- **Nunca** hardcodear `#hex` en componentes — siempre `var(--accent-rel)`, `var(--text)`, etc.
- **Nunca** usar `px` para espaciado fuera de los tokens `--sp-*`. Excepción: bordes (1px / 2px), iconos.
- Radios siempre vía `--r-*`. Botones = `--r-2`, cards = `--r-3`, modales = `--r-4`.
- Tipografía solo desde la escala (`--fs-12`, `--fs-14`, etc.). No inventes tamaños intermedios.
- Foco visible obligatorio: `:focus-visible { box-shadow: var(--shadow-focus); }` ya está en `tokens.css`.

### Mínimos de accesibilidad

- Contraste AA en cualquier texto sobre cualquier surface (mínimo 4.5:1 en `--text` vs `--surface`).
- Toque mínimo 32 px en desktop, 44 px en móvil — usa `--row-h-comfy` para listas tocables.
- Foco visible nunca se elimina; solo se reemplaza por algo equivalente.

---

## 2 · Roles semánticos del color

OpsGrid usa **tres acentos semánticos** (no más). Cada uno tiene un significado fijo en el producto. NO los uses para otra cosa.

| Token | Rol | Dónde aparece |
|---|---|---|
| `--accent-pri` | Marca · CTA primario · foco · indicador "Live" · link activo | Botón "Nuevo registro", indicador online, celda en edición, breadcrumb activo |
| `--accent-rel` | **Relaciones entre tablas** (FK, chips, lookups, bandas agrupadoras) | Chip "ACME S.A.C." que apunta a otra tabla, prefijo ↳ de columnas lookup, banda superior del header agrupado |
| `--accent-calc` | **Columnas calculadas / scripts / valores derivados** | Cualquier valor que viene de un script Python — saldo, mora calculada, agregados |

Variantes soft de cada acento (para fondos sutiles):
- `--accent-pri-soft`, `--accent-rel-soft`, `--accent-calc-soft`

---

## 3 · Tipografía

```
Inter         400 / 500 / 600 / 700   — todo
JetBrains Mono  400 / 500            — RUC, IDs, fechas, valores numéricos en chips, código
```

- UI text default: `--fs-14` / `--lh-14`, peso 400, color `--text`.
- Headings: `--fw-semibold` (600), letter-spacing -0.01em a -0.02em desde `--fs-22` arriba.
- Numeric (tablas, montos): `font-variant-numeric: tabular-nums;` siempre.
- IDs, RUC, fechas, códigos: `font-family: var(--font-mono);`.

---

## 4 · Chrome de la app (estructura)

```
┌─ Top bar ────────────────────────────────────────────────────┐
│  logo  workspace › dataset    [● Live]      ⌘K   👤         │
├──────────┬──────────────────────────────────────────────────┤
│ Sidebar  │  Page header                                      │
│ 200px    │  ├─ title + meta + tabs                          │
│          │  ├─ Toolbar (buscar, filtros, columnas, +)       │
│          │  └─ Content (grid / kanban / form / panel)       │
└──────────┴──────────────────────────────────────────────────┘
```

Detalles firmes:
- Sidebar `width: 200px`, `border-right: 1px solid var(--border-soft)`, background `var(--surface)`.
- Top bar `height: 48px`, `border-bottom: 1px solid var(--border-soft)`.
- Item del sidebar `padding: 5px 8px`, `radius: var(--r-1)`, hover = `var(--surface-alt)`, activo = `var(--surface-alt)` + texto `var(--text)`.

---

## 5 · Dataset view · Reglas de columnas (CRÍTICO)

Esta es la parte del diseño que más importa entender bien antes de codear. Hay **cuatro tipos** de columna y se renderizan distinto.

### A · Columna nativa
Texto, número, fecha, select, booleano que vive en esta tabla. Sin acento. Texto = `var(--text)`. Números a la derecha + `tabular-nums`. Fechas en mono.

### B · Columna relación (FK)
Apunta a un registro de OTRA tabla. Header con glifo `◇` + tint suave `--accent-rel`. Render del valor: **5 variaciones siendo evaluadas** — la decisión final la confirmamos cuando elijas variante (V1 chip / V2 inline / V3 side-panel / V4 banda / V5 código mono). El frontend debe abstraer el render para poder cambiarlo en un solo lugar.

```jsx
<RelationCell value={row.cliente} target="clientes" />
// internamente decide chip vs link vs código mono según config global
```

### C · Columna lookup (derivada de relación)
Texto plano que VIENE de la tabla relacionada (ej. el RUC del cliente). El usuario NO la edita aquí. Render:
- Header con glifo `↳` o un sub-label "de cliente"
- Tint MUY suave de `--accent-rel` (10–14% mix) en el header
- Texto en `var(--text-soft)`
- En hover, tooltip "Lookup desde Clientes · campo RUC"
- Click → abre la tabla origen filtrada en ese registro

### D · Columna calculada (script)
Resultado de un script Python sobre otras columnas. SIEMPRE `--accent-calc`.
- Header con glifo `ƒ` + tint suave `--accent-calc`
- Valor en mono, color `color-mix(in oklab, var(--accent-calc) 50%, var(--text))`
- NO editable. Click en celda → abre el script que la produce.

### Estados de celda

| Estado | Render |
|---|---|
| Default | `padding: 0 var(--sp-3)`, alto = `--row-h-{density}` |
| Focused (selección sin editar) | `box-shadow: inset 0 0 0 1.5px var(--accent-pri)` |
| Editing | Mismo + cursor de texto, fondo `var(--surface)` |
| Inválida | `box-shadow: inset 0 0 0 1.5px var(--danger)`, icono ⚠ a la derecha |
| Row seleccionada | `background: var(--accent-pri-soft)`, primer td con bar lateral `--accent-pri` |
| Row eliminada (papelera) | `text-decoration: line-through`, `opacity: 0.5` |

### Densidades

`<table data-density="compact|regular|comfy">` (default `regular`).
- compact: 28px filas — para análisis, scaneo rápido
- regular: 34px — default
- comfy: 42px — formularios densos, móvil

---

## 6 · Componentes base · firmas

Las firmas exactas las congelamos en hi-fi. Pero ya puedes andamiar:

```
<Button variant="primary | ghost | danger" size="sm | md" iconLeft iconRight>
<Input type="text | number | date | select" state="default | error | disabled">
<Chip tone="relation | neutral | success | warning | danger">
<Badge tone="…" size="sm | md">
<Avatar src="" fallback="MA" size="xs | sm | md">
<Toast type="success | error | info" duration={4000}>
<Modal size="sm | md | lg | full" title actions>
<Tabs items=[…] value onChange>
<Toolbar>   <Toolbar.Group> <Toolbar.Separator> </Toolbar>
<Table data columns onRowClick stickyHeader>
<EmptyState illustration title body cta>
<UsageBar value max label>
<Tooltip side="top" delay={120}>
```

---

## 7 · Convenciones de naming y archivos

```
/styles
  tokens.css              ← este archivo
  globals.css             ← reset + base + clases utilitarias
/components
  /primitives             Button, Input, Chip, Badge, Avatar...
  /chrome                 TopBar, Sidebar, PageHeader, Toolbar
  /dataset
    DataGrid.tsx
    cells/
      NativeCell.tsx
      RelationCell.tsx
      LookupCell.tsx
      ComputedCell.tsx
    ColumnHeader.tsx
    RowSidePanel.tsx      (V3)
    RelationHoverCard.tsx (V5)
/features
  /datasets               Lista, crear, importar
  /scripts                Editor + hub
  /personas               Usuarios, miembros, grupos, accesos
  /billing                Planes + facturación
  /admin                  Workspaces + auditoría
```

---

## 8 · Lo que TODAVÍA NO está firme

No empieces a codear esto, espera fase hi-fi:

- Ilustraciones de empty states
- Set de íconos exacto (probablemente `lucide` o `phosphor`, por confirmar)
- Forma final de los chips de relación (V1–V5 está en evaluación)
- Animaciones de transición de modales y side panels
- Estilo de tooltips e hover cards

---

## 9 · Próximos pasos del lado de diseño

1. Confirmar variante para columnas relación (V1–V5)
2. Confirmar paleta final (`electric` es el default tentativo)
3. Subir Fase 1 a hi-fi: dataset view + login + home + formulario de registro
4. Fase 2: resto de pantallas (scripts, personas, facturación, auditoría)

Cuando confirmes (1) y (2), congelamos `tokens.css v1.0` y el frontend puede empezar el grid en serio.

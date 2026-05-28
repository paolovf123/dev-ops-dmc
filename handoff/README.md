# OpsGrid · Paquete completo para frontend

> **Versión:** 1.0 — Proyecto final (14 pantallas hi-fi)
> **Decisiones firmes:** Paleta **Citrus pop** · Variante de grid **V5** (códigos mono + hover-card) · Tipografía **Inter** sola · Íconos **Lucide** · Forma **suave y cálida** (radios 8–16 px) · Dark mode incluido

---

## 📦 Qué contiene este paquete

### Documentación
```
handoff/
├── README.md                  ← este archivo (léelo primero)
├── HANDOFF.md                 ← guía técnica detallada (reglas, naming, do/don't)
```

### Sistema de diseño · arranca aquí
```
├── tokens.css     ·  ds-tokens.css   ← variables CSS (color, tipo, espaciado, radios, sombras)
├── tokens.json                       ← mismo en JSON (Style Dictionary / Tailwind)
├── styles.css     ·  ds-styles.css   ← todos los componentes ya estilizados
├── 01-Design-System.html             ← documentación visual viva (ábrelo en el navegador)
```

### Pantallas hi-fi · 14 archivos navegables entre sí
```
├── 00-Index.html              ← portada navegable con dark mode toggle
├── 02-Dataset.html            ← LA pantalla estrella
├── 03-Login.html              ← login + set password
├── 04-Home.html               ← lista de datasets
├── 05-Form-Registro.html      ← crear / editar fila
├── 06-Import-Excel.html       ← wizard multi-paso · diferencial
├── 07-Scripts-Editor.html     ← editor Monaco-ish + sources + output
├── 08-Scripts-Hub.html        ← lista de scripts
├── 09-Personas.html           ← matriz de accesos
├── 10-Workspaces.html         ← admin global
├── 11-Auditoria.html          ← log inmutable con diff
├── 12-Billing.html            ← planes y facturación
├── 13-Settings.html           ← preferencias de cuenta
```

### Estilos por pantalla (modulares)
```
├── dataset.css     ← chrome + grid (la usan todas las pantallas con sidebar)
├── phase4.css      ← login + home + form + import wizard
├── phase5.css      ← scripts editor + matriz + audit + billing + settings + dark mode
├── theme.js        ← lee localStorage para aplicar dark/light antes del primer paint
```

---

## 🚀 Cómo arrancar (5 minutos)

### 1. Instala las fuentes

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### 2. Copia el CSS a tu proyecto

Mínimo:
```
/src/styles/tokens.css     (variables)
/src/styles/styles.css     (componentes)
```

Si vas a refactorizar a CSS Modules / styled-components / Tailwind, usa `tokens.json` como fuente para tu config.

### 3. Impórtalos en este orden

```js
import './styles/tokens.css';   // primero los tokens
import './styles/styles.css';   // después los componentes
```

### 4. Marca `<html>` con la paleta y tema

```html
<html lang="es" data-palette="citrus" data-theme="light">
```

Paletas válidas: `citrus` (default), `electric`, `mint`, `dusk`, `tropic`, `y2k`.
Tema: `light` o `dark`.

### 5. Instala Lucide para los íconos

```bash
npm install lucide-react
```

```jsx
import { Search, Filter, Plus } from 'lucide-react';

<Search size={16} strokeWidth={1.75} />
```

Stroke 1.75 uniforme. Tamaños: 14px en botones, 16px UI default, 18px sidebar/headers.

### 6. Dark mode

Incluye `theme.js` en `<head>` antes de los `<link>` para evitar flash de claro al cargar. Cambia con:

```js
document.documentElement.setAttribute('data-theme', 'dark');
localStorage.setItem('opsgrid-theme', 'dark');
```

---

## 🎨 Las 3 reglas duras

1. **Nunca hardcodees colores.** Siempre `var(--accent-pri)`, `var(--text)`. Si no existe, primero pregúntanos.
2. **Espaciado solo desde la escala** (`--sp-1` a `--sp-20`). Nada de `padding: 7px`.
3. **Tipografía solo desde la escala** (`--fs-11` a `--fs-48`). Si necesitas algo intermedio, replantea.

---

## 🎯 Los 3 acentos semánticos (importante)

Memorízalos. Cada uno tiene UN solo rol:

| Token | Color | Rol |
|---|---|---|
| `--accent-pri` | 🔵 `#1E4CFF` Cobalt | Marca, CTA primario, foco, "Live", link activo |
| `--accent-rel` | 🟠 `#FF6A18` Naranja | **Relaciones entre tablas** (FK, chips, lookups, bandas) |
| `--accent-calc` | 🟣 `#E436B6` Magenta | **Scripts y columnas calculadas** (todo lo derivado) |

Cuando un usuario ve naranja en una celda → "esto viene de otra tabla".
Cuando ve magenta → "esto lo calculó un script, no lo edites".

---

## 🧩 Componentes ya estilizados

Todos en `styles.css`. Úsalos como clases HTML directamente; cuando construyas tus componentes React/Vue, envuelve estas clases.

| Componente | Clase base | Ejemplo |
|---|---|---|
| Botón | `.btn` | `<button class="btn btn--primary">Crear</button>` |
| Input | `.input` | `<input class="input" type="text">` |
| Chip de relación V5 | `.chip.chip--code` | `<span class="chip chip--code">CL-0421</span>` |
| Status pill | `.status-pill` | `<span class="status-pill status-pill--ok">…</span>` |
| Tabs subrayadas | `.tabs` + `.tab` | |
| Segmented control | `.segmented` | matriz de accesos |
| Tabla con tipos | `.dv-grid` (en `dataset.css`) | con `.col-glyph--rel/look/calc` |
| Hover-card de relación | `.dv-hover-card` | popover V5 |
| Empty state | `.empty` | con `__art` + título + body + CTA |
| Toast | `.toast.toast--success/error/info` | |
| Modal | `.modal` | con `__head` / `__body` / `__foot` |
| Avatar | `.avatar` | `--xs` / `--sm` / `--lg` |
| Usage bar | `.usage` | con `--warn` / `--danger` |
| Dataset card | `.dataset-card` o `.h-card` | tarjeta de home |
| Wizard stepper | `.wiz-steps` + `.wiz-step` | |
| Access matrix | `.matrix` + `.access-seg` | matriz de personas/accesos |

Abre **`01-Design-System.html`** en el navegador — verás todos los componentes en vivo con sus variantes y estados.

---

## 📋 Estructura sugerida del proyecto

```
/src
├── styles/
│   ├── tokens.css            ← copiado de aquí
│   ├── styles.css            ← copiado de aquí
│   ├── dataset.css           ← chrome compartido + grid
│   ├── phase4.css            ← auth + home + form + wizard
│   ├── phase5.css            ← editor + matrix + audit + billing + dark mode
│   └── globals.css           ← reset adicional si lo necesitas
├── components/
│   ├── primitives/           Button, Input, Chip, Badge, Avatar, Tooltip
│   ├── chrome/               TopBar, Sidebar, PageHeader, Toolbar
│   ├── dataset/
│   │   ├── DataGrid.tsx
│   │   ├── cells/
│   │   │   ├── NativeCell.tsx
│   │   │   ├── RelationCell.tsx     ← chip mono + hover-card (V5)
│   │   │   ├── LookupCell.tsx
│   │   │   └── ComputedCell.tsx
│   │   ├── ColumnHeader.tsx
│   │   └── RelationHoverCard.tsx
│   ├── import/
│   │   ├── ImportWizard.tsx         ← 5 pasos
│   │   ├── ColumnMapping.tsx
│   │   └── RelationDetectCard.tsx
│   ├── personas/
│   │   └── AccessMatrix.tsx         ← matriz con herencia
│   └── feedback/             Toast, Modal, EmptyState
└── features/
    ├── datasets/
    ├── scripts/                     Editor (Monaco) + Hub
    ├── personas/
    ├── billing/
    ├── audit/
    └── workspaces/
```

---

## 📸 Cómo entregarlo al equipo

1. Descomprime este zip
2. Abre `00-Index.html` en el navegador — verás todas las pantallas con links entre sí, toggle de dark mode, y un banner de "Paquete listo"
3. Pide a tu lead/diseñador que pase de `01` a `13` y verifique que entiende las decisiones
4. Cuando arranquen a codear, abre `01-Design-System.html` como referencia visual permanente

---

## ✅ Lo que SÍ está firme

- Tokens (color, tipo, espaciado, radios, sombras, transiciones)
- Las 6 paletas swappeables
- Naming de componentes y clases
- Reglas de las 4 tipos de columna (nativa / relación / lookup / calc)
- Variante de chip de relación: **V5** (código mono `CL-0421` + hover-card)
- Iconografía: Lucide stroke 1.75
- Layouts de las 14 pantallas
- Dark mode

## 🚧 Lo que TODAVÍA puede iterarse

- Ilustraciones de empty states (ahora son iconos)
- Animaciones de transición de modales y side panels (las CSS están, pero no probadas)
- Mobile/tablet (todo es desktop-first; faltan los breakpoints)
- Estados específicos que aparezcan en QA

---

## ❓ Cualquier duda

- Reglas técnicas → `HANDOFF.md`
- Componente en vivo → `01-Design-System.html`
- Pantalla completa → `00-Index.html`
- Tokens para tu build → `tokens.json`

**Pregunta antes de inventar.** 10 minutos de consulta valen 2 días de rework.

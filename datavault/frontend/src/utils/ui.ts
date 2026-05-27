// Estilos de UI compartidos entre modales y paneles administrativos.
// Centraliza lo que estaba duplicado verbatim (estilos th/td de tabla en modales)
// y el sistema de color de roles de dataset (admin/editor/viewer/none), que vivía
// con formas ligeramente distintas en DatasetAccessModal y WsTabPermissions.
import type { CSSProperties } from "react";

// ── Estilos de tabla para modales ────────────────────────────────────────────
// Definición idéntica que estaba copiada en DatasetAccessModal, RelationsManagerModal
// y RelationScanModal.
export const modalTh: CSSProperties = {
  padding: "8px 12px", textAlign: "left", fontWeight: 600,
  borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)",
  fontSize: 12, whiteSpace: "nowrap",
};
export const modalTd: CSSProperties = {
  padding: "8px 12px", verticalAlign: "top",
};

// ── Estilo de roles de dataset ────────────────────────────────────────────────
// admin/editor/viewer/none. Cada consumidor toma los campos que necesita:
//  - badge suave (pill): `bg` + `fg` + `label`
//  - badge sólido (matriz): `solid` + `short`
export interface DsRoleStyle {
  bg: string;     // fondo suave para pill
  fg: string;     // color de texto / acento
  solid: string;  // color sólido (matriz, texto blanco encima)
  label: string;  // etiqueta completa en español
  short: string;  // letra única para celdas compactas
}

export const DS_ROLE_STYLE: Record<string, DsRoleStyle> = {
  admin:  { bg: "#FEE2E2", fg: "#DC2626", solid: "#DC2626", label: "Admin",      short: "A" },
  editor: { bg: "#FEF3C7", fg: "#D97706", solid: "#D97706", label: "Editor",     short: "E" },
  viewer: { bg: "#DBEAFE", fg: "#2563EB", solid: "#2563EB", label: "Visualizar", short: "V" },
  none:   { bg: "#F3F4F6", fg: "#6B7280", solid: "#6B7280", label: "Sin acceso", short: "-" },
};

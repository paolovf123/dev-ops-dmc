// Primitivas compartidas de los diagramas de esquema (SchemaDiagram y
// GlobalSchemaDiagram). Centraliza lo que estaba duplicado verbatim:
//  - sistema de color por data_type (TYPE_SHORT/FG/BG + typeStyle)
//  - paleta de acentos por dataset (PALETTE)
//  - cálculo de alto de caja (makeBoxH, parametrizado por layout)
//  - exportación a PNG (downloadPng)
//
// Las cajas/flechas SVG en sí NO se comparten: difieren a nivel de píxel
// (anchos 268 vs 252, tamaños de fuente, variante isCurrent) y unificarlas
// exigiría tantos parámetros de estilo que sería peor que la duplicación.
import type { ColumnDefinition } from "../types";

// ── Sistema de color por tipo de columna ────────────────────────────────────
export const TYPE_SHORT: Record<string, string> = {
  text: "txt", long_text: "↕txt", url: "url", email: "mail", phone: "tel",
  number: "num", currency: "$", percent: "%", rating: "★",
  enum: "list", multiselect: "list+", boolean: "bool", date: "date", relation: "→",
};
export const TYPE_FG: Record<string, string> = {
  text: "#64748B", long_text: "#475569", url: "#0891B2", email: "#0284C7", phone: "#0369A1",
  number: "#2563EB", currency: "#16A34A", percent: "#7C3AED", rating: "#D97706",
  enum: "#B45309", multiselect: "#C2410C", boolean: "#059669", date: "#7C3AED", relation: "#DB2777",
};
export const TYPE_BG: Record<string, string> = {
  text: "#F1F5F9", long_text: "#F1F5F9", url: "#E0F2FE", email: "#E0F2FE", phone: "#DBEAFE",
  number: "#DBEAFE", currency: "#DCFCE7", percent: "#EDE9FE", rating: "#FEF3C7",
  enum: "#FEF9C3", multiselect: "#FEE2E2", boolean: "#DCFCE7", date: "#EDE9FE", relation: "#FCE7F3",
};

/** Etiqueta corta + colores fg/bg para un data_type (con fallback). */
export function typeStyle(dataType: string): { short: string; fg: string; bg: string } {
  return {
    short: TYPE_SHORT[dataType] ?? dataType.slice(0, 4),
    fg: TYPE_FG[dataType] ?? "#64748B",
    bg: TYPE_BG[dataType] ?? "#F1F5F9",
  };
}

/** Paleta de acentos rotada por índice de dataset. */
export const PALETTE = [
  "#0EA5E9", "#3B82F6", "#F5821F", "#8B5CF6", "#0EA5E9",
  "#EC4899", "#14B8A6", "#F59E0B", "#6366F1", "#10B981",
  "#EF4444", "#06B6D4", "#84CC16", "#A855F7", "#F97316",
];

// ── Geometría de caja ────────────────────────────────────────────────────────
export interface BoxLayout {
  HDR_H: number;
  ROW_H: number;
  BOX_PAD: number;
  MAX_ROWS: number;
}

/** Devuelve un calculador de alto de caja para un layout dado. */
export function makeBoxH(layout: BoxLayout) {
  const { HDR_H, ROW_H, BOX_PAD, MAX_ROWS } = layout;
  return (cols: ColumnDefinition[]): number =>
    HDR_H + Math.min(cols.length, MAX_ROWS) * ROW_H + BOX_PAD +
    (cols.length > MAX_ROWS ? ROW_H : 0);
}

// ── Exportación a PNG ─────────────────────────────────────────────────────────
export function downloadPng(svgEl: SVGSVGElement, name: string) {
  const { width: W, height: H } = svgEl.viewBox.baseVal;
  const scale = 2;

  // Clonar y estampar dimensiones explícitas para que el renderer use el viewBox completo
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(W));
  clone.setAttribute("height", String(H));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#EFF2F7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);

  const src = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, W, H);
    URL.revokeObjectURL(url);
    const a = document.createElement("a");
    a.download = `${name}-schema.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

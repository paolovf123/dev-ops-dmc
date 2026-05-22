import type { ColumnDefinition } from "../types";

/**
 * Returns a short Spanish error message if `value` is invalid for the column,
 * or null if it passes. Used both by DataGrid (red border on display) and by
 * CellEditor (red border while typing).
 */
export function validateCell(value: unknown, col: ColumnDefinition): string | null {
  const rules = col.rules || {};
  const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
  if (empty) return rules.required ? "Requerido" : null;

  if (col.data_type === "number" || col.data_type === "currency") {
    const n = parseFloat(String(value));
    if (isNaN(n)) return "Debe ser un número";
    if (rules.min !== undefined && n < rules.min) return `Mín: ${rules.min}`;
    if (rules.max !== undefined && n > rules.max) return `Máx: ${rules.max}`;
  }
  if (col.data_type === "percent") {
    const n = parseFloat(String(value));
    if (isNaN(n)) return "Debe ser un número";
    if (n < 0 || n > 100) return "0–100";
  }
  if (col.data_type === "rating") {
    const n = Number(value);
    const max = rules.max_rating ?? 5;
    if (!n || n < 1 || n > max) return `1–${max}`;
  }
  if (col.data_type === "enum") {
    const opts = rules.options ?? [];
    if (opts.length > 0 && !opts.includes(String(value))) return "Valor no válido";
  }
  if (col.data_type === "email") {
    if (!String(value).includes("@")) return "Email inválido";
  }
  if (col.data_type === "url") {
    if (!String(value).startsWith("http")) return "URL inválida";
  }
  return null;
}

import { useState, useEffect } from "react";
import type { ColumnDefinition } from "../types";

export type CondOperator = "gt" | "lt" | "between" | "eq" | "neq" | "contains" | "starts_with" | "is_empty" | "is_not_empty";

export interface CondRule {
  id: string;          // uuid
  fieldKey: string;    // column to apply to
  op: CondOperator;
  value: string;       // for between, comma-separated "min,max"
  background: string;  // hex
  color?: string;      // optional text color
  bold?: boolean;
}

const PRESET_COLORS: Array<{ bg: string; fg: string; label: string }> = [
  { bg: "#DCFCE7", fg: "#166534", label: "Verde" },
  { bg: "#FEF3C7", fg: "#92400E", label: "Amarillo" },
  { bg: "#FEE2E2", fg: "#991B1B", label: "Rojo" },
  { bg: "#DBEAFE", fg: "#1E40AF", label: "Azul" },
  { bg: "#F3E8FF", fg: "#6B21A8", label: "Violeta" },
  { bg: "#F1F5F9", fg: "#334155", label: "Gris" },
];

const OPS: Array<{ value: CondOperator; label: string; needsValue: boolean; needsTwo: boolean }> = [
  { value: "gt",          label: "Mayor que",          needsValue: true,  needsTwo: false },
  { value: "lt",          label: "Menor que",          needsValue: true,  needsTwo: false },
  { value: "between",     label: "Entre (min, max)",   needsValue: true,  needsTwo: true  },
  { value: "eq",          label: "Igual a",            needsValue: true,  needsTwo: false },
  { value: "neq",         label: "Distinto de",        needsValue: true,  needsTwo: false },
  { value: "contains",    label: "Contiene",           needsValue: true,  needsTwo: false },
  { value: "starts_with", label: "Empieza con",        needsValue: true,  needsTwo: false },
  { value: "is_empty",    label: "Está vacío",         needsValue: false, needsTwo: false },
  { value: "is_not_empty",label: "No está vacío",      needsValue: false, needsTwo: false },
];

interface Props {
  columns: ColumnDefinition[];
  rules: CondRule[];
  onChange: (rules: CondRule[]) => void;
  onClose: () => void;
}

export default function ConditionalFormattingModal({ columns, rules, onChange, onClose }: Props) {
  const [draft, setDraft] = useState<CondRule[]>(rules);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const editableCols = columns.filter((c) => c.data_type !== "relation");

  const addRule = () => {
    const firstCol = editableCols[0];
    if (!firstCol) return;
    setDraft((p) => [...p, {
      id: crypto.randomUUID(),
      fieldKey: firstCol.field_key,
      op: "gt",
      value: "0",
      background: PRESET_COLORS[0].bg,
      color: PRESET_COLORS[0].fg,
      bold: false,
    }]);
  };

  const updateRule = (id: string, patch: Partial<CondRule>) => {
    setDraft((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const removeRule = (id: string) => setDraft((p) => p.filter((r) => r.id !== id));

  const save = () => {
    onChange(draft);
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
      display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)", borderRadius: 8,
          padding: 20, width: 760, maxWidth: "95%", maxHeight: "85vh",
          overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}>🎨 Formato condicional</h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "2px 8px" }}>✕</button>
        </div>
        <p style={{ color: "var(--color-text-muted)", fontSize: 12, margin: "0 0 14px" }}>
          Pintá celdas según su valor. Las reglas se evalúan en orden — la primera que coincide gana.
        </p>

        {draft.length === 0 && (
          <div style={{
            padding: 24, textAlign: "center", color: "var(--color-text-muted)",
            border: "1px dashed var(--color-border)", borderRadius: 6, fontSize: 13,
          }}>
            Sin reglas. Agregá una abajo.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {draft.map((rule, idx) => {
            const opMeta = OPS.find((o) => o.value === rule.op)!;
            return (
              <div key={rule.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "30px 1.4fr 1.3fr 1.5fr 1fr 30px",
                  gap: 8, alignItems: "center",
                  padding: 10, border: "1px solid var(--color-border)",
                  borderRadius: 6, background: "var(--color-bg)",
                }}>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "center" }}>{idx + 1}</span>

                <select value={rule.fieldKey} onChange={(e) => updateRule(rule.id, { fieldKey: e.target.value })}
                  style={{ fontSize: 13 }}>
                  {editableCols.map((c) => (
                    <option key={c.field_key} value={c.field_key}>{c.name}</option>
                  ))}
                </select>

                <select value={rule.op} onChange={(e) => updateRule(rule.id, { op: e.target.value as CondOperator })}
                  style={{ fontSize: 13 }}>
                  {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                <input
                  disabled={!opMeta.needsValue}
                  value={rule.value}
                  placeholder={opMeta.needsTwo ? "min, max" : "valor"}
                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                  style={{ fontSize: 13, opacity: opMeta.needsValue ? 1 : 0.4 }}
                />

                {/* Color swatches */}
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
                  {PRESET_COLORS.map((c) => (
                    <button key={c.bg} type="button"
                      onClick={() => updateRule(rule.id, { background: c.bg, color: c.fg })}
                      title={c.label}
                      style={{
                        width: 22, height: 22, borderRadius: 4, cursor: "pointer",
                        background: c.bg,
                        border: rule.background === c.bg ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                      }}>
                      <span style={{ color: c.fg, fontSize: 11, fontWeight: 700 }}>A</span>
                    </button>
                  ))}
                  <label style={{ marginLeft: 4, fontSize: 11, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!rule.bold} onChange={(e) => updateRule(rule.id, { bold: e.target.checked })} />
                    B
                  </label>
                </div>

                <button onClick={() => removeRule(rule.id)} title="Eliminar regla"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pm-red-500)", fontSize: 16 }}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={addRule} disabled={editableCols.length === 0}>
            + Agregar regla
          </button>
        </div>

        <div style={{
          marginTop: 18, padding: 10, borderRadius: 6, fontSize: 11,
          background: "var(--color-bg)", color: "var(--color-text-muted)",
        }}>
          <strong>Tips:</strong> Para "Entre", usá <code>min, max</code> separados por coma (ej. <code>10, 50</code>).
          Las reglas se guardan por dataset en este navegador (localStorage).
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--color-border-light)" }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar reglas</button>
        </div>
      </div>
    </div>
  );
}

// ── Helper: evaluate a rule against a cell value ──────────────────────────────
export function evalRule(rule: CondRule, value: unknown): boolean {
  const strVal = value == null ? "" : String(value);

  if (rule.op === "is_empty") return strVal === "";
  if (rule.op === "is_not_empty") return strVal !== "";

  const ref = rule.value.trim();
  if (!ref) return false;

  const numVal = parseFloat(strVal);
  const numRef = parseFloat(ref);

  switch (rule.op) {
    case "gt": return !isNaN(numVal) && !isNaN(numRef) && numVal > numRef;
    case "lt": return !isNaN(numVal) && !isNaN(numRef) && numVal < numRef;
    case "between": {
      const [a, b] = ref.split(",").map((x) => parseFloat(x.trim()));
      if (isNaN(a) || isNaN(b) || isNaN(numVal)) return false;
      return numVal >= Math.min(a, b) && numVal <= Math.max(a, b);
    }
    case "eq":  return strVal.toLowerCase() === ref.toLowerCase();
    case "neq": return strVal !== "" && strVal.toLowerCase() !== ref.toLowerCase();
    case "contains":    return strVal.toLowerCase().includes(ref.toLowerCase());
    case "starts_with": return strVal.toLowerCase().startsWith(ref.toLowerCase());
    default: return false;
  }
}

export function styleForCell(rules: CondRule[], fieldKey: string, value: unknown): React.CSSProperties | undefined {
  const applicable = rules.filter((r) => r.fieldKey === fieldKey);
  for (const r of applicable) {
    if (evalRule(r, value)) {
      const style: React.CSSProperties = { background: r.background };
      if (r.color) style.color = r.color;
      if (r.bold)  style.fontWeight = 600;
      return style;
    }
  }
  return undefined;
}

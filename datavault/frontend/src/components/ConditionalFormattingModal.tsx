import { useState, useEffect } from "react";
import { Sparkles, X, Plus, Trash2, Check } from "lucide-react";
import { Btn, IconBtn, TONE } from "./ui/kit";
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

// Estilos compartidos de controles (selects / inputs) — token-driven, fieles al handoff.
const fieldBase: React.CSSProperties = {
  height: 34, borderRadius: "var(--r-2)", border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", outline: "none",
};
const selectStyle: React.CSSProperties = {
  ...fieldBase, padding: "0 8px", font: "500 12.5px var(--font-sans)",
};
const inputStyle: React.CSSProperties = {
  ...fieldBase, padding: "0 10px", font: "400 13px var(--font-mono)",
};

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

  const [iconFg, iconBg] = TONE.calc;

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: "var(--overlay)",
        backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)",
        display: "grid", placeItems: "center", padding: 24,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-4)", boxShadow: "var(--shadow-4)",
          animation: "ogPop var(--t-slow)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: "var(--r-2)", background: iconBg, color: iconFg, flex: "none" }}>
            <Sparkles size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>Formato condicional</div>
            <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3 }}>
              Pintá celdas según su valor — la primera regla que coincide gana.
            </div>
          </div>
          <IconBtn onClick={onClose} title="Cerrar" style={{ width: 32, height: 32, color: "var(--text-mute)" }}>
            <X size={18} />
          </IconBtn>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflow: "auto" }}>
          {draft.length === 0 && (
            <div style={{
              padding: 28, textAlign: "center", color: "var(--text-mute)",
              border: "1px dashed var(--border-strong)", borderRadius: "var(--r-3)",
              font: "500 13px var(--font-sans)",
            }}>
              Sin reglas. Agregá una abajo.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {draft.map((rule, idx) => {
              const opMeta = OPS.find((o) => o.value === rule.op)!;
              return (
                <div
                  key={rule.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "26px 1.3fr 1.3fr 1.4fr auto 28px",
                    gap: 8, alignItems: "center",
                    padding: "10px 12px", borderRadius: "var(--r-2)",
                    border: "1px solid var(--border)", background: "var(--surface-2)",
                  }}
                >
                  <span style={{ font: "600 11px var(--font-mono)", color: "var(--text-mute)", textAlign: "center" }}>{idx + 1}</span>

                  <select
                    value={rule.fieldKey}
                    onChange={(e) => updateRule(rule.id, { fieldKey: e.target.value })}
                    style={selectStyle}
                  >
                    {editableCols.map((c) => (
                      <option key={c.field_key} value={c.field_key}>{c.name}</option>
                    ))}
                  </select>

                  <select
                    value={rule.op}
                    onChange={(e) => updateRule(rule.id, { op: e.target.value as CondOperator })}
                    style={selectStyle}
                  >
                    {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>

                  <input
                    disabled={!opMeta.needsValue}
                    value={rule.value}
                    placeholder={opMeta.needsTwo ? "min, max" : "valor"}
                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                    style={{ ...inputStyle, opacity: opMeta.needsValue ? 1 : 0.45 }}
                  />

                  {/* Color swatches + bold */}
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {PRESET_COLORS.map((c) => {
                      const active = rule.background === c.bg;
                      return (
                        <button
                          key={c.bg}
                          type="button"
                          onClick={() => updateRule(rule.id, { background: c.bg, color: c.fg })}
                          title={c.label}
                          style={{
                            width: 24, height: 24, borderRadius: 6, cursor: "pointer",
                            background: c.bg, display: "grid", placeItems: "center",
                            border: active ? "2px solid var(--text)" : "2px solid transparent",
                            boxShadow: active ? "none" : "inset 0 0 0 1px var(--border)",
                            transition: "all var(--t-fast)",
                          }}
                        >
                          <span style={{ color: c.fg, font: "700 11px var(--font-sans)" }}>A</span>
                        </button>
                      );
                    })}
                    <label
                      title="Negrita"
                      style={{
                        marginLeft: 4, width: 24, height: 24, borderRadius: 6, cursor: "pointer",
                        display: "grid", placeItems: "center",
                        background: rule.bold ? "var(--pri-soft)" : "var(--surface)",
                        color: rule.bold ? "var(--accent-pri)" : "var(--text-mute)",
                        border: `1px solid ${rule.bold ? "var(--accent-pri)" : "var(--border)"}`,
                        font: "700 12px var(--font-sans)", transition: "all var(--t-fast)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!rule.bold}
                        onChange={(e) => updateRule(rule.id, { bold: e.target.checked })}
                        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
                      />
                      B
                    </label>
                  </div>

                  <IconBtn onClick={() => removeRule(rule.id)} title="Eliminar regla" style={{ width: 28, height: 28, color: "var(--text-mute)" }}>
                    <Trash2 size={15} />
                  </IconBtn>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addRule}
            disabled={editableCols.length === 0}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14,
              border: "none", background: "transparent",
              cursor: editableCols.length === 0 ? "not-allowed" : "pointer",
              opacity: editableCols.length === 0 ? 0.5 : 1,
              color: "var(--accent-pri)", font: "600 12.5px var(--font-sans)",
            }}
          >
            <Plus size={14} /> Agregar regla
          </button>

          {/* Tips */}
          <div style={{
            marginTop: 18, padding: "10px 12px", borderRadius: "var(--r-2)",
            background: "var(--surface-alt)", color: "var(--text-soft)",
            font: "400 11.5px/1.5 var(--font-sans)",
          }}>
            <strong style={{ color: "var(--text)" }}>Tips:</strong> Para "Entre", usá{" "}
            <span className="mono" style={{ font: "500 11px var(--font-mono)" }}>min, max</span>{" "}
            separados por coma (ej.{" "}
            <span className="mono" style={{ font: "500 11px var(--font-mono)" }}>10, 50</span>).{" "}
            Las reglas se guardan por dataset en este navegador (localStorage).
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" icon={<Check size={16} />} onClick={save}>Guardar reglas</Btn>
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

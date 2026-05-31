import { useState, useMemo, useEffect } from "react";
import { Search, X, Check, ArrowRight } from "lucide-react";
import type { ColumnDefinition, Record as DRecord } from "../types";
import { Btn } from "./ui/kit";

interface Match {
  recordId: string;
  fieldKey: string;
  oldValue: string;
  newValue: string;
}

interface Props {
  columns: ColumnDefinition[];
  records: DRecord[];
  onApply: (recordId: string, fieldKey: string, newValue: string) => void;
  onClose: () => void;
}

// ── estilos compartidos (frame del handoff) ───────────────────────────────────
const fieldLabel: React.CSSProperties = {
  font: "500 12.5px/1 var(--font-sans)", color: "var(--text-soft)", marginBottom: 6, display: "block",
};
const fieldInput: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 11px", borderRadius: "var(--r-2)",
  border: "1px solid var(--border)", background: "var(--surface)",
  font: "400 13.5px/1 var(--font-mono)", color: "var(--text)", outline: "none",
};

export default function SearchReplaceModal({ columns, records, onApply, onClose }: Props) {
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeCell, setWholeCell] = useState(false);
  const [scopeKey, setScopeKey] = useState<string>(""); // "" = all columns
  const [feedback, setFeedback] = useState<string>("");

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Editable cols (skip relation that is FK-only)
  const editableCols = useMemo(
    () => columns.filter((c) => c.data_type !== "relation"),
    [columns]
  );

  // Compute matches (live preview)
  const matches: Match[] = useMemo(() => {
    if (!find) return [];
    const result: Match[] = [];
    const cmpFind = caseSensitive ? find : find.toLowerCase();
    const targetCols = scopeKey ? editableCols.filter((c) => c.field_key === scopeKey) : editableCols;
    for (const rec of records) {
      if (rec.deleted_at) continue;
      for (const col of targetCols) {
        const raw = rec.data[col.field_key];
        if (raw == null) continue;
        const oldStr = String(raw);
        const oldCmp = caseSensitive ? oldStr : oldStr.toLowerCase();
        let newStr = oldStr;
        let hit = false;
        if (wholeCell) {
          if (oldCmp === cmpFind) { newStr = repl; hit = true; }
        } else {
          if (oldCmp.includes(cmpFind)) {
            if (caseSensitive) {
              newStr = oldStr.split(find).join(repl);
            } else {
              // Case-insensitive global replace
              const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
              newStr = oldStr.replace(re, repl);
            }
            hit = newStr !== oldStr || repl === "";
          }
        }
        if (hit) result.push({ recordId: rec.id, fieldKey: col.field_key, oldValue: oldStr, newValue: newStr });
      }
    }
    return result;
  }, [find, repl, caseSensitive, wholeCell, scopeKey, records, editableCols]);

  const applyAll = () => {
    if (matches.length === 0) return;
    for (const m of matches) onApply(m.recordId, m.fieldKey, m.newValue);
    setFeedback(`${matches.length} celda${matches.length !== 1 ? "s" : ""} reemplazada${matches.length !== 1 ? "s" : ""}.`);
    // matches list will refresh automatically on next render once records prop updates
  };

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "var(--overlay)",
        backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)",
        display: "grid", placeItems: "center", padding: 24, animation: "ogFade var(--t-mid)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 500, maxHeight: "90vh", display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-4)",
          boxShadow: "var(--shadow-4)", animation: "ogPop var(--t-slow)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{
            display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: "var(--r-2)",
            background: "var(--pri-soft)", color: "var(--accent-pri)", flex: "none",
          }}>
            <Search size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>Buscar y reemplazar</div>
            <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3 }}>
              En toda la tabla o una columna
            </div>
          </div>
          <button
            onClick={onClose}
            className="og-iconbtn"
            style={{ width: 32, height: 32, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", color: "var(--text-mute)" }}
            title="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <span style={fieldLabel}>Buscar</span>
            <input
              autoFocus placeholder="Texto a buscar" style={fieldInput}
              value={find} onChange={(e) => { setFind(e.target.value); setFeedback(""); }}
            />
          </label>

          <label style={{ display: "block" }}>
            <span style={fieldLabel}>Reemplazar con</span>
            <input
              placeholder="Nuevo valor (puede estar vacío)" style={fieldInput}
              value={repl} onChange={(e) => { setRepl(e.target.value); setFeedback(""); }}
            />
          </label>

          {/* Opciones de coincidencia */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", font: "400 12.5px var(--font-sans)", color: "var(--text-soft)" }}>
              <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} style={{ accentColor: "var(--accent-pri)" }} />
              Distinguir mayús/minús
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", font: "400 12.5px var(--font-sans)", color: "var(--text-soft)" }}>
              <input type="checkbox" checked={wholeCell} onChange={(e) => setWholeCell(e.target.checked)} style={{ accentColor: "var(--accent-pri)" }} />
              Coincidir celda completa
            </label>
          </div>

          {/* Ámbito (segmentos seleccionables) */}
          <div>
            <div style={fieldLabel}>Ámbito</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[{ key: "", label: "Toda la tabla" }, ...editableCols.map((c) => ({ key: c.field_key, label: `Columna: ${c.name}` }))].map((o) => {
                const on = scopeKey === o.key;
                return (
                  <button
                    key={o.key || "__all__"}
                    type="button"
                    onClick={() => setScopeKey(o.key)}
                    style={{
                      flex: "1 1 auto", minWidth: 0, textAlign: "center", cursor: "pointer",
                      font: "600 12.5px var(--font-sans)", padding: "9px 11px", borderRadius: "var(--r-2)",
                      border: `1px solid ${on ? "var(--accent-pri)" : "var(--border)"}`,
                      background: on ? "var(--pri-soft)" : "var(--surface)",
                      color: on ? "var(--accent-pri)" : "var(--text-soft)",
                      transition: "all var(--t-fast)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview de coincidencias */}
          <div style={{
            padding: 12, borderRadius: "var(--r-2)",
            background: "var(--surface-alt)", border: "1px solid var(--border)",
            maxHeight: 200, overflowY: "auto",
          }}>
            {!find ? (
              <span style={{ font: "400 12.5px var(--font-sans)", color: "var(--text-mute)" }}>
                Escribí en "Buscar" para ver coincidencias.
              </span>
            ) : matches.length === 0 ? (
              <span style={{ font: "400 12.5px var(--font-sans)", color: "var(--text-mute)" }}>Sin coincidencias.</span>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, font: "400 12.5px var(--font-sans)", color: "var(--text-soft)" }}>
                  <Check size={14} color="var(--success)" />
                  <strong className="mono" style={{ color: "var(--text)" }}>{matches.length}</strong>
                  coincidencia{matches.length !== 1 ? "s" : ""}
                  {scopeKey && (() => {
                    const sc = columns.find((c) => c.field_key === scopeKey);
                    return sc ? <>en la columna {sc.name}</> : null;
                  })()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {matches.slice(0, 8).map((m, i) => {
                    const col = columns.find((c) => c.field_key === m.fieldKey);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ font: "500 11.5px var(--font-sans)", color: "var(--text-mute)" }}>
                          {col?.name ?? m.fieldKey}:
                        </span>
                        <span className="mono" style={{
                          font: "500 11.5px var(--font-mono)", padding: "2px 6px", borderRadius: 5,
                          background: "var(--danger-soft)", color: "var(--danger)",
                        }}>
                          {m.oldValue}
                        </span>
                        <ArrowRight size={13} color="var(--text-mute)" />
                        <span className="mono" style={{
                          font: "500 11.5px var(--font-mono)", padding: "2px 6px", borderRadius: 5,
                          background: "var(--success-soft)", color: "var(--success)",
                        }}>
                          {m.newValue || "(vacío)"}
                        </span>
                      </div>
                    );
                  })}
                  {matches.length > 8 && (
                    <div style={{ font: "400 11.5px var(--font-sans)", fontStyle: "italic", color: "var(--text-mute)", marginTop: 2 }}>
                      …y {matches.length - 8} más
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {feedback && (
            <div style={{
              display: "flex", alignItems: "center", gap: 7, padding: "8px 11px", borderRadius: "var(--r-2)",
              background: "var(--success-soft)", color: "var(--success)",
              border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
              font: "600 12.5px var(--font-sans)",
            }}>
              <Check size={14} /> {feedback}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
          <Btn variant="primary" icon={<Check size={15} />} disabled={matches.length === 0} onClick={applyAll}>
            Reemplazar todo ({matches.length})
          </Btn>
        </div>
      </div>
    </div>
  );
}

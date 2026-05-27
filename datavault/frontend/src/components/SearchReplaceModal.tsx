import { useState, useMemo, useEffect } from "react";
import type { ColumnDefinition, Record as DRecord } from "../types";

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
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
      display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80,
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)", borderRadius: 8,
          padding: 20, width: 560, maxWidth: "95%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Buscar y reemplazar</h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "2px 8px" }}>✕</button>
        </div>

        <div className="form-group">
          <label className="form-label">Buscar</label>
          <input autoFocus placeholder="Texto a buscar"
            value={find} onChange={(e) => { setFind(e.target.value); setFeedback(""); }} />
        </div>

        <div className="form-group" style={{ marginTop: 10 }}>
          <label className="form-label">Reemplazar con</label>
          <input placeholder="Nuevo valor (puede estar vacío)"
            value={repl} onChange={(e) => { setRepl(e.target.value); setFeedback(""); }} />
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
          <label className="checkbox-row" style={{ gap: 5 }}>
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
            <span style={{ fontSize: 12 }}>Distinguir mayús/minús</span>
          </label>
          <label className="checkbox-row" style={{ gap: 5 }}>
            <input type="checkbox" checked={wholeCell} onChange={(e) => setWholeCell(e.target.checked)} />
            <span style={{ fontSize: 12 }}>Coincidir celda completa</span>
          </label>
        </div>

        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label">Ámbito</label>
          <select value={scopeKey} onChange={(e) => setScopeKey(e.target.value)}>
            <option value="">Toda la tabla</option>
            {editableCols.map((c) => (
              <option key={c.field_key} value={c.field_key}>Solo columna: {c.name}</option>
            ))}
          </select>
        </div>

        {/* Preview */}
        <div style={{
          marginTop: 14, padding: 10, borderRadius: 6,
          background: "var(--color-bg)", border: "1px solid var(--color-border-light)",
          maxHeight: 180, overflowY: "auto", fontSize: 12,
        }}>
          {!find ? (
            <span style={{ color: "var(--color-text-muted)" }}>Escribí en "Buscar" para ver coincidencias.</span>
          ) : matches.length === 0 ? (
            <span style={{ color: "var(--color-text-muted)" }}>Sin coincidencias.</span>
          ) : (
            <>
              <div style={{ fontWeight: 600, color: "var(--color-primary)", marginBottom: 6 }}>
                {matches.length} coincidencia{matches.length !== 1 ? "s" : ""}
              </div>
              {matches.slice(0, 8).map((m, i) => {
                const col = columns.find((c) => c.field_key === m.fieldKey);
                return (
                  <div key={i} style={{ marginBottom: 4, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    <span style={{ color: "var(--color-text-muted)" }}>{col?.name ?? m.fieldKey}: </span>
                    <span style={{ background: "#FEE2E2", color: "#991B1B", padding: "0 3px", borderRadius: 2 }}>{m.oldValue}</span>
                    <span style={{ margin: "0 5px", color: "var(--color-text-muted)" }}>→</span>
                    <span style={{ background: "#DCFCE7", color: "#166534", padding: "0 3px", borderRadius: 2 }}>{m.newValue}</span>
                  </div>
                );
              })}
              {matches.length > 8 && (
                <div style={{ color: "var(--color-text-muted)", fontStyle: "italic", marginTop: 4 }}>
                  …y {matches.length - 8} más
                </div>
              )}
            </>
          )}
        </div>

        {feedback && (
          <div style={{
            marginTop: 10, padding: "6px 10px", borderRadius: 4, fontSize: 12,
            background: "var(--color-primary-bg)", color: "var(--pm-green-600)",
            border: "1px solid var(--color-primary-border)", fontWeight: 600,
          }}>
            ✓ {feedback}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--color-border-light)" }}>
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" disabled={matches.length === 0} onClick={applyAll}>
            Reemplazar todo ({matches.length})
          </button>
        </div>
      </div>
    </div>
  );
}

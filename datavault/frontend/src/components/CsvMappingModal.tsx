import { useState } from "react";
import type { ColumnDefinition } from "../types";
import { parseCsv } from "../utils/csvImport";
import { useEscapeKey } from "../utils/useEscapeKey";

interface Props {
  file: File;
  columns: ColumnDefinition[];
  onConfirm: (mapping: Record<string, string>, rows: Record<string, string>[]) => void;
  onClose: () => void;
}

const TYPE_COLORS: Record<ColumnDefinition["data_type"], string> = {
  text: "#64748B", number: "#2563EB", date: "#7C3AED", enum: "#D97706", boolean: "#10B981", relation: "#64748B",
  url: "#0EA5E9", email: "#0EA5E9", phone: "#0EA5E9", long_text: "#64748B",
  multiselect: "#D97706", rating: "#F59E0B", currency: "#10B981", percent: "#10B981",
};

export default function CsvMappingModal({ file, columns, onConfirm, onClose }: Props) {
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  useEscapeKey(onClose);

  if (!parsed && !loading) {
    setLoading(true);
    file.text().then((text) => {
      const result = parseCsv(text);
      const autoMap: Record<string, string> = {};
      result.headers.forEach((h) => {
        const norm = h.toLowerCase().trim();
        const match = columns.find(
          (c) => c.name.toLowerCase() === norm || c.field_key === norm
        );
        if (match) autoMap[h] = match.field_key;
      });
      setMapping(autoMap);
      setParsed(result);
      setLoading(false);
    });
  }

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const preview = parsed?.rows.slice(0, 3) ?? [];
  const autoMapped = Object.values(mapping).filter(Boolean).length;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-v2" style={{ maxWidth: 680, width: "100%" }}>
        <div className="modal-accent" style={{ background: "linear-gradient(90deg, #0EA5E9, #0EA5E9)" }} />

        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="modal-header-icon" style={{ background: "#E0F2FE", color: "#0EA5E9", fontSize: 18 }}>
              ⬆
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Importar CSV</h3>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-text-muted)" }}>
                {file.name}
                {parsed && <> · <strong style={{ color: "var(--color-text-secondary)" }}>{parsed.rows.length}</strong> filas detectadas</>}
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Cerrar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>

        {loading || !parsed ? (
          <div style={{ padding: "48px 32px", textAlign: "center" }}>
            <div className="csv-loading-spinner" />
            <p style={{ marginTop: 14, color: "var(--color-text-muted)", fontSize: 13 }}>Leyendo archivo…</p>
          </div>
        ) : (
          <>
            <div className="modal-body" style={{ padding: 0 }}>
              {autoMapped > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 20px", background: "var(--pm-green-50)",
                  borderBottom: "1px solid var(--color-primary-border)" }}>
                  <span style={{ fontSize: 14 }}>✅</span>
                  <span style={{ fontSize: 12.5, color: "var(--pm-green-600)" }}>
                    <strong>{autoMapped}</strong> columna{autoMapped !== 1 ? "s" : ""} mapeada{autoMapped !== 1 ? "s" : ""} automáticamente
                  </span>
                </div>
              )}

              <div style={{ overflowY: "auto", maxHeight: 340 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["Columna en el CSV", "→ Columna del dataset", "Vista previa"].map((h) => (
                        <th key={h} style={{
                          textAlign: "left", padding: "10px 16px",
                          background: "var(--color-bg)",
                          borderBottom: "2px solid var(--color-border)",
                          fontWeight: 700, fontSize: 10.5,
                          textTransform: "uppercase", letterSpacing: "0.6px",
                          color: "var(--color-text-muted)",
                          position: "sticky", top: 0, zIndex: 1,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.headers.map((h, idx) => {
                      const mapped = !!mapping[h];
                      const targetCol = columns.find((c) => c.field_key === mapping[h]);
                      return (
                        <tr key={h} style={{
                          borderBottom: "1px solid var(--color-border-light)",
                          background: idx % 2 === 0 ? "var(--color-surface)" : "#FAFBFC",
                        }}>
                          <td style={{ padding: "9px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{
                                display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                                background: mapped ? "var(--pm-green-500)" : "var(--color-border)",
                                flexShrink: 0,
                              }} />
                              <code style={{
                                fontFamily: "var(--font-mono)", fontSize: 12,
                                background: "var(--color-border-light)",
                                padding: "2px 7px", borderRadius: 4,
                                color: "var(--color-text-secondary)",
                              }}>{h}</code>
                            </div>
                          </td>
                          <td style={{ padding: "7px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <select
                                value={mapping[h] ?? ""}
                                onChange={(e) => setMapping((p) => ({ ...p, [h]: e.target.value }))}
                                style={{
                                  flex: 1, fontSize: 12.5,
                                  borderColor: mapped ? "var(--color-primary-border)" : undefined,
                                  background: mapped ? "var(--pm-green-50)" : undefined,
                                }}>
                                <option value="">— ignorar —</option>
                                {columns.map((c) => (
                                  <option key={c.field_key} value={c.field_key}>{c.name}</option>
                                ))}
                              </select>
                              {targetCol && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700,
                                  padding: "2px 6px", borderRadius: 99, flexShrink: 0,
                                  color: TYPE_COLORS[targetCol.data_type],
                                  background: TYPE_COLORS[targetCol.data_type] + "15",
                                  border: `1px solid ${TYPE_COLORS[targetCol.data_type]}30`,
                                }}>{targetCol.data_type}</span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "9px 16px", color: "var(--color-text-muted)", fontSize: 12, maxWidth: 160 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                              {preview.map((r) => r[h]).filter(Boolean).slice(0, 2).join(", ") || <em>sin datos</em>}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary bar */}
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 20px", background: "var(--color-bg)",
                borderTop: "1px solid var(--color-border-light)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "var(--color-text)" }}>{mappedCount}</span>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    / {parsed.headers.length} columnas mapeadas
                  </span>
                </div>
                <div style={{ width: 1, height: 16, background: "var(--color-border)" }} />
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  <strong style={{ color: "var(--color-text)" }}>{parsed.rows.length}</strong> filas a importar
                </span>
                {mappedCount === 0 && (
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--pm-orange-600)",
                    background: "var(--pm-orange-50)", padding: "3px 10px",
                    borderRadius: 99, border: "1px solid #FDE68A" }}>
                    Mapea al menos una columna para continuar
                  </span>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" disabled={mappedCount === 0}
                onClick={() => onConfirm(mapping, parsed.rows)}>
                Importar {parsed.rows.length} filas
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

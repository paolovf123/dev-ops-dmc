import { useState } from "react";
import { Upload, Check, X, ArrowRight, AlertTriangle } from "lucide-react";
import type { ColumnDefinition } from "../types";
import { parseCsv } from "../utils/csvImport";
import { useEscapeKey } from "../utils/useEscapeKey";
import { Btn, TONE, type Tone } from "./ui/kit";

interface Props {
  file: File;
  columns: ColumnDefinition[];
  onConfirm: (mapping: Record<string, string>, rows: Record<string, string>[]) => void;
  onClose: () => void;
}

// data_type → tono semántico (sin hex, salvo el frame de tokens del kit)
const TYPE_TONE: Record<ColumnDefinition["data_type"], Tone> = {
  text: "neutral", long_text: "neutral",
  number: "primary", currency: "success", percent: "success", rating: "warn",
  date: "violet",
  enum: "warn", multiselect: "warn",
  boolean: "success",
  relation: "rel",
  url: "primary", email: "primary", phone: "primary",
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

  const [pri, priSoft] = TONE.primary;

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "var(--overlay)",
        backdropFilter: "blur(5px)", display: "grid", placeItems: "center", padding: 24,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 680, maxHeight: "90vh", display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-4)",
          boxShadow: "var(--shadow-4)", overflow: "hidden", animation: "ogPop var(--t-slow)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: "var(--r-2)", background: priSoft, color: pri, flex: "none" }}>
            <Upload size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>Mapear columnas del CSV</div>
            <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span className="mono">{file.name}</span>
              {parsed && (
                <> · <strong style={{ color: "var(--text)" }}>{parsed.headers.length}</strong> columnas · <strong style={{ color: "var(--text)" }}>{parsed.rows.length}</strong> filas</>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="og-iconbtn"
            title="Cerrar"
            style={{ width: 32, height: 32, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", color: "var(--text-mute)", flex: "none" }}
          >
            <X size={18} />
          </button>
        </div>

        {loading || !parsed ? (
          <div style={{ padding: "56px 32px", textAlign: "center" }}>
            <div className="csv-loading-spinner" style={{ margin: "0 auto" }} />
            <p style={{ marginTop: 16, color: "var(--text-soft)", font: "400 13.5px/1 var(--font-sans)" }}>Leyendo archivo…</p>
          </div>
        ) : (
          <>
            <div style={{ padding: 20, overflow: "auto" }}>
              {/* Aviso auto-mapeo */}
              {autoMapped > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
                  padding: "9px 12px", borderRadius: "var(--r-2)",
                  background: "var(--success-soft)", border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
                  color: "var(--success)", font: "500 12.5px/1.3 var(--font-sans)",
                }}>
                  <Check size={15} style={{ flex: "none" }} />
                  <span>
                    <strong>{autoMapped}</strong> columna{autoMapped !== 1 ? "s" : ""} mapeada{autoMapped !== 1 ? "s" : ""} automáticamente
                  </span>
                </div>
              )}

              {/* Tabla de mapeo */}
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-2)", overflow: "hidden" }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 26px minmax(0, 1.1fr)",
                  alignItems: "center", padding: "9px 12px",
                  background: "var(--surface-2)", borderBottom: "1px solid var(--border)",
                  font: "600 11.5px/1 var(--font-sans)", color: "var(--text-mute)",
                  textTransform: "uppercase", letterSpacing: ".04em",
                }}>
                  <span>Columna del CSV</span>
                  <span />
                  <span>Campo del dataset</span>
                </div>

                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  {parsed.headers.map((h, idx) => {
                    const mapped = !!mapping[h];
                    const targetCol = columns.find((c) => c.field_key === mapping[h]);
                    const [tfg, tbg] = targetCol ? TONE[TYPE_TONE[targetCol.data_type]] : TONE.neutral;
                    const sample = preview.map((r) => r[h]).filter(Boolean).slice(0, 2).join(", ");
                    return (
                      <div
                        key={h}
                        style={{
                          display: "grid", gridTemplateColumns: "1fr 26px minmax(0, 1.1fr)",
                          alignItems: "center", gap: 4, padding: "9px 12px",
                          borderBottom: idx < parsed.headers.length - 1 ? "1px solid var(--border)" : "none",
                          opacity: mapped ? 1 : 0.62,
                        }}
                      >
                        {/* Columna CSV */}
                        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                          <span style={{
                            width: 7, height: 7, borderRadius: "var(--r-pill)", flex: "none",
                            background: mapped ? "var(--success)" : "var(--border-strong)",
                          }} />
                          <code className="mono" style={{
                            font: "500 12.5px/1 var(--font-mono)", color: "var(--text)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{h}</code>
                        </div>

                        <ArrowRight size={14} color="var(--text-mute)" style={{ justifySelf: "center" }} />

                        {/* Campo destino: select + chip de tipo + preview */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                            <select
                              value={mapping[h] ?? ""}
                              onChange={(e) => setMapping((p) => ({ ...p, [h]: e.target.value }))}
                              style={{
                                flex: 1, minWidth: 0, height: 34, padding: "0 10px",
                                borderRadius: "var(--r-2)", outline: "none",
                                font: "500 12.5px/1 var(--font-sans)",
                                color: mapped ? "var(--text)" : "var(--text-mute)",
                                border: `1px solid ${mapped ? "color-mix(in srgb, var(--success) 40%, transparent)" : "var(--border)"}`,
                                background: mapped ? "var(--success-soft)" : "var(--surface)",
                              }}
                            >
                              <option value="">— ignorar —</option>
                              {columns.map((c) => (
                                <option key={c.field_key} value={c.field_key}>{c.name}</option>
                              ))}
                            </select>
                            {targetCol && (
                              <span className="mono" style={{
                                font: "600 10px/1 var(--font-mono)", flex: "none",
                                padding: "3px 7px", borderRadius: "var(--r-pill)",
                                color: tfg, background: tbg,
                                border: `1px solid color-mix(in srgb, ${tfg} 30%, transparent)`,
                              }}>{targetCol.data_type}</span>
                            )}
                          </div>
                          <span style={{
                            font: "400 11.5px/1.3 var(--font-sans)", color: "var(--text-mute)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {sample ? sample : <em>sin datos</em>}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Resumen X/Y mapeadas + Z filas */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 12px", background: "var(--surface-2)", borderTop: "1px solid var(--border)",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ font: "800 17px/1 var(--font-sans)", color: "var(--text)" }}>{mappedCount}</span>
                    <span style={{ font: "400 12px/1 var(--font-sans)", color: "var(--text-soft)" }}>
                      / {parsed.headers.length} columnas mapeadas
                    </span>
                  </div>
                  <span style={{ width: 1, height: 16, background: "var(--border)" }} />
                  <span style={{ font: "400 12px/1 var(--font-sans)", color: "var(--text-soft)" }}>
                    <strong style={{ color: "var(--text)" }}>{parsed.rows.length}</strong> filas a importar
                  </span>
                  {mappedCount === 0 && (
                    <span style={{
                      marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6,
                      font: "500 11.5px/1 var(--font-sans)", color: "var(--warning)",
                      background: "var(--warning-soft)", padding: "4px 10px", borderRadius: "var(--r-pill)",
                      border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
                    }}>
                      <AlertTriangle size={13} /> Mapea al menos una columna
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
              <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
              <Btn
                variant="primary"
                icon={<Check size={16} />}
                disabled={mappedCount === 0}
                onClick={() => onConfirm(mapping, parsed.rows)}
              >
                Importar {parsed.rows.length} filas
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

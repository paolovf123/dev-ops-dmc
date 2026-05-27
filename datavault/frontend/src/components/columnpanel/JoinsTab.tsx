import type { Dispatch, SetStateAction } from "react";
import type { ColumnDefinition, JoinedColDef, Dataset } from "../../types";
import type { DetectedLink } from "./links";

interface Props {
  joinedCols: JoinedColDef[];
  onRemoveJoin: (uid: string) => void;
  columns: ColumnDefinition[];
  srcColumns: ColumnDefinition[];
  otherDatasets: Dataset[];
  selectedDsId: string;
  setSelectedDsId: (v: string) => void;
  selectedDsName: string;
  dsFilter: string;
  setDsFilter: (v: string) => void;
  autoDetectAll: DetectedLink[];
  selectedLinkIdx: number;
  setSelectedLinkIdx: (v: number) => void;
  showOverride: boolean;
  setShowOverride: (v: boolean) => void;
  overrideLocalKey: string;
  setOverrideLocalKey: (v: string) => void;
  overrideSrcKey: string;
  setOverrideSrcKey: (v: string) => void;
  joinColFilter: string;
  setJoinColFilter: (v: string) => void;
  pickableSrcCols: ColumnDefinition[];
  filteredSrcCols: ColumnDefinition[];
  selectedDisplayKeys: Set<string>;
  setSelectedDisplayKeys: Dispatch<SetStateAction<Set<string>>>;
  toggleDisplayKey: (key: string) => void;
  justAdded: number;
  canAddJoin: boolean;
  handleAddJoin: () => void;
}

/** Tab "Vínculos": gestiona joins activos y el asistente para agregar nuevos. */
export default function JoinsTab(p: Props) {
  const resetPicker = () => {
    p.setSelectedDisplayKeys(new Set());
    p.setOverrideLocalKey("");
    p.setOverrideSrcKey("");
    p.setShowOverride(false);
    p.setSelectedLinkIdx(0);
  };

  return (
    <>
      {p.joinedCols.length > 0 && (
        <>
          <div className="panel-section"><span className="panel-section-label">Activas</span></div>
          {p.joinedCols.map((j) => (
            <div key={j.uid} className="joined-tag">
              <span className="joined-tag-name">
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {j.sourceDatasetName} › {j.displayName}
                </span>
              </span>
              <button className="btn btn-danger-ghost" onClick={() => p.onRemoveJoin(j.uid)}
                style={{ padding: "2px 6px", fontSize: 13, flexShrink: 0 }}>×</button>
            </div>
          ))}
          <div className="panel-divider" />
        </>
      )}

      <div className="panel-section"><span className="panel-section-label">Agregar vínculo</span></div>
      <div className="panel-form">
        {/* Dataset picker con filtro */}
        <div className="panel-form-row">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span className="panel-form-label" style={{ margin: 0 }}>Dataset origen</span>
            {p.selectedDsId && (
              <button
                onClick={() => { p.setSelectedDsId(""); p.setDsFilter(""); resetPicker(); }}
                style={{ background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, color: "var(--color-text-muted)", padding: 0, textDecoration: "underline" }}>
                Cambiar
              </button>
            )}
          </div>
          {p.selectedDsId ? (
            <div style={{
              padding: "7px 10px", border: "1px solid var(--color-border)",
              borderRadius: 6, background: "var(--color-bg)",
              fontSize: 13, fontWeight: 600,
            }}>
              {p.selectedDsName}
            </div>
          ) : (() => {
            const q = p.dsFilter.trim().toLowerCase();
            const filteredDs = q
              ? p.otherDatasets.filter(d => d.name.toLowerCase().includes(q))
              : p.otherDatasets;
            return (
              <>
                <input
                  type="text"
                  placeholder="Buscar dataset…"
                  value={p.dsFilter}
                  onChange={(e) => p.setDsFilter(e.target.value)}
                  style={{
                    width: "100%", fontSize: 12, padding: "5px 9px",
                    border: "1px solid var(--color-border)", borderRadius: 6,
                    marginBottom: 4,
                  }}
                />
                <div style={{
                  maxHeight: 220, overflowY: "auto",
                  border: "1px solid var(--color-border)", borderRadius: 6,
                  background: "var(--color-surface)",
                }}>
                  {filteredDs.length === 0 && (
                    <p style={{ padding: "10px 12px", fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
                      {p.otherDatasets.length === 0 ? "No hay otros datasets" : `Sin resultados para "${p.dsFilter}"`}
                    </p>
                  )}
                  {filteredDs.map(d => (
                    <button
                      key={d.id}
                      onClick={() => { p.setSelectedDsId(d.id); resetPicker(); }}
                      style={{
                        width: "100%", textAlign: "left", background: "none", border: "none",
                        padding: "7px 12px", fontSize: 13, cursor: "pointer",
                        borderBottom: "1px solid var(--color-border-light)",
                        color: "var(--color-text)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              </>
            );
          })()}
        </div>

        {p.selectedDsId && p.srcColumns.length > 0 && (
          <>
            {p.autoDetectAll.length > 0 && !p.showOverride ? (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "var(--pm-green-600)", marginBottom: 6, fontWeight: 600 }}>
                  ✓ {p.autoDetectAll.length} vínculo{p.autoDetectAll.length !== 1 ? "s" : ""} detectado{p.autoDetectAll.length !== 1 ? "s" : ""}
                  {p.autoDetectAll.length > 1 && (
                    <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}> — elige uno</span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {p.autoDetectAll.map((link, i) => {
                    const checked = i === p.selectedLinkIdx;
                    return (
                      <div
                        key={i}
                        onClick={() => p.setSelectedLinkIdx(i)}
                        style={{
                          padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                          background: checked ? "var(--pm-green-50)" : "var(--color-bg)",
                          border: `1.5px solid ${checked ? "var(--pm-green-500, #16A34A)" : "var(--color-border)"}`,
                          transition: "all 0.12s",
                        }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{
                            display: "inline-block", width: 14, height: 14, borderRadius: "50%",
                            border: `2px solid ${checked ? "var(--pm-green-500, #16A34A)" : "var(--color-border)"}`,
                            background: checked ? "var(--pm-green-500, #16A34A)" : "transparent",
                            boxShadow: checked ? "inset 0 0 0 2px #fff" : "none",
                            flexShrink: 0,
                          }} />
                          <div style={{
                            flex: 1, minWidth: 0,
                            fontSize: 12, fontWeight: checked ? 700 : 500,
                            color: "var(--color-text)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {link.label}
                          </div>
                          {link.confirmed && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                              background: "var(--pm-green-100)", color: "var(--pm-green-600)",
                              flexShrink: 0, textTransform: "uppercase",
                            }}>ok</span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 10.5, color: "var(--color-text-muted)",
                          paddingLeft: 20, lineHeight: 1.4,
                          wordBreak: "break-word",
                        }}>
                          <code style={{ background: "var(--color-surface)", padding: "0 4px", borderRadius: 3,
                            border: "1px solid var(--color-border-light)" }}>
                            {link.localKey === "__id__" ? "id (aquí)" : link.localKey}
                          </code>
                          <span style={{ margin: "0 4px" }}>↔</span>
                          <code style={{ background: "var(--color-surface)", padding: "0 4px", borderRadius: 3,
                            border: "1px solid var(--color-border-light)" }}>
                            {link.srcKey === "__id__" ? "id (destino)" : link.srcKey}
                          </code>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => p.setShowOverride(true)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11,
                    color: "var(--color-text-muted)", marginTop: 8, padding: 0, textDecoration: "underline" }}>
                  Configurar manualmente
                </button>
              </div>
            ) : (
              <>
                {p.autoDetectAll.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--pm-red-500)", marginBottom: 8,
                    background: "var(--pm-red-50)", padding: "6px 8px", borderRadius: "var(--radius-sm)" }}>
                    No se detectó vínculo. Selecciona las claves manualmente.
                  </div>
                )}
                <div className="panel-form-row">
                  <span className="panel-form-label">Clave local</span>
                  <select value={p.overrideLocalKey} onChange={(e) => p.setOverrideLocalKey(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    <option value="__id__">(ID del registro)</option>
                    {p.columns.map((c) => <option key={c.id} value={c.field_key}>{c.name}</option>)}
                  </select>
                </div>
                <div className="panel-form-row">
                  <span className="panel-form-label">Clave en "{p.selectedDsName}"</span>
                  <select value={p.overrideSrcKey} onChange={(e) => p.setOverrideSrcKey(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    <option value="__id__">(ID del registro)</option>
                    {p.srcColumns.map((c) => <option key={c.id} value={c.field_key}>{c.name}</option>)}
                  </select>
                </div>
                {p.showOverride && p.autoDetectAll.length > 0 && (
                  <button onClick={() => p.setShowOverride(false)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11,
                      color: "var(--color-text-muted)", marginBottom: 8, padding: 0, textDecoration: "underline" }}>
                    ← Volver a vínculos detectados
                  </button>
                )}
              </>
            )}
            {/* Multi-column picker */}
            <div className="panel-form-row">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span className="panel-form-label" style={{ margin: 0 }}>Columnas a mostrar</span>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  {p.filteredSrcCols.length}/{p.pickableSrcCols.length}
                </span>
              </div>
              <input
                type="text"
                placeholder="Buscar columna…"
                value={p.joinColFilter}
                onChange={(e) => p.setJoinColFilter(e.target.value)}
                style={{
                  width: "100%", fontSize: 12, padding: "5px 9px",
                  border: "1px solid var(--color-border)", borderRadius: 6,
                  marginBottom: 6,
                }}
              />
              {p.filteredSrcCols.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1, fontSize: 11, padding: "4px 6px", justifyContent: "center" }}
                    onClick={() => p.setSelectedDisplayKeys(prev => {
                      const next = new Set(prev);
                      p.filteredSrcCols.forEach(c => next.add(c.field_key));
                      return next;
                    })}
                    disabled={p.filteredSrcCols.every(c => p.selectedDisplayKeys.has(c.field_key))}
                  >
                    ✓ Marcar todas
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1, fontSize: 11, padding: "4px 6px", justifyContent: "center" }}
                    onClick={() => p.setSelectedDisplayKeys(prev => {
                      const next = new Set(prev);
                      p.filteredSrcCols.forEach(c => next.delete(c.field_key));
                      return next;
                    })}
                    disabled={!p.filteredSrcCols.some(c => p.selectedDisplayKeys.has(c.field_key))}
                  >
                    ✕ Desmarcar todas
                  </button>
                </div>
              )}
              <div className="join-col-list">
                {p.filteredSrcCols.length === 0 && p.pickableSrcCols.length > 0 && (
                  <p style={{ padding: "10px 12px", fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
                    Ninguna columna coincide con “{p.joinColFilter}”.
                  </p>
                )}
                {p.filteredSrcCols.map(c => (
                  <label key={c.id} className="join-col-item">
                    <input
                      type="checkbox"
                      checked={p.selectedDisplayKeys.has(c.field_key)}
                      onChange={() => p.toggleDisplayKey(c.field_key)}
                    />
                    <span className="join-col-name">{c.name}</span>
                    <span className="join-col-type">{c.data_type}</span>
                  </label>
                ))}
              </div>
              {p.selectedDisplayKeys.size > 0 && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--color-primary)", fontWeight: 600 }}>
                  {p.selectedDisplayKeys.size} columna{p.selectedDisplayKeys.size !== 1 ? "s" : ""} seleccionada{p.selectedDisplayKeys.size !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            {p.justAdded > 0 && (
              <div style={{
                background: "var(--pm-green-50)", border: "1px solid var(--pm-green-300, #86EFAC)",
                color: "var(--pm-green-600)", borderRadius: 6, padding: "6px 10px",
                fontSize: 12, fontWeight: 600, marginTop: 4,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                ✓ {p.justAdded} columna{p.justAdded !== 1 ? "s" : ""} agregada{p.justAdded !== 1 ? "s" : ""}.
                {p.autoDetectAll.length > 1 && (
                  <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>
                    ¿Sumar otro vínculo? Cambia arriba.
                  </span>
                )}
              </div>
            )}
            <button className="btn btn-primary" onClick={p.handleAddJoin} disabled={!p.canAddJoin}
              style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
              Agregar {p.selectedDisplayKeys.size > 1 ? `${p.selectedDisplayKeys.size} columnas` : "columna"} vinculada{p.selectedDisplayKeys.size !== 1 ? "s" : ""}
            </button>
          </>
        )}
      </div>
    </>
  );
}

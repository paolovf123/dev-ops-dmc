import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition, JoinedColDef, FormulaColDef } from "../types";
import { evalFormula, FORMULA_HELP } from "../utils/formula";

interface Props {
  currentDatasetId: string;
  currentDatasetName: string;
  columns: ColumnDefinition[];
  hiddenCols: Set<string>;
  joinedCols: JoinedColDef[];
  formulaCols: FormulaColDef[];
  onToggleCol: (colId: string) => void;
  onAddJoin: (def: Omit<JoinedColDef, "uid">) => void;
  onRemoveJoin: (uid: string) => void;
  onAddFormula: (def: Omit<FormulaColDef, "uid">) => void;
  onRemoveFormula: (uid: string) => void;
  sampleRecord?: Record<string, unknown>;
  onClose: () => void;
}

type Tab = 'visibility' | 'joins' | 'formulas';

function normalize(name: string) { return name.toLowerCase().replace(/\s+/g, "_"); }
function keyword(dsName: string) {
  const parts = normalize(dsName).split("_");
  return parts[parts.length - 1];
}

export default function ColumnPanel({
  currentDatasetId, currentDatasetName, columns, hiddenCols,
  joinedCols, formulaCols, onToggleCol, onAddJoin, onRemoveJoin,
  onAddFormula, onRemoveFormula, sampleRecord, onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('visibility');

  // ── Joins state ──────────────────────────────────────────────────────────────
  const [selectedDsId, setSelectedDsId] = useState("");
  const [overrideLocalKey, setOverrideLocalKey] = useState("");
  const [overrideSrcKey, setOverrideSrcKey] = useState("");
  const [selectedDisplayKeys, setSelectedDisplayKeys] = useState<Set<string>>(new Set());
  const [showOverride, setShowOverride] = useState(false);

  // ── Formula state ─────────────────────────────────────────────────────────────
  const [fName, setFName] = useState("");
  const [fFormula, setFFormula] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [editingUid, setEditingUid] = useState<string | null>(null);

  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: getDatasets });
  const { data: srcColumns = [] } = useQuery({
    queryKey: ["columns", selectedDsId],
    queryFn: () => getColumns(selectedDsId),
    enabled: !!selectedDsId,
  });

  const otherDatasets = datasets.filter((d) => d.id !== currentDatasetId);
  const selectedDs = datasets.find((d) => d.id === selectedDsId);

  const autoDetect = useMemo(() => {
    if (!selectedDsId || srcColumns.length === 0) return null;
    const curKw = keyword(currentDatasetName);
    const srcKw = keyword(selectedDs?.name ?? "");
    const fwdLocal = columns.find((c) => c.field_key === `id_${srcKw}`);
    if (fwdLocal) {
      const srcPk = srcColumns.find((c) => c.field_key === "id") ?? srcColumns[0];
      return { localKey: fwdLocal.field_key, srcKey: srcPk?.field_key ?? "id", type: "forward" as const };
    }
    const revSrc = srcColumns.find((c) => c.field_key === `id_${curKw}` || c.field_key.includes(curKw));
    if (revSrc) {
      const localPk = columns.find((c) => c.field_key === "id") ?? columns[0];
      return { localKey: localPk?.field_key ?? "id", srcKey: revSrc.field_key, type: "reverse" as const };
    }
    return null;
  }, [selectedDsId, srcColumns, columns, currentDatasetName, selectedDs]);

  const effectiveLocalKey = showOverride ? overrideLocalKey : (autoDetect?.localKey ?? "");
  const effectiveSrcKey   = showOverride ? overrideSrcKey   : (autoDetect?.srcKey   ?? "");
  const canAddJoin = !!(selectedDsId && selectedDisplayKeys.size > 0 && effectiveLocalKey && effectiveSrcKey);

  const toggleDisplayKey = (key: string) =>
    setSelectedDisplayKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleAllDisplayKeys = () => {
    const pickable = srcColumns.filter(c => c.field_key !== effectiveSrcKey);
    const allSelected = pickable.every(c => selectedDisplayKeys.has(c.field_key));
    setSelectedDisplayKeys(allSelected ? new Set() : new Set(pickable.map(c => c.field_key)));
  };

  const handleAddJoin = () => {
    if (!canAddJoin || !selectedDs) return;
    selectedDisplayKeys.forEach(key => {
      const col = srcColumns.find(c => c.field_key === key);
      onAddJoin({
        sourceDatasetId: selectedDsId,
        sourceDatasetName: selectedDs.name,
        localFkKey: effectiveLocalKey,
        sourcePkKey: effectiveSrcKey,
        displayKey: key,
        displayName: col?.name ?? key,
      });
    });
    setSelectedDsId(""); setSelectedDisplayKeys(new Set()); setOverrideLocalKey("");
    setOverrideSrcKey(""); setShowOverride(false);
  };

  const formulaPreview = useMemo(() => {
    if (!fFormula || !sampleRecord) return null;
    return evalFormula(fFormula, sampleRecord);
  }, [fFormula, sampleRecord]);

  const handleAddFormula = () => {
    if (!fName.trim() || !fFormula.trim()) return;
    if (editingUid) {
      onRemoveFormula(editingUid);
      setEditingUid(null);
    }
    onAddFormula({ name: fName.trim(), formula: fFormula.trim() });
    setFName(""); setFFormula("");
  };

  const startEditFormula = (fc: FormulaColDef) => {
    setFName(fc.name); setFFormula(fc.formula); setEditingUid(fc.uid);
  };

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'visibility', label: '👁 Columnas' },
    { key: 'joins',      label: '🔗 Vínculos', badge: joinedCols.length },
    { key: 'formulas',   label: 'ƒ Fórmulas',  badge: formulaCols.length },
  ];

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <div className="panel" style={{ width: 320 }}>
        {/* Header */}
        <div className="panel-header">
          <span className="panel-title">⊞ Columnas avanzadas</span>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "3px 8px", fontSize: 18 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, border: "none", background: "none", cursor: "pointer",
                padding: "9px 4px", fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? "var(--color-primary)" : "var(--color-text-muted)",
                borderBottom: tab === t.key ? "2px solid var(--color-primary)" : "2px solid transparent",
                transition: "color 0.15s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              }}
            >
              {t.label}
              {t.badge ? (
                <span style={{
                  background: "var(--color-primary)", color: "#fff",
                  borderRadius: 99, fontSize: 10, fontWeight: 700,
                  padding: "1px 5px", lineHeight: 1.4,
                }}>{t.badge}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="panel-body">

          {/* ── TAB: Visibility ── */}
          {tab === 'visibility' && (
            <>
              <div className="panel-section" style={{ paddingBottom: 0 }}>
                <span className="panel-section-label">Mostrar / ocultar</span>
              </div>
              {columns.length === 0 && (
                <p style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-text-muted)" }}>
                  Sin columnas en este dataset.
                </p>
              )}
              {columns.map((col) => (
                <label key={col.id} className="col-toggle">
                  <input type="checkbox" checked={!hiddenCols.has(col.id)} onChange={() => onToggleCol(col.id)} />
                  <span className="col-toggle-name">{col.name}</span>
                  <span className="col-toggle-type">{col.data_type}</span>
                </label>
              ))}
              {hiddenCols.size > 0 && (
                <div style={{ padding: "8px 16px" }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 12, width: "100%", justifyContent: "center" }}
                    onClick={() => columns.forEach(c => hiddenCols.has(c.id) && onToggleCol(c.id))}
                  >
                    Mostrar todas ({columns.length - hiddenCols.size}/{columns.length})
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── TAB: Joins ── */}
          {tab === 'joins' && (
            <>
              {joinedCols.length > 0 && (
                <>
                  <div className="panel-section"><span className="panel-section-label">Activas</span></div>
                  {joinedCols.map((j) => (
                    <div key={j.uid} className="joined-tag">
                      <span className="joined-tag-name">
                        <span>🔗</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {j.sourceDatasetName} › {j.displayName}
                        </span>
                      </span>
                      <button className="btn btn-danger-ghost" onClick={() => onRemoveJoin(j.uid)}
                        style={{ padding: "2px 6px", fontSize: 13, flexShrink: 0 }}>×</button>
                    </div>
                  ))}
                  <div className="panel-divider" />
                </>
              )}

              <div className="panel-section"><span className="panel-section-label">Agregar vínculo</span></div>
              <div className="panel-form">
                <div className="panel-form-row">
                  <span className="panel-form-label">Dataset origen</span>
                  <select value={selectedDsId} onChange={(e) => {
                    setSelectedDsId(e.target.value);
                    setSelectedDisplayKeys(new Set()); setOverrideLocalKey(""); setOverrideSrcKey(""); setShowOverride(false);
                  }}>
                    <option value="">Seleccionar...</option>
                    {otherDatasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                {selectedDsId && srcColumns.length > 0 && (
                  <>
                    {autoDetect && !showOverride ? (
                      <div style={{ background: "var(--pm-green-50)", border: "1px solid var(--pm-green-100)",
                        borderRadius: "var(--radius-sm)", padding: "8px 10px", marginBottom: 10 }}>
                        <div style={{ fontSize: 12, color: "var(--pm-green-600)", marginBottom: 4, fontWeight: 600 }}>
                          ✓ Vínculo detectado automáticamente
                        </div>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                          <code style={{ background: "var(--pm-green-100)", padding: "1px 5px", borderRadius: 3 }}>{effectiveLocalKey}</code>
                          {" ↔ "}
                          <code style={{ background: "var(--pm-green-100)", padding: "1px 5px", borderRadius: 3 }}>{effectiveSrcKey}</code>
                        </div>
                        <button onClick={() => setShowOverride(true)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11,
                            color: "var(--color-text-muted)", marginTop: 4, padding: 0, textDecoration: "underline" }}>
                          Cambiar manualmente
                        </button>
                      </div>
                    ) : (
                      <>
                        {!autoDetect && (
                          <div style={{ fontSize: 12, color: "var(--pm-red-500)", marginBottom: 8,
                            background: "var(--pm-red-50)", padding: "6px 8px", borderRadius: "var(--radius-sm)" }}>
                            No se detectó vínculo. Selecciona las claves manualmente.
                          </div>
                        )}
                        <div className="panel-form-row">
                          <span className="panel-form-label">Clave local</span>
                          <select value={overrideLocalKey} onChange={(e) => setOverrideLocalKey(e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {columns.map((c) => <option key={c.id} value={c.field_key}>{c.name}</option>)}
                          </select>
                        </div>
                        <div className="panel-form-row">
                          <span className="panel-form-label">Clave en "{selectedDs?.name}"</span>
                          <select value={overrideSrcKey} onChange={(e) => setOverrideSrcKey(e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {srcColumns.map((c) => <option key={c.id} value={c.field_key}>{c.name}</option>)}
                          </select>
                        </div>
                        {showOverride && (
                          <button onClick={() => setShowOverride(false)}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11,
                              color: "var(--color-text-muted)", marginBottom: 8, padding: 0, textDecoration: "underline" }}>
                            Usar detección automática
                          </button>
                        )}
                      </>
                    )}
                    {/* Multi-column picker */}
                    <div className="panel-form-row">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span className="panel-form-label" style={{ margin: 0 }}>Columnas a mostrar</span>
                        <button
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11,
                            color: "var(--color-primary)", padding: 0, fontWeight: 600 }}
                          onClick={toggleAllDisplayKeys}
                        >
                          {srcColumns.filter(c => c.field_key !== effectiveSrcKey).every(c => selectedDisplayKeys.has(c.field_key))
                            ? "Deseleccionar todas" : "Seleccionar todas"}
                        </button>
                      </div>
                      <div className="join-col-list">
                        {srcColumns
                          .filter(c => c.field_key !== effectiveSrcKey)
                          .map(c => (
                            <label key={c.id} className="join-col-item">
                              <input
                                type="checkbox"
                                checked={selectedDisplayKeys.has(c.field_key)}
                                onChange={() => toggleDisplayKey(c.field_key)}
                              />
                              <span className="join-col-name">{c.name}</span>
                              <span className="join-col-type">{c.data_type}</span>
                            </label>
                          ))}
                      </div>
                      {selectedDisplayKeys.size > 0 && (
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--color-primary)", fontWeight: 600 }}>
                          {selectedDisplayKeys.size} columna{selectedDisplayKeys.size !== 1 ? "s" : ""} seleccionada{selectedDisplayKeys.size !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                    <button className="btn btn-primary" onClick={handleAddJoin} disabled={!canAddJoin}
                      style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
                      🔗 Agregar {selectedDisplayKeys.size > 1 ? `${selectedDisplayKeys.size} columnas` : "columna"} vinculada{selectedDisplayKeys.size !== 1 ? "s" : ""}
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {/* ── TAB: Formulas ── */}
          {tab === 'formulas' && (
            <>
              {formulaCols.length > 0 && (
                <>
                  <div className="panel-section"><span className="panel-section-label">Columnas calculadas</span></div>
                  {formulaCols.map((fc) => (
                    <div key={fc.uid} style={{ display: "flex", alignItems: "center", gap: 6,
                      padding: "7px 16px", borderBottom: "1px solid var(--color-border-light)" }}>
                      <span style={{ fontSize: 13, flex: 1, minWidth: 0 }}>
                        <span className="formula-badge-small">ƒ</span>
                        {" "}{fc.name}
                        <span style={{ display: "block", fontSize: 11, fontFamily: "var(--font-mono)",
                          color: "var(--color-text-muted)", marginTop: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          ={fc.formula}
                        </span>
                      </span>
                      <button className="btn btn-ghost" style={{ padding: "3px 6px", fontSize: 12 }}
                        onClick={() => startEditFormula(fc)}>✏️</button>
                      <button className="btn btn-danger-ghost" style={{ padding: "2px 6px", fontSize: 13 }}
                        onClick={() => { if (editingUid === fc.uid) { setFName(""); setFFormula(""); setEditingUid(null); } onRemoveFormula(fc.uid); }}>×</button>
                    </div>
                  ))}
                  <div className="panel-divider" />
                </>
              )}

              <div className="panel-section">
                <span className="panel-section-label">
                  {editingUid ? "Editar fórmula" : "Nueva columna calculada"}
                </span>
              </div>

              <div className="panel-form">
                {/* Column references */}
                {columns.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <span className="panel-form-label" style={{ display: "block", marginBottom: 5 }}>
                      Campos disponibles (clic para insertar)
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {columns.map(c => (
                        <button key={c.id}
                          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius-xs)", fontSize: 11, padding: "2px 7px",
                            cursor: "pointer", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)",
                            transition: "background 0.12s" }}
                          onClick={() => setFFormula(prev => prev + (prev && !prev.endsWith('(') && !prev.endsWith(' ') ? ' ' : '') + c.field_key)}
                          title={`${c.name} (${c.data_type})`}
                        >
                          {c.field_key}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="panel-form-row">
                  <span className="panel-form-label">Nombre de la columna</span>
                  <input placeholder="Ej. Monto total" value={fName} onChange={e => setFName(e.target.value)} />
                </div>

                <div className="panel-form-row">
                  <span className="panel-form-label">Fórmula</span>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
                      color: "var(--pm-violet-500)", fontWeight: 700, fontSize: 14, pointerEvents: "none" }}>
                      =
                    </span>
                    <input
                      placeholder="precio * cantidad"
                      value={fFormula}
                      onChange={e => setFFormula(e.target.value)}
                      style={{ paddingLeft: 22, fontFamily: "var(--font-mono)", fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* Live preview */}
                {fFormula && (
                  <div style={{ marginBottom: 10, padding: "7px 10px", borderRadius: "var(--radius-sm)",
                    background: formulaPreview !== null && !String(formulaPreview).startsWith('#')
                      ? "var(--pm-green-50)" : String(formulaPreview ?? '').startsWith('#')
                      ? "var(--pm-red-50)" : "var(--color-bg)",
                    border: `1px solid ${formulaPreview !== null && !String(formulaPreview).startsWith('#')
                      ? "var(--pm-green-100)" : "var(--color-border)"}` }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 2 }}>
                      Vista previa (1er registro):
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600,
                      color: String(formulaPreview ?? '').startsWith('#') ? "var(--pm-red-500)" : "var(--color-text)",
                      fontFamily: "var(--font-mono)" }}>
                      {formulaPreview === null
                        ? <span style={{ color: "var(--color-text-muted)" }}>— (sin datos)</span>
                        : String(formulaPreview)}
                    </span>
                  </div>
                )}

                <button className="btn btn-primary" onClick={handleAddFormula}
                  disabled={!fName.trim() || !fFormula.trim()}
                  style={{ width: "100%", justifyContent: "center",
                    background: "linear-gradient(135deg, #7C3AED, #6366F1)",
                    borderColor: "#7C3AED" }}>
                  <span>ƒ</span>
                  {editingUid ? " Guardar cambios" : " Agregar columna calculada"}
                </button>
                {editingUid && (
                  <button className="btn btn-ghost"
                    style={{ width: "100%", justifyContent: "center", marginTop: 4, fontSize: 12 }}
                    onClick={() => { setFName(""); setFFormula(""); setEditingUid(null); }}>
                    Cancelar edición
                  </button>
                )}

                {/* Function reference */}
                <button
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11,
                    color: "var(--color-text-muted)", padding: "8px 0 0", textDecoration: "underline", textAlign: "left" }}
                  onClick={() => setShowHelp(v => !v)}
                >
                  {showHelp ? "▲ Ocultar" : "▼ Ver"} funciones disponibles
                </button>

                {showHelp && (
                  <div style={{ marginTop: 8, fontSize: 11, background: "var(--color-bg)",
                    border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                    {FORMULA_HELP.map(cat => (
                      <div key={cat.cat} style={{ marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>
                          {cat.cat}
                        </span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {cat.fns.map(fn => (
                            <code key={fn}
                              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)",
                                borderRadius: 3, padding: "1px 5px", fontSize: 10, cursor: "pointer",
                                color: "var(--pm-violet-600)" }}
                              onClick={() => {
                                const fnName = fn.split('(')[0];
                                setFFormula(prev => prev + (prev ? ' ' : '') + fnName + '(');
                              }}
                            >{fn}</code>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

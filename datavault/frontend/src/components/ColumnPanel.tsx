import { useState, useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition, JoinedColDef, FormulaColDef } from "../types";
import { evalFormula, FORMULA_HELP } from "../utils/formula";
import { useEscapeKey } from "../utils/useEscapeKey";

interface Props {
  currentDatasetId: string;
  currentDatasetName: string;
  workspaceId?: string;
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
  currentDatasetId, currentDatasetName, workspaceId, columns, hiddenCols,
  joinedCols, formulaCols, onToggleCol, onAddJoin, onRemoveJoin,
  onAddFormula, onRemoveFormula, sampleRecord, onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('visibility');
  useEscapeKey(onClose);

  // ── Filtros de búsqueda por tab ───────────────────────────────────────────────
  const [colFilter, setColFilter] = useState("");
  const [joinColFilter, setJoinColFilter] = useState("");
  const [dsFilter, setDsFilter] = useState("");

  // ── Joins state ──────────────────────────────────────────────────────────────
  const [selectedDsId, setSelectedDsId] = useState("");
  const [overrideLocalKey, setOverrideLocalKey] = useState("");
  const [overrideSrcKey, setOverrideSrcKey] = useState("");
  const [selectedDisplayKeys, setSelectedDisplayKeys] = useState<Set<string>>(new Set());
  const [showOverride, setShowOverride] = useState(false);
  // Cuando hay múltiples vínculos detectados, índice del elegido
  const [selectedLinkIdx, setSelectedLinkIdx] = useState(0);
  // Flash visual cuando se agregan columnas (no resetea el flujo, solo confirma)
  const [justAdded, setJustAdded] = useState<number>(0);

  // ── Formula state ─────────────────────────────────────────────────────────────
  const [fName, setFName] = useState("");
  const [fFormula, setFFormula] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [editingUid, setEditingUid] = useState<string | null>(null);

  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", workspaceId ?? "all"],
    queryFn: () => getDatasets(workspaceId ? { workspace_id: workspaceId } : undefined),
  });
  const { data: srcColumns = [] } = useQuery({
    queryKey: ["columns", selectedDsId],
    queryFn: () => getColumns(selectedDsId),
    enabled: !!selectedDsId,
  });

  const otherDatasets = datasets.filter((d) => d.id !== currentDatasetId);
  const selectedDs = datasets.find((d) => d.id === selectedDsId);

  // Pre-cargamos columnas de TODOS los datasets is_bridge del workspace
  // para detectar joins N:N vía tabla intermedia.
  const bridges = useMemo(() => datasets.filter((d) => d.is_bridge), [datasets]);
  const bridgeColQueries = useQueries({
    queries: bridges.map((b) => ({
      queryKey: ["columns", b.id],
      queryFn: () => getColumns(b.id),
      staleTime: 60_000,
    })),
  });

  // Detecta TODOS los vínculos posibles entre el dataset actual y el seleccionado.
  // Incluye:
  //  - forward: cada columna local que apunte al dataset seleccionado (relation explícita o id_<kw>)
  //  - reverse: cada columna del dataset seleccionado que apunte aquí (relation explícita o id_<curKw>)
  type DetectedLink = {
    localKey: string;
    srcKey: string;
    type: "forward" | "reverse" | "bridge";
    label: string;       // texto descriptivo
    confirmed: boolean;  // true si la columna ya es data_type=relation
    // Solo para type="bridge"
    via?: {
      bridgeDatasetId: string;
      bridgeDatasetName: string;
      bridgeFkToLocal: string;
      bridgeFkToSource: string;
    };
  };
  const autoDetectAll = useMemo<DetectedLink[]>(() => {
    if (!selectedDsId || srcColumns.length === 0) return [];
    const curKw = keyword(currentDatasetName);
    const srcKw = keyword(selectedDs?.name ?? "");
    const out: DetectedLink[] = [];
    const seenKey = new Set<string>(); // dedupe por (localKey + srcKey + type)

    const push = (l: DetectedLink) => {
      const k = `${l.type}|${l.localKey}|${l.srcKey}`;
      if (!seenKey.has(k)) { seenKey.add(k); out.push(l); }
    };

    // FORWARD — columnas locales con data_type=relation apuntando al destino.
    // Si la relación tiene display_field configurado, la unión usa ese campo del
    // destino (no __id__). Ej: codigo_inversionista ↔ Inversionistas.codigo_inversionista
    for (const c of columns) {
      if (c.data_type === "relation" && c.rules?.related_dataset_id === selectedDsId) {
        const df = c.rules?.display_field;
        const srcKey = df && df !== "__id__" ? df : "__id__";
        push({
          localKey: c.field_key, srcKey,
          type: "forward", confirmed: true,
          label: `${c.name} (relación confirmada)`,
        });
      }
    }
    // FORWARD — columnas locales id_<srcKw> (heurístico)
    if (srcKw) {
      const looseMatchers = (key: string) =>
        key === `id_${srcKw}` || key === `cod_${srcKw}` || key === `codigo_${srcKw}` ||
        key === `${srcKw}_id` || key.includes(`_${srcKw}`) || key.startsWith(`${srcKw}_`);
      for (const c of columns) {
        if (c.data_type === "relation") continue;
        if (looseMatchers(c.field_key)) {
          push({
            localKey: c.field_key, srcKey: "__id__",
            type: "forward", confirmed: false,
            label: `${c.name} → ${selectedDs?.name ?? ""} (por nombre)`,
          });
        }
      }
    }

    // REVERSE — columnas del source con data_type=relation apuntando a este dataset.
    // Si la relación tiene display_field, el match va contra ese campo nuestro.
    for (const c of srcColumns) {
      if (c.data_type === "relation" && c.rules?.related_dataset_id === currentDatasetId) {
        const df = c.rules?.display_field;
        const localKey = df && df !== "__id__" ? df : "__id__";
        push({
          localKey, srcKey: c.field_key,
          type: "reverse", confirmed: true,
          label: `${selectedDs?.name ?? ""}.${c.name} apunta aquí (confirmada)`,
        });
      }
    }
    if (curKw) {
      const looseMatchers = (key: string) =>
        key === `id_${curKw}` || key === `cod_${curKw}` || key === `codigo_${curKw}` ||
        key === `${curKw}_id` || key.includes(`_${curKw}`) || key.startsWith(`${curKw}_`);
      for (const c of srcColumns) {
        if (c.data_type === "relation") continue;
        if (looseMatchers(c.field_key)) {
          push({
            localKey: "__id__", srcKey: c.field_key,
            type: "reverse", confirmed: false,
            label: `${selectedDs?.name ?? ""}.${c.name} (por nombre)`,
          });
        }
      }
    }

    // BRIDGE — para cada tabla intermedia, si tiene columnas relation que apuntan
    // tanto al dataset actual como al seleccionado, ofrecer un join N:N vía esa tabla.
    bridges.forEach((bridge, bi) => {
      const bCols = bridgeColQueries[bi]?.data ?? [];
      const fkToLocal = bCols.find(
        (c) => c.data_type === "relation" && c.rules?.related_dataset_id === currentDatasetId,
      );
      const fkToSrc = bCols.find(
        (c) => c.data_type === "relation" && c.rules?.related_dataset_id === selectedDsId,
      );
      if (fkToLocal && fkToSrc) {
        out.push({
          localKey: "__id__",
          srcKey: "__id__",
          type: "bridge",
          confirmed: true,
          label: `Vía ${bridge.name} (tabla intermedia N:N)`,
          via: {
            bridgeDatasetId: bridge.id,
            bridgeDatasetName: bridge.name,
            bridgeFkToLocal: fkToLocal.field_key,
            bridgeFkToSource: fkToSrc.field_key,
          },
        });
      }
    });

    // Ordenamos: confirmadas primero, luego forward, luego reverse, luego bridge
    out.sort((a, b) => {
      if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
      if (a.type !== b.type) return a.type === "forward" ? -1 : 1;
      return 0;
    });
    return out;
  }, [selectedDsId, srcColumns, columns, currentDatasetName, selectedDs, currentDatasetId]);

  const activeLink = autoDetectAll[selectedLinkIdx];
  const effectiveLocalKey = showOverride ? overrideLocalKey : (activeLink?.localKey ?? "");
  const effectiveSrcKey   = showOverride ? overrideSrcKey   : (activeLink?.srcKey   ?? "");
  const canAddJoin = !!(selectedDsId && selectedDisplayKeys.size > 0 && effectiveLocalKey && effectiveSrcKey);

  const toggleDisplayKey = (key: string) =>
    setSelectedDisplayKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // pickable = columnas del source disponibles para joinear (excluye la PK que ya se usa como link)
  // filterable = pickable + match contra joinColFilter (búsqueda por nombre/key)
  const pickableSrcCols = useMemo(
    () => srcColumns.filter(c => c.field_key !== effectiveSrcKey),
    [srcColumns, effectiveSrcKey],
  );
  const filteredSrcCols = useMemo(() => {
    const q = joinColFilter.trim().toLowerCase();
    if (!q) return pickableSrcCols;
    return pickableSrcCols.filter(
      c => c.name.toLowerCase().includes(q) || c.field_key.toLowerCase().includes(q),
    );
  }, [pickableSrcCols, joinColFilter]);


  const handleAddJoin = () => {
    if (!canAddJoin || !selectedDs) return;
    const count = selectedDisplayKeys.size;
    const via = activeLink?.via;  // pasa por bridge solo si el link activo es type=bridge
    selectedDisplayKeys.forEach(key => {
      const col = srcColumns.find(c => c.field_key === key);
      onAddJoin({
        sourceDatasetId: selectedDsId,
        sourceDatasetName: selectedDs.name,
        localFkKey: effectiveLocalKey,
        sourcePkKey: effectiveSrcKey,
        displayKey: key,
        displayName: col?.name ?? key,
        ...(via ? { via } : {}),
      });
    });
    // Solo limpiamos la selección de columnas. Conservamos dataset, vínculo elegido
    // y el override manual, para que el usuario pueda seguir trayendo columnas
    // del mismo dataset (cambiando de vínculo si quiere) sin re-elegir todo.
    setSelectedDisplayKeys(new Set());
    setJustAdded(count);
    window.setTimeout(() => setJustAdded(0), 1800);
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
          {tab === 'visibility' && (() => {
            const q = colFilter.trim().toLowerCase();
            const filteredCols = q
              ? columns.filter(c => c.name.toLowerCase().includes(q) || c.field_key.toLowerCase().includes(q))
              : columns;
            const visibleHidden = filteredCols.filter(c => hiddenCols.has(c.id));
            const visibleShown  = filteredCols.filter(c => !hiddenCols.has(c.id));
            return (
            <>
              <div className="panel-section" style={{ paddingBottom: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="panel-section-label" style={{ marginBottom: 0 }}>Mostrar / ocultar</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    {visibleShown.length}/{filteredCols.length} visibles
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="🔍 Buscar columna…"
                  value={colFilter}
                  onChange={(e) => setColFilter(e.target.value)}
                  style={{
                    width: "100%", fontSize: 12, padding: "5px 9px",
                    border: "1px solid var(--color-border)", borderRadius: 6,
                    marginBottom: 8,
                  }}
                />
                {filteredCols.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ flex: 1, fontSize: 11, padding: "4px 6px", justifyContent: "center" }}
                      disabled={visibleHidden.length === 0}
                      onClick={() => visibleHidden.forEach(c => onToggleCol(c.id))}
                    >
                      ✓ Marcar todas
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ flex: 1, fontSize: 11, padding: "4px 6px", justifyContent: "center" }}
                      disabled={visibleShown.length === 0}
                      onClick={() => visibleShown.forEach(c => onToggleCol(c.id))}
                    >
                      ✕ Desmarcar todas
                    </button>
                  </div>
                )}
              </div>
              {columns.length === 0 && (
                <p style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-text-muted)" }}>
                  Sin columnas en este dataset.
                </p>
              )}
              {columns.length > 0 && filteredCols.length === 0 && (
                <p style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-text-muted)" }}>
                  Ninguna columna coincide con “{colFilter}”.
                </p>
              )}
              {filteredCols.map((col) => (
                <label key={col.id} className="col-toggle">
                  <input type="checkbox" checked={!hiddenCols.has(col.id)} onChange={() => onToggleCol(col.id)} />
                  <span className="col-toggle-name">{col.name}</span>
                  <span className="col-toggle-type">{col.data_type}</span>
                </label>
              ))}
            </>
            );
          })()}

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
                {/* Dataset picker con filtro */}
                <div className="panel-form-row">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span className="panel-form-label" style={{ margin: 0 }}>Dataset origen</span>
                    {selectedDsId && (
                      <button
                        onClick={() => {
                          setSelectedDsId(""); setDsFilter("");
                          setSelectedDisplayKeys(new Set()); setOverrideLocalKey("");
                          setOverrideSrcKey(""); setShowOverride(false); setSelectedLinkIdx(0);
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer",
                          fontSize: 11, color: "var(--color-text-muted)", padding: 0, textDecoration: "underline" }}>
                        Cambiar
                      </button>
                    )}
                  </div>
                  {selectedDsId ? (
                    <div style={{
                      padding: "7px 10px", border: "1px solid var(--color-border)",
                      borderRadius: 6, background: "var(--color-bg)",
                      fontSize: 13, fontWeight: 600,
                    }}>
                      {selectedDs?.name}
                    </div>
                  ) : (() => {
                    const q = dsFilter.trim().toLowerCase();
                    const filteredDs = q
                      ? otherDatasets.filter(d => d.name.toLowerCase().includes(q))
                      : otherDatasets;
                    return (
                      <>
                        <input
                          type="text"
                          placeholder="🔍 Buscar dataset…"
                          value={dsFilter}
                          onChange={(e) => setDsFilter(e.target.value)}
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
                              {otherDatasets.length === 0 ? "No hay otros datasets" : `Sin resultados para "${dsFilter}"`}
                            </p>
                          )}
                          {filteredDs.map(d => (
                            <button
                              key={d.id}
                              onClick={() => {
                                setSelectedDsId(d.id);
                                setSelectedDisplayKeys(new Set()); setOverrideLocalKey("");
                                setOverrideSrcKey(""); setShowOverride(false); setSelectedLinkIdx(0);
                              }}
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

                {selectedDsId && srcColumns.length > 0 && (
                  <>
                    {autoDetectAll.length > 0 && !showOverride ? (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, color: "var(--pm-green-600)", marginBottom: 6, fontWeight: 600 }}>
                          ✓ {autoDetectAll.length} vínculo{autoDetectAll.length !== 1 ? "s" : ""} detectado{autoDetectAll.length !== 1 ? "s" : ""}
                          {autoDetectAll.length > 1 && (
                            <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}> — elige uno</span>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {autoDetectAll.map((link, i) => {
                            const checked = i === selectedLinkIdx;
                            return (
                              <div
                                key={i}
                                onClick={() => setSelectedLinkIdx(i)}
                                style={{
                                  padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                                  background: checked ? "var(--pm-green-50)" : "var(--color-bg)",
                                  border: `1.5px solid ${checked ? "var(--pm-green-500, #16A34A)" : "var(--color-border)"}`,
                                  transition: "all 0.12s",
                                }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                  {/* Indicador custom (no radio nativo) */}
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
                        <button onClick={() => setShowOverride(true)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11,
                            color: "var(--color-text-muted)", marginTop: 8, padding: 0, textDecoration: "underline" }}>
                          Configurar manualmente
                        </button>
                      </div>
                    ) : (
                      <>
                        {autoDetectAll.length === 0 && (
                          <div style={{ fontSize: 12, color: "var(--pm-red-500)", marginBottom: 8,
                            background: "var(--pm-red-50)", padding: "6px 8px", borderRadius: "var(--radius-sm)" }}>
                            No se detectó vínculo. Selecciona las claves manualmente.
                          </div>
                        )}
                        <div className="panel-form-row">
                          <span className="panel-form-label">Clave local</span>
                          <select value={overrideLocalKey} onChange={(e) => setOverrideLocalKey(e.target.value)}>
                            <option value="">Seleccionar...</option>
                            <option value="__id__">(ID del registro)</option>
                            {columns.map((c) => <option key={c.id} value={c.field_key}>{c.name}</option>)}
                          </select>
                        </div>
                        <div className="panel-form-row">
                          <span className="panel-form-label">Clave en "{selectedDs?.name}"</span>
                          <select value={overrideSrcKey} onChange={(e) => setOverrideSrcKey(e.target.value)}>
                            <option value="">Seleccionar...</option>
                            <option value="__id__">(ID del registro)</option>
                            {srcColumns.map((c) => <option key={c.id} value={c.field_key}>{c.name}</option>)}
                          </select>
                        </div>
                        {showOverride && autoDetectAll.length > 0 && (
                          <button onClick={() => setShowOverride(false)}
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
                          {filteredSrcCols.length}/{pickableSrcCols.length}
                        </span>
                      </div>
                      <input
                        type="text"
                        placeholder="🔍 Buscar columna…"
                        value={joinColFilter}
                        onChange={(e) => setJoinColFilter(e.target.value)}
                        style={{
                          width: "100%", fontSize: 12, padding: "5px 9px",
                          border: "1px solid var(--color-border)", borderRadius: 6,
                          marginBottom: 6,
                        }}
                      />
                      {filteredSrcCols.length > 0 && (
                        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                          <button
                            className="btn btn-ghost"
                            style={{ flex: 1, fontSize: 11, padding: "4px 6px", justifyContent: "center" }}
                            onClick={() => setSelectedDisplayKeys(prev => {
                              const next = new Set(prev);
                              filteredSrcCols.forEach(c => next.add(c.field_key));
                              return next;
                            })}
                            disabled={filteredSrcCols.every(c => selectedDisplayKeys.has(c.field_key))}
                          >
                            ✓ Marcar todas
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{ flex: 1, fontSize: 11, padding: "4px 6px", justifyContent: "center" }}
                            onClick={() => setSelectedDisplayKeys(prev => {
                              const next = new Set(prev);
                              filteredSrcCols.forEach(c => next.delete(c.field_key));
                              return next;
                            })}
                            disabled={!filteredSrcCols.some(c => selectedDisplayKeys.has(c.field_key))}
                          >
                            ✕ Desmarcar todas
                          </button>
                        </div>
                      )}
                      <div className="join-col-list">
                        {filteredSrcCols.length === 0 && pickableSrcCols.length > 0 && (
                          <p style={{ padding: "10px 12px", fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
                            Ninguna columna coincide con “{joinColFilter}”.
                          </p>
                        )}
                        {filteredSrcCols.map(c => (
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
                    {justAdded > 0 && (
                      <div style={{
                        background: "var(--pm-green-50)", border: "1px solid var(--pm-green-300, #86EFAC)",
                        color: "var(--pm-green-600)", borderRadius: 6, padding: "6px 10px",
                        fontSize: 12, fontWeight: 600, marginTop: 4,
                        display: "flex", alignItems: "center", gap: 6,
                      }}>
                        ✓ {justAdded} columna{justAdded !== 1 ? "s" : ""} agregada{justAdded !== 1 ? "s" : ""}.
                        {autoDetectAll.length > 1 && (
                          <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>
                            ¿Sumar otro vínculo? Cambia arriba.
                          </span>
                        )}
                      </div>
                    )}
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

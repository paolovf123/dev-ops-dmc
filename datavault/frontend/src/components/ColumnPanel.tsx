import { useState, useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition, JoinedColDef, FormulaColDef } from "../types";
import { evalFormula } from "../utils/formula";
import { useEscapeKey } from "../utils/useEscapeKey";
import { detectJoinLinks, type DetectedLink, type BridgeWithCols } from "./columnpanel/links";
import VisibilityTab from "./columnpanel/VisibilityTab";
import JoinsTab from "./columnpanel/JoinsTab";
import FormulasTab from "./columnpanel/FormulasTab";

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

  // Resolvemos las columnas de cada bridge (cargadas en paralelo) y delegamos la
  // detección a la función pura `detectJoinLinks`.
  const bridgesWithCols = useMemo<BridgeWithCols[]>(
    () => bridges.map((b, bi) => ({ id: b.id, name: b.name, cols: bridgeColQueries[bi]?.data ?? [] })),
    [bridges, bridgeColQueries],
  );
  const autoDetectAll = useMemo<DetectedLink[]>(() => {
    if (!selectedDsId || srcColumns.length === 0) return [];
    return detectJoinLinks({
      selectedDsId, selectedDsName: selectedDs?.name ?? "",
      currentDatasetId, currentDatasetName,
      columns, srcColumns, bridges: bridgesWithCols,
    });
  }, [selectedDsId, srcColumns, columns, currentDatasetName, selectedDs, currentDatasetId, bridgesWithCols]);

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
    { key: 'visibility', label: 'Columnas' },
    { key: 'joins',      label: 'Vínculos', badge: joinedCols.length },
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
            <VisibilityTab
              columns={columns} hiddenCols={hiddenCols} onToggleCol={onToggleCol}
              colFilter={colFilter} setColFilter={setColFilter}
            />
          )}

          {/* ── TAB: Joins ── */}
          {tab === 'joins' && (
            <JoinsTab
              joinedCols={joinedCols} onRemoveJoin={onRemoveJoin}
              columns={columns} srcColumns={srcColumns} otherDatasets={otherDatasets}
              selectedDsId={selectedDsId} setSelectedDsId={setSelectedDsId}
              selectedDsName={selectedDs?.name ?? ""}
              dsFilter={dsFilter} setDsFilter={setDsFilter}
              autoDetectAll={autoDetectAll}
              selectedLinkIdx={selectedLinkIdx} setSelectedLinkIdx={setSelectedLinkIdx}
              showOverride={showOverride} setShowOverride={setShowOverride}
              overrideLocalKey={overrideLocalKey} setOverrideLocalKey={setOverrideLocalKey}
              overrideSrcKey={overrideSrcKey} setOverrideSrcKey={setOverrideSrcKey}
              joinColFilter={joinColFilter} setJoinColFilter={setJoinColFilter}
              pickableSrcCols={pickableSrcCols} filteredSrcCols={filteredSrcCols}
              selectedDisplayKeys={selectedDisplayKeys} setSelectedDisplayKeys={setSelectedDisplayKeys}
              toggleDisplayKey={toggleDisplayKey}
              justAdded={justAdded} canAddJoin={canAddJoin} handleAddJoin={handleAddJoin}
            />
          )}

          {/* ── TAB: Formulas ── */}
          {tab === 'formulas' && (
            <FormulasTab
              columns={columns} formulaCols={formulaCols}
              fName={fName} setFName={setFName}
              fFormula={fFormula} setFFormula={setFFormula}
              showHelp={showHelp} setShowHelp={setShowHelp}
              editingUid={editingUid} setEditingUid={setEditingUid}
              formulaPreview={formulaPreview}
              handleAddFormula={handleAddFormula} startEditFormula={startEditFormula}
              onRemoveFormula={onRemoveFormula}
            />
          )}
        </div>
      </div>
    </>
  );
}

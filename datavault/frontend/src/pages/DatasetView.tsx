import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { useRealtimeSync } from "../utils/useRealtimeSync";
import {
  getDatasets, getColumns, createColumn, updateColumn, deleteColumn,
  getRecords, createRecord, updateRecord, deleteRecord, bulkDelete, importCsv,
} from "../api/datasets";
import DataGrid, { type ExtraColumn } from "../components/DataGrid";
import AddColumnModal from "../components/AddColumnModal";
import ColumnPanel from "../components/ColumnPanel";
import RelatedDatasets from "../components/RelatedDatasets";
import ChartPanel from "../components/ChartPanel";
import KanbanView from "../components/KanbanView";
import TrashPanel from "../components/TrashPanel";
import SchemaDiagram from "../components/SchemaDiagram";
import RecordHistoryPanel from "../components/RecordHistoryPanel";
import EditColumnModal from "../components/EditColumnModal";
import CsvMappingModal from "../components/CsvMappingModal";
import { useConfirm } from "../components/ConfirmDialog";
import type { ColumnDefinition, JoinedColDef, FormulaColDef } from "../types";
import { exportCsv, exportExcel } from "../utils/export";
import { parseCsv } from "../utils/csvImport";
import { useUndoRedo } from "../utils/useUndoRedo";

type ViewMode = "table" | "kanban" | "chart" | "trash";

interface SavedView {
  id: string;
  name: string;
  hiddenCols: string[];
  columnFilters: Record<string, string>;
}

export default function DatasetView() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showAddCol, setShowAddCol] = useState(false);
  const [showColPanel, setShowColPanel] = useState(false);
  const [showFilterRow, setShowFilterRow] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSavedViews, setShowSavedViews] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [historyRecordId, setHistoryRecordId] = useState<string | null>(null);
  const [editingColumn, setEditingColumn] = useState<ColumnDefinition | null>(null);
  const [csvMappingFile, setCsvMappingFile] = useState<File | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const exportRef = useRef<HTMLDivElement>(null);
  const savedViewsRef = useRef<HTMLDivElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ created: number; errors: { row: number; errors: string[] }[] } | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(`dv_hidden_${datasetId}`);
      return s ? new Set<string>(JSON.parse(s)) : new Set();
    } catch { return new Set(); }
  });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [joinedCols, setJoinedCols] = useState<JoinedColDef[]>(() => {
    try {
      const s = localStorage.getItem(`dv_joins_${datasetId}`);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  const [formulaCols, setFormulaCols] = useState<FormulaColDef[]>(() => {
    try {
      const s = localStorage.getItem(`dv_formulas_${datasetId}`);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    try {
      const s = localStorage.getItem(`dv_views_${datasetId}`);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  const [colOrder, setColOrder] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem(`dv_colorder_${datasetId}`);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  // Persist state
  useEffect(() => {
    localStorage.setItem(`dv_joins_${datasetId}`, JSON.stringify(joinedCols));
  }, [joinedCols, datasetId]);
  useEffect(() => {
    localStorage.setItem(`dv_hidden_${datasetId}`, JSON.stringify([...hiddenCols]));
  }, [hiddenCols, datasetId]);
  useEffect(() => {
    localStorage.setItem(`dv_formulas_${datasetId}`, JSON.stringify(formulaCols));
  }, [formulaCols, datasetId]);
  useEffect(() => {
    localStorage.setItem(`dv_views_${datasetId}`, JSON.stringify(savedViews));
  }, [savedViews, datasetId]);
  useEffect(() => {
    localStorage.setItem(`dv_colorder_${datasetId}`, JSON.stringify(colOrder));
  }, [colOrder, datasetId]);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node))
        setShowExportMenu(false);
      if (savedViewsRef.current && !savedViewsRef.current.contains(e.target as Node))
        setShowSavedViews(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const colsKey = ["columns", datasetId];
  const recsKey = ["records", datasetId, search];

  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: getDatasets });
  const { data: columns = [] } = useQuery({ queryKey: colsKey, queryFn: () => getColumns(datasetId!) });

  // Sync colOrder when columns/joins/formulas change (append new IDs, remove deleted ones)
  useEffect(() => {
    const allIds = [
      ...columns.map((c) => c.field_key),
      ...joinedCols.map((j) => `ec:${j.uid}`),
      ...formulaCols.map((f) => `fc:${f.uid}`),
    ];
    setColOrder((prev) => {
      const existing = prev.filter((id) => allIds.includes(id));
      const newIds = allIds.filter((id) => !prev.includes(id));
      if (existing.length === prev.length && newIds.length === 0) return prev;
      return [...existing, ...newIds];
    });
  }, [columns, joinedCols, formulaCols]);

  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;
  const { data: recsResult } = useQuery({
    queryKey: [...recsKey, page],
    queryFn: () => getRecords(datasetId!, { search: search || undefined, skip: page * PAGE_SIZE, limit: PAGE_SIZE }),
  });
  const records = recsResult?.data ?? [];
  const totalRecords = recsResult?.total ?? 0;

  const currentDataset = datasets.find((d) => d.id === datasetId);

  const uniqueSourceIds = useMemo(
    () => [...new Set(joinedCols.map((j) => j.sourceDatasetId))],
    [joinedCols]
  );
  const sourceQueries = useQueries({
    queries: uniqueSourceIds.map((dsId) => ({
      queryKey: ["records", dsId, "join-lookup"],
      queryFn: () => getRecords(dsId, { limit: 1000 }).then((r) => r.data),
      staleTime: 60_000,
    })),
  });

  const extraColumns: ExtraColumn[] = useMemo(() => {
    return joinedCols.map((def) => {
      const srcIdx = uniqueSourceIds.indexOf(def.sourceDatasetId);
      const sourceRecs = sourceQueries[srcIdx]?.data ?? [];
      const lookup = new Map(
        sourceRecs.map((r) => [
          def.sourcePkKey === "__id__" || def.sourcePkKey === "id"
            ? r.id
            : String(r.data[def.sourcePkKey] ?? ""),
          String(r.data[def.displayKey] ?? ""),
        ])
      );
      return {
        uid: def.uid,
        header: `${def.sourceDatasetName} › ${def.displayName}`,
        fkKey: def.localFkKey,
        lookup,
        onRemove: () => setJoinedCols((prev) => prev.filter((j) => j.uid !== def.uid)),
      };
    });
  }, [joinedCols, sourceQueries, uniqueSourceIds]);

  const filteredRecords = useMemo(() => {
    const activeFilters = Object.entries(columnFilters).filter(([, v]) => v);
    if (activeFilters.length === 0) return records;
    return records.filter((rec) =>
      activeFilters.every(([key, val]) =>
        String(rec.data[key] ?? "").toLowerCase().includes(val.toLowerCase())
      )
    );
  }, [records, columnFilters]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenCols.has(c.id)),
    [columns, hiddenCols]
  );

  const sampleRecord = filteredRecords[0]?.data as Record<string, unknown> | undefined;
  const activeFilterCount = Object.values(columnFilters).filter(Boolean).length;
  const hiddenCount = hiddenCols.size;

  // Mutations
  const addColMut = useMutation({
    mutationFn: (body: Omit<ColumnDefinition, "id" | "dataset_id" | "created_at">) =>
      createColumn(datasetId!, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: colsKey }); setShowAddCol(false); },
  });
  const addRowMut = useMutation({
    mutationFn: () => createRecord(datasetId!, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: recsKey }),
  });
  const updateMut = useMutation({
    mutationFn: ({ recordId, fieldKey, value }: { recordId: string; fieldKey: string; value: unknown }) =>
      updateRecord(datasetId!, recordId, { [fieldKey]: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: recsKey }),
  });
  const deleteMut = useMutation({
    mutationFn: (recordId: string) => deleteRecord(datasetId!, recordId),
    onSuccess: () => qc.invalidateQueries({ queryKey: recsKey }),
  });
  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => bulkDelete(datasetId!, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recsKey });
      setSelectedIds(new Set());
    },
  });
  const delColMut = useMutation({
    mutationFn: (columnId: string) => deleteColumn(datasetId!, columnId),
    onSuccess: () => qc.invalidateQueries({ queryKey: colsKey }),
  });
  const editColMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ColumnDefinition> }) =>
      updateColumn(datasetId!, id, updates),
    onSuccess: () => { qc.invalidateQueries({ queryKey: colsKey }); setEditingColumn(null); },
  });
  const reorderColMut = useMutation({
    mutationFn: async ({ fromKey, toKey }: { fromKey: string; toKey: string }) => {
      const fromIdx = columns.findIndex((c) => c.field_key === fromKey);
      const toIdx   = columns.findIndex((c) => c.field_key === toKey);
      if (fromIdx === -1 || toIdx === -1) return;
      const reordered = [...columns];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      await Promise.all(reordered.map((col, i) =>
        updateColumn(datasetId!, col.id, { position: i })
      ));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: colsKey }),
  });

  // Undo / redo
  const undoRedo = useUndoRedo((entry, direction) => {
    const value = direction === "undo" ? entry.oldValue : entry.newValue;
    updateMut.mutate({ recordId: entry.recordId, fieldKey: entry.fieldKey, value });
  });

  const handleCellChange = (recordId: string, fieldKey: string, value: unknown) => {
    const oldValue = records.find((r) => r.id === recordId)?.data[fieldKey];
    undoRedo.push({ recordId, fieldKey, oldValue, newValue: value });
    updateMut.mutate({ recordId, fieldKey, value });
  };

  const handleToggleCol = (colId: string) =>
    setHiddenCols((prev) => { const n = new Set(prev); n.has(colId) ? n.delete(colId) : n.add(colId); return n; });
  const handleFilterChange = (key: string, val: string) =>
    setColumnFilters((prev) => ({ ...prev, [key]: val }));
  const handleAddJoin = (def: Omit<JoinedColDef, "uid">) =>
    setJoinedCols((prev) => [...prev, { ...def, uid: crypto.randomUUID() }]);

  const handleAddFormula = (def: Omit<FormulaColDef, "uid">) =>
    setFormulaCols((prev) => [...prev, { ...def, uid: crypto.randomUUID() }]);
  const toggleFilters = () => { setShowFilterRow((v) => { if (v) setColumnFilters({}); return !v; }); };

  const handleExport = (format: "csv" | "xlsx") => {
    const opts = {
      datasetName: currentDataset?.name ?? "export",
      columns: visibleColumns,
      records: filteredRecords,
      extraColumns,
      formulaCols,
    };
    if (format === "csv") exportCsv(opts);
    else exportExcel(opts);
    setShowExportMenu(false);
  };

  // CSV Import — show mapping modal for .csv, direct upload for .xlsx
  const handleCsvFile = async (file: File) => {
    if (columns.length === 0) return;
    if (file.name.toLowerCase().endsWith(".csv")) {
      setCsvMappingFile(file);
    } else {
      setCsvImporting(true);
      setCsvResult(null);
      try {
        const result = await importCsv(datasetId!, file);
        qc.invalidateQueries({ queryKey: recsKey });
        setCsvResult(result);
      } finally {
        setCsvImporting(false);
      }
    }
  };

  const handleCsvMappingConfirm = async (
    mapping: Record<string, string>,
    rows: Record<string, string>[]
  ) => {
    setCsvMappingFile(null);
    setCsvImporting(true);
    setCsvResult(null);
    let created = 0;
    const errors: { row: number; errors: string[] }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const data: Record<string, string> = {};
      for (const [csvCol, fieldKey] of Object.entries(mapping)) {
        if (fieldKey && rows[i][csvCol] !== undefined) data[fieldKey] = rows[i][csvCol];
      }
      try {
        await createRecord(datasetId!, data);
        created++;
      } catch {
        errors.push({ row: i + 2, errors: ["Error al crear registro"] });
      }
    }
    qc.invalidateQueries({ queryKey: recsKey });
    setCsvResult({ created, errors });
    setCsvImporting(false);
  };

  // Saved views
  const saveCurrentView = () => {
    const name = prompt("Nombre para esta vista:");
    if (!name?.trim()) return;
    setSavedViews((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        hiddenCols: [...hiddenCols],
        columnFilters,
      },
    ]);
  };
  const applyView = (v: SavedView) => {
    setHiddenCols(new Set(v.hiddenCols));
    setColumnFilters(v.columnFilters);
    setShowSavedViews(false);
  };
  const deleteView = (id: string) =>
    setSavedViews((prev) => prev.filter((v) => v.id !== id));

  const confirm = useConfirm();
  const { user, isAdmin, isEditor, logout } = useAuth();
  const { connected: wsConnected } = useRealtimeSync(datasetId);
  const panelBadge = joinedCols.length + formulaCols.length;

  const VIEW_MODES: { key: ViewMode; label: string; icon: string }[] = [
    { key: "table", label: "Tabla", icon: "⊞" },
    { key: "kanban", label: "Kanban", icon: "▦" },
    { key: "chart", label: "Gráficos", icon: "📊" },
    { key: "trash", label: "Papelera", icon: "🗑" },
  ];

  return (
    <>
      {/* ── Header ── */}
      <header className="app-header">
        <button className="btn btn-ghost" onClick={() => navigate("/")}
          style={{ padding: "5px 8px", fontSize: 18 }} title="Volver">←</button>
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo" style={{ width: 28, height: 28, fontSize: 13, borderRadius: "var(--radius-xs)" }}>T</div>
          <span className="app-header-name">Trans<em>Excel</em></span>
        </button>
        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
        <span style={{ fontWeight: 600, fontSize: 15, color: "var(--color-text)" }}>
          {currentDataset?.name ?? "Dataset"}
        </span>
        <div className="app-header-spacer" />
        <span className="app-header-tag">
          {filteredRecords.length} filas · {visibleColumns.length} cols
          {formulaCols.length > 0 && ` · ${formulaCols.length} ƒ`}
          {joinedCols.length > 0 && ` · ${joinedCols.length} 🔗`}
        </span>
        {wsConnected && (
          <span title="Sincronización en tiempo real activa" style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 11, color: "var(--pm-green-600)", fontWeight: 600,
            background: "var(--pm-green-50)", border: "1px solid var(--pm-green-100)",
            borderRadius: 99, padding: "2px 8px",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%",
              background: "var(--pm-green-500)", display: "inline-block",
              animation: "pulse-dot 2s infinite" }} />
            Live
          </span>
        )}
        <button
          className="btn btn-secondary"
          onClick={() => setShowSchema(true)}
          disabled={columns.length === 0}
          title="Ver diagrama de relaciones"
          style={{ fontSize: 16, padding: "5px 10px" }}>
          🗺 Diagrama
        </button>
        {user && (
          <div className="header-user-menu">
            <div className="header-user-avatar" title={user.email}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="header-user-info">
              <span className="header-user-name">{user.username}</span>
              <span className={`role-badge role-badge--${user.role}`}>{user.role}</span>
            </div>
            <button className="btn btn-ghost" onClick={logout}
              title="Cerrar sesión" style={{ padding: "4px 8px", fontSize: 13 }}>
              ⎋
            </button>
          </div>
        )}
      </header>

      {/* ── Dataset info bar ── */}
      {currentDataset && (
        <div className="ds-info-bar">
          <div className="ds-info-bar-inner">
            {currentDataset.description && (
              <span className="ds-info-desc">{currentDataset.description}</span>
            )}
            <div className="ds-info-stats">
              <span className="ds-info-stat">
                <strong>{filteredRecords.length}</strong> filas
                {filteredRecords.length !== records.length && (
                  <span style={{ color: "var(--color-primary)", marginLeft: 3 }}>
                    (filtradas de {records.length})
                  </span>
                )}
              </span>
              <span className="ds-info-dot" />
              <span className="ds-info-stat"><strong>{columns.length}</strong> columnas</span>
              {formulaCols.length > 0 && <>
                <span className="ds-info-dot" />
                <span className="ds-info-stat" style={{ color: "var(--pm-violet-600)" }}>
                  <strong>{formulaCols.length}</strong> ƒ calculadas
                </span>
              </>}
              {joinedCols.length > 0 && <>
                <span className="ds-info-dot" />
                <span className="ds-info-stat" style={{ color: "var(--pm-orange-600)" }}>
                  <strong>{joinedCols.length}</strong> vinculadas
                </span>
              </>}
            </div>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <main className="page">
        {/* View mode tabs */}
        <div className="view-tabs">
          {VIEW_MODES.map((vm) => (
            <button key={vm.key}
              className={`view-tab${viewMode === vm.key ? " active" : ""}`}
              onClick={() => setViewMode(vm.key)}>
              <span style={{ marginRight: 5 }}>{vm.icon}</span>{vm.label}
              {vm.key === "trash" && <span className="view-tab-badge" />}
            </button>
          ))}
        </div>

        {/* Toolbar (only for table view) */}
        {viewMode === "table" && (
          <>
            <div className="toolbar">
              {/* Search */}
              <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                  color: "var(--color-text-muted)", pointerEvents: "none", fontSize: 14 }}>🔍</span>
                <input placeholder="Buscar en todos los campos..."
                  value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  style={{ paddingLeft: 32 }} />
              </div>

              {/* Filter toggle */}
              <button className="btn btn-secondary" onClick={toggleFilters}
                style={{
                  background: showFilterRow ? "var(--color-primary-bg)" : undefined,
                  borderColor: showFilterRow ? "var(--color-primary-border)" : undefined,
                  color: showFilterRow ? "var(--pm-green-600)" : undefined,
                }}>
                ⚡ Filtros
                {activeFilterCount > 0 && <span className="btn-badge">{activeFilterCount}</span>}
              </button>

              {/* Column panel toggle */}
              <button className="btn btn-secondary" onClick={() => setShowColPanel((v) => !v)}
                title="Columnas, vínculos y fórmulas"
                style={{
                  background: showColPanel ? "var(--color-primary-bg)" : undefined,
                  borderColor: showColPanel ? "var(--color-primary-border)" : undefined,
                  color: showColPanel ? "var(--pm-green-600)" : undefined,
                }}>
                ⊞ Columnas
                {columns.length > 0 && (
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 400 }}>
                    ({columns.length - hiddenCount}/{columns.length})
                  </span>
                )}
                {panelBadge > 0 && <span className="btn-badge">{panelBadge}</span>}
              </button>

              <div className="toolbar-sep" />

              {/* Saved views */}
              <div style={{ position: "relative" }} ref={savedViewsRef}>
                <button className="btn btn-secondary"
                  onClick={() => setShowSavedViews((v) => !v)}
                  style={{
                    background: showSavedViews ? "var(--color-primary-bg)" : undefined,
                    borderColor: showSavedViews ? "var(--color-primary-border)" : undefined,
                  }}>
                  ◉ Vistas
                  {savedViews.length > 0 && <span className="btn-badge">{savedViews.length}</span>}
                </button>
                {showSavedViews && (
                  <div className="export-menu" style={{ minWidth: 220 }}>
                    <div style={{ padding: "8px 12px 4px", borderBottom: "1px solid var(--color-border-light)" }}>
                      <button className="btn btn-primary" style={{ width: "100%", fontSize: 12 }}
                        onClick={saveCurrentView}>
                        + Guardar vista actual
                      </button>
                    </div>
                    {savedViews.length === 0 && (
                      <p style={{ padding: "12px", fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
                        No hay vistas guardadas
                      </p>
                    )}
                    {savedViews.map((v) => (
                      <div key={v.id} className="export-menu-item" style={{ cursor: "default" }}>
                        <button className="btn btn-ghost" style={{ flex: 1, textAlign: "left", fontSize: 13 }}
                          onClick={() => applyView(v)}>
                          ◉ {v.name}
                        </button>
                        <button onClick={() => deleteView(v.id)}
                          style={{ background: "none", border: "none", cursor: "pointer",
                            color: "var(--color-text-muted)", fontSize: 16, padding: "0 4px" }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ flex: 1 }} />

              <div className="toolbar-sep" />

              {/* Bulk delete — editor+ only */}
              {selectedIds.size > 0 && isEditor && (
                <button className="btn btn-danger-ghost"
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Eliminar ${selectedIds.size} registro${selectedIds.size !== 1 ? "s" : ""}`,
                      message: "Los registros se moverán a la papelera. Puedes restaurarlos desde allí.",
                      confirmLabel: "Mover a papelera",
                      variant: "danger",
                    });
                    if (ok) bulkDeleteMut.mutate([...selectedIds]);
                  }}
                  disabled={bulkDeleteMut.isPending}>
                  🗑 Eliminar ({selectedIds.size})
                </button>
              )}

              {/* CSV/Excel import — editor+ only */}
              <input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCsvFile(f);
                  e.target.value = "";
                }} />
              {isEditor && (
                <button className="btn btn-secondary"
                  onClick={() => csvInputRef.current?.click()}
                  disabled={csvImporting || columns.length === 0}
                  title="Importar CSV o Excel">
                  {csvImporting ? "Importando..." : "⬆ Importar"}
                </button>
              )}

              {/* Export dropdown */}
              <div style={{ position: "relative" }} ref={exportRef}>
                <button className="btn btn-secondary"
                  onClick={() => setShowExportMenu((v) => !v)}
                  style={{ gap: 5 }}>
                  <span style={{ fontSize: 14 }}>⬇</span> Exportar
                  <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
                </button>
                {showExportMenu && (
                  <div className="export-menu">
                    <button className="export-menu-item" onClick={() => handleExport("csv")}>
                      <span className="export-menu-icon" style={{ background: "#E8F7EE", color: "#007A36" }}>CSV</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Exportar como CSV</p>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>Compatible con cualquier herramienta</p>
                      </div>
                    </button>
                    <button className="export-menu-item" onClick={() => handleExport("xlsx")}>
                      <span className="export-menu-icon" style={{ background: "#E8F7EE", color: "#007A36" }}>XLS</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Exportar como Excel</p>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>.xlsx con anchos automáticos</p>
                      </div>
                    </button>
                    <div style={{ padding: "6px 12px 8px", borderTop: "1px solid var(--color-border-light)" }}>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>
                        {filteredRecords.length} filas visibles
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="toolbar-sep" />

              {/* Admin-only: new table + new column */}
              {isAdmin && (
                <button className="btn btn-secondary"
                  onClick={() => navigate(`/create?linkedTo=${datasetId}&linkedName=${encodeURIComponent(currentDataset?.name ?? "")}`)}
                  disabled={!currentDataset}
                  style={{ borderColor: "var(--pm-orange-500)", color: "var(--pm-orange-600)" }}>
                  🔗 Nueva tabla
                </button>
              )}
              {isAdmin && (
                <button className="btn btn-secondary" onClick={() => setShowAddCol(true)}>
                  <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span> Columna
                </button>
              )}
              {isEditor && (
                <button className="btn btn-primary"
                  onClick={() => navigate(`/datasets/${datasetId}/new`)}
                  disabled={columns.length === 0}>
                  <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span> Nuevo registro
                </button>
              )}
            </div>

            {/* CSV import result */}
            {csvResult && (
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", borderRadius: "var(--radius-sm)",
                background: csvResult.errors.length > 0 ? "var(--pm-orange-50, #fff7ed)" : "var(--color-primary-bg)",
                border: `1px solid ${csvResult.errors.length > 0 ? "var(--pm-orange-200, #fed7aa)" : "var(--color-primary-border)"}`,
                marginBottom: 12, fontSize: 13,
              }}>
                <span>✅ {csvResult.created} registro(s) importado(s)</span>
                {csvResult.errors.length > 0 && (
                  <span style={{ color: "var(--pm-orange-600)" }}>
                    · {csvResult.errors.length} fila(s) con errores
                  </span>
                )}
                <button onClick={() => setCsvResult(null)}
                  style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
                    color: "var(--color-text-muted)", fontSize: 16 }}>×</button>
              </div>
            )}

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Filtros:</span>
                {Object.entries(columnFilters).filter(([, v]) => v).map(([key, val]) => {
                  const col = columns.find((c) => c.field_key === key);
                  return (
                    <span key={key} className="filter-chip">
                      <strong>{col?.name ?? key}:</strong> {val}
                      <button onClick={() => setColumnFilters((p) => ({ ...p, [key]: "" }))}>×</button>
                    </span>
                  );
                })}
                <button className="btn btn-ghost" onClick={() => setColumnFilters({})}
                  style={{ fontSize: 12, padding: "2px 8px" }}>Limpiar todo</button>
              </div>
            )}
          </>
        )}

        {/* ── Views ── */}
        {viewMode === "table" && (
          columns.length === 0 ? (
            <div className="empty card">
              <div className="empty-icon">📋</div>
              <h3 style={{ color: "var(--color-text-secondary)" }}>Dataset vacío</h3>
              <p>Agrega columnas para empezar a registrar datos.</p>
              <button className="btn btn-primary" onClick={() => setShowAddCol(true)} style={{ marginTop: 16 }}>
                + Agregar primera columna
              </button>
            </div>
          ) : (
            <DataGrid
              columns={visibleColumns}
              records={filteredRecords}
              extraColumns={extraColumns}
              formulaCols={formulaCols}
              showFilterRow={showFilterRow}
              columnFilters={columnFilters}
              onFilterChange={handleFilterChange}
              onCellChange={handleCellChange}
              onAddRow={() => addRowMut.mutate()}
              onDeleteRow={(recordId) => deleteMut.mutate(recordId)}
              onDeleteColumn={isAdmin ? (colId) => delColMut.mutate(colId) : undefined}
              onEditColumn={isAdmin ? setEditingColumn : undefined}
              columnOrder={colOrder}
              onReorderAny={isAdmin ? (fromId, toId) => {
                setColOrder((prev) => {
                  const arr = [...prev];
                  const from = arr.indexOf(fromId);
                  const to = arr.indexOf(toId);
                  if (from === -1 || to === -1) return prev;
                  const [item] = arr.splice(from, 1);
                  arr.splice(to, 0, item);
                  return arr;
                });
                // Persist regular column positions to backend
                if (!fromId.startsWith('ec:') && !fromId.startsWith('fc:') &&
                    !toId.startsWith('ec:') && !toId.startsWith('fc:')) {
                  reorderColMut.mutate({ fromKey: fromId, toKey: toId });
                }
              } : undefined}
              onRemoveFormula={(uid) => setFormulaCols((prev) => prev.filter((f) => f.uid !== uid))}
              onShowHistory={setHistoryRecordId}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
          )
        )}

        {/* Pagination controls */}
        {viewMode === "table" && totalRecords > PAGE_SIZE && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:12, padding:"0 2px" }}>
            <span style={{ fontSize:12, color:"var(--color-text-muted)" }}>
              Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalRecords)} de {totalRecords} registros
            </span>
            <div style={{ display:"flex", gap:4 }}>
              <button className="btn btn-secondary" style={{ height:28, fontSize:12, padding:"0 10px" }}
                onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                ← Anterior
              </button>
              {Array.from({ length: Math.ceil(totalRecords / PAGE_SIZE) }, (_, i) => i)
                .filter((i) => Math.abs(i - page) <= 2)
                .map((i) => (
                  <button key={i}
                    className={`btn ${i === page ? "btn-primary" : "btn-secondary"}`}
                    style={{ height:28, fontSize:12, padding:"0 10px", minWidth:32 }}
                    onClick={() => setPage(i)}>
                    {i + 1}
                  </button>
                ))}
              <button className="btn btn-secondary" style={{ height:28, fontSize:12, padding:"0 10px" }}
                onClick={() => setPage((p) => Math.min(Math.ceil(totalRecords / PAGE_SIZE) - 1, p + 1))}
                disabled={page >= Math.ceil(totalRecords / PAGE_SIZE) - 1}>
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {viewMode === "kanban" && (
          <KanbanView
            columns={visibleColumns}
            records={filteredRecords}
            onCellChange={handleCellChange}
          />
        )}

        {viewMode === "chart" && (
          <ChartPanel columns={visibleColumns} records={filteredRecords} />
        )}

        {viewMode === "trash" && (
          <TrashPanel datasetId={datasetId!} columns={columns} />
        )}

        {/* Related datasets (only in table/kanban view) */}
        {viewMode !== "trash" && viewMode !== "chart" && currentDataset && (
          <RelatedDatasets
            currentDatasetId={datasetId!}
            currentDatasetName={currentDataset.name}
            currentColumns={columns}
          />
        )}
      </main>

      {showAddCol && (
        <AddColumnModal onSave={(col) => addColMut.mutate(col)} onClose={() => setShowAddCol(false)} />
      )}

      {historyRecordId && (
        <RecordHistoryPanel
          datasetId={datasetId!}
          recordId={historyRecordId}
          columns={columns}
          onClose={() => setHistoryRecordId(null)}
        />
      )}

      {showSchema && currentDataset && (
        <SchemaDiagram
          currentDatasetId={datasetId!}
          currentDatasetName={currentDataset.name}
          currentColumns={columns}
          onClose={() => setShowSchema(false)}
        />
      )}

      {editingColumn && (
        <EditColumnModal
          column={editingColumn}
          onSave={(updates) => editColMut.mutate({ id: editingColumn.id, updates })}
          onClose={() => setEditingColumn(null)}
        />
      )}

      {csvMappingFile && (
        <CsvMappingModal
          file={csvMappingFile}
          columns={columns}
          onConfirm={handleCsvMappingConfirm}
          onClose={() => setCsvMappingFile(null)}
        />
      )}

      {showColPanel && (
        <ColumnPanel
          currentDatasetId={datasetId!}
          currentDatasetName={currentDataset?.name ?? ""}
          columns={columns}
          hiddenCols={hiddenCols}
          joinedCols={joinedCols}
          formulaCols={formulaCols}
          onToggleCol={handleToggleCol}
          onAddJoin={handleAddJoin}
          onRemoveJoin={(uid) => setJoinedCols((prev) => prev.filter((j) => j.uid !== uid))}
          onAddFormula={handleAddFormula}
          onRemoveFormula={(uid) => setFormulaCols((prev) => prev.filter((f) => f.uid !== uid))}
          sampleRecord={sampleRecord}
          onClose={() => setShowColPanel(false)}
        />
      )}
    </>
  );
}

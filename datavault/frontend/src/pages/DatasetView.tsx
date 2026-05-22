import React, { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
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
import RelatedRecordsPanel from "../components/RelatedRecordsPanel";
import LinkTableModal from "../components/LinkTableModal";
import CsvMappingModal from "../components/CsvMappingModal";
import SearchReplaceModal from "../components/SearchReplaceModal";
import ConditionalFormattingModal, { type CondRule } from "../components/ConditionalFormattingModal";
import { useConfirm } from "../components/ConfirmDialog";
import type { ColumnDefinition, JoinedColDef, FormulaColDef } from "../types";
import { exportCsv, exportExcel } from "../utils/export";
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
  const [, setShowSavedViews] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [historyRecordId, setHistoryRecordId] = useState<string | null>(null);
  const [relatedPanelRecordId, setRelatedPanelRecordId] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingColumn, setEditingColumn] = useState<ColumnDefinition | null>(null);
  const [csvMappingFile, setCsvMappingFile] = useState<File | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const exportRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ created: number; errors: { row: number; errors: string[] }[] } | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showSearchReplace, setShowSearchReplace] = useState(false);
  const [showCondFormat, setShowCondFormat] = useState(false);
  const [conditionalRules, setConditionalRules] = useState<CondRule[]>(() => {
    try {
      const s = localStorage.getItem(`dv_cond_rules_${datasetId}`);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`dv_cond_rules_${datasetId}`, JSON.stringify(conditionalRules));
    } catch { /* ignore quota */ }
  }, [conditionalRules, datasetId]);

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
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node))
        setShowMoreMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const colsKey = ["columns", datasetId];
  const recsKey = ["records", datasetId, search];

  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });
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
  const currentWorkspaceId = currentDataset?.workspace_id ?? undefined;

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
  const { current: currentWs } = useWorkspace();
  const wsRole = currentWs?.my_role;
  const effectiveIsEditor = isEditor || ["member", "admin_ws", "owner"].includes(wsRole ?? "");
  const effectiveIsAdmin  = isAdmin  || wsRole === "owner";
  const { connected: wsConnected } = useRealtimeSync(datasetId);
  const panelBadge = joinedCols.length + formulaCols.length;

  const VIEW_MODES: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: "table",  label: "Tabla",    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg> },
    { key: "kanban", label: "Kanban",   icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="6" height="18" rx="1"/><rect x="9" y="3" width="6" height="12" rx="1"/><rect x="16" y="3" width="6" height="15" rx="1"/></svg> },
    { key: "chart",  label: "Gráficos", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
    { key: "trash",  label: "Papelera", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg> },
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
              <div style={{ position: "relative", flex: "1 1 180px", maxWidth: 280 }}>
                <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input placeholder="Buscar..."
                  value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  style={{ paddingLeft: 30 }} />
              </div>

              {/* Filter toggle */}
              <button className="btn btn-secondary" onClick={toggleFilters}
                style={{
                  background: showFilterRow ? "var(--color-primary-bg)" : undefined,
                  borderColor: showFilterRow ? "var(--color-primary-border)" : undefined,
                  color: showFilterRow ? "var(--pm-green-600)" : undefined,
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                Filtros
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
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="18"/></svg>
                Columnas
                {columns.length > 0 && (
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 400 }}>
                    {columns.length - hiddenCount}/{columns.length}
                  </span>
                )}
                {panelBadge > 0 && <span className="btn-badge">{panelBadge}</span>}
              </button>

              <div style={{ flex: 1 }} />

              {/* Selection actions — only visible when rows are selected */}
              {selectedIds.size === 1 && (
                <button className="btn btn-secondary"
                  style={{ borderColor: "var(--pm-violet-100)", color: "var(--pm-violet-600)" }}
                  onClick={() => setRelatedPanelRecordId([...selectedIds][0])}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Relacionados
                </button>
              )}
              {selectedIds.size > 0 && effectiveIsEditor && (
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
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                  Eliminar ({selectedIds.size})
                </button>
              )}

              {/* CSV/Excel import — editor+ only */}
              <input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ""; }} />
              {effectiveIsEditor && (
                <button className="btn btn-secondary"
                  onClick={() => csvInputRef.current?.click()}
                  disabled={csvImporting || columns.length === 0}
                  title="Importar CSV o Excel">
                  {csvImporting
                    ? <><span className="csv-loading-spinner" style={{ width: 11, height: 11 }} /> Importando…</>
                    : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Importar</>
                  }
                </button>
              )}

              {/* Export dropdown */}
              <div style={{ position: "relative" }} ref={exportRef}>
                <button className="btn btn-secondary" onClick={() => setShowExportMenu((v) => !v)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Exportar
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {showExportMenu && (
                  <div className="export-menu">
                    <button className="export-menu-item" onClick={() => { handleExport("csv"); setShowExportMenu(false); }}>
                      <span className="export-menu-icon" style={{ background: "#E8F7EE", color: "#007A36" }}>CSV</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Exportar como CSV</p>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>Compatible con cualquier herramienta</p>
                      </div>
                    </button>
                    <button className="export-menu-item" onClick={() => { handleExport("xlsx"); setShowExportMenu(false); }}>
                      <span className="export-menu-icon" style={{ background: "#E8F7EE", color: "#007A36" }}>XLS</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Exportar como Excel</p>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>.xlsx con anchos automáticos</p>
                      </div>
                    </button>
                    <div style={{ padding: "6px 12px 8px", borderTop: "1px solid var(--color-border-light)" }}>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>{filteredRecords.length} filas visibles</p>
                    </div>
                  </div>
                )}
              </div>

              {/* ⋯ Más — vistas, diagrama, vincular */}
              <div style={{ position: "relative" }} ref={moreMenuRef}>
                <button className="btn btn-secondary" onClick={() => setShowMoreMenu((v) => !v)}
                  title="Más opciones"
                  style={{ background: showMoreMenu ? "var(--color-primary-bg)" : undefined, borderColor: showMoreMenu ? "var(--color-primary-border)" : undefined }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                  {(savedViews.length > 0) && <span className="btn-badge">{savedViews.length}</span>}
                </button>
                {showMoreMenu && (
                  <div className="export-menu" style={{ minWidth: 240, right: 0, left: "auto" }}>
                    {/* Saved views section */}
                    <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid var(--color-border-light)" }}>
                      <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)" }}>Vistas guardadas</p>
                      <button className="btn btn-primary" style={{ width: "100%", fontSize: 12 }} onClick={() => { saveCurrentView(); }}>
                        + Guardar vista actual
                      </button>
                      {savedViews.length === 0 && (
                        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>No hay vistas guardadas</p>
                      )}
                      {savedViews.map((v) => (
                        <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                          <button className="btn btn-ghost" style={{ flex: 1, textAlign: "left", fontSize: 12, height: 28 }} onClick={() => { applyView(v); setShowMoreMenu(false); }}>
                            ◉ {v.name}
                          </button>
                          <button onClick={() => deleteView(v.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 15, padding: "0 4px", lineHeight: 1 }}>×</button>
                        </div>
                      ))}
                    </div>
                    {/* Other actions */}
                    <button className="export-menu-item" onClick={() => { setShowSchema(true); setShowMoreMenu(false); }} disabled={columns.length === 0}>
                      <span className="export-menu-icon" style={{ background: "#F0F9FF", color: "#0284C7" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/></svg>
                      </span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Ver diagrama</p>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>Relaciones entre datasets</p>
                      </div>
                    </button>
                    {effectiveIsAdmin && (
                      <button className="export-menu-item" onClick={() => { setShowLinkModal(true); setShowMoreMenu(false); }} disabled={!currentDataset}>
                        <span className="export-menu-icon" style={{ background: "#FFF0F6", color: "#DB2777" }}>⇢</span>
                        <div>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Vincular tabla</p>
                          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>Crear columna FK hacia otro dataset</p>
                        </div>
                      </button>
                    )}
                    <button className="export-menu-item" onClick={() => { setShowSearchReplace(true); setShowMoreMenu(false); }}>
                      <span className="export-menu-icon" style={{ background: "#FEF3C7", color: "#92400E" }}>🔍</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Buscar y reemplazar</p>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>Ctrl+H · sustituir en lote por columna o tabla</p>
                      </div>
                    </button>
                    {effectiveIsEditor && (
                      <button className="export-menu-item" onClick={() => { setShowCondFormat(true); setShowMoreMenu(false); }}>
                        <span className="export-menu-icon" style={{ background: "#F3E8FF", color: "#6B21A8" }}>🎨</span>
                        <div>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Formato condicional</p>
                          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>
                            Pintar celdas por regla{conditionalRules.length > 0 ? ` · ${conditionalRules.length} activa${conditionalRules.length !== 1 ? "s" : ""}` : ""}
                          </p>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="toolbar-sep" />

              {/* Admin: add column */}
              {effectiveIsAdmin && (
                <button className="btn btn-secondary" onClick={() => setShowAddCol(true)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Columna
                </button>
              )}

              {/* Editor+: new record */}
              {effectiveIsEditor && (
                <button className="btn btn-primary"
                  onClick={() => navigate(`/datasets/${datasetId}/new`)}
                  disabled={columns.length === 0}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Nuevo registro
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
              onDeleteColumn={effectiveIsAdmin ? (colId) => delColMut.mutate(colId) : undefined}
              onEditColumn={effectiveIsAdmin ? setEditingColumn : undefined}
              columnOrder={colOrder}
              onReorderAny={effectiveIsAdmin ? (fromId, toId) => {
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
              conditionalRules={conditionalRules}
              onOpenSearchReplace={() => setShowSearchReplace(true)}
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
            workspaceId={currentWorkspaceId}
          />
        )}
      </main>

      {showAddCol && (
        <AddColumnModal onSave={(col) => addColMut.mutate(col)} onClose={() => setShowAddCol(false)} />
      )}

      {showLinkModal && currentDataset && (
        <LinkTableModal
          currentDatasetId={datasetId!}
          currentDatasetName={currentDataset.name}
          onSave={(col) => { addColMut.mutate(col); setShowLinkModal(false); }}
          onClose={() => setShowLinkModal(false)}
        />
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
          workspaceId={currentWorkspaceId}
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

      {showSearchReplace && (
        <SearchReplaceModal
          columns={columns}
          records={records}
          onApply={(recordId, fieldKey, newValue) => handleCellChange(recordId, fieldKey, newValue)}
          onClose={() => setShowSearchReplace(false)}
        />
      )}

      {showCondFormat && (
        <ConditionalFormattingModal
          columns={columns}
          rules={conditionalRules}
          onChange={setConditionalRules}
          onClose={() => setShowCondFormat(false)}
        />
      )}

      {relatedPanelRecordId && (() => {
        const rec = records.find((r) => r.id === relatedPanelRecordId);
        return rec ? (
          <RelatedRecordsPanel
            parentDatasetId={datasetId!}
            parentRecord={rec}
            parentColumns={columns}
            onClose={() => setRelatedPanelRecordId(null)}
          />
        ) : null;
      })()}

      {showColPanel && (
        <ColumnPanel
          currentDatasetId={datasetId!}
          currentDatasetName={currentDataset?.name ?? ""}
          workspaceId={currentWorkspaceId}
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

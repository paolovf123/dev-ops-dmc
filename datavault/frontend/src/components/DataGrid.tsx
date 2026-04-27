import { useState, useMemo, useRef, useCallback } from "react";
import type { ColumnDefinition, Record as DRecord, FormulaColDef } from "../types";
import { evalFormula } from "../utils/formula";
import CellEditor, { type NavDir } from "./CellEditor";
import { useConfirm } from "./ConfirmDialog";

export interface ExtraColumn {
  uid: string;
  header: string;
  fkKey: string;
  lookup: Map<string, string>;
  onRemove: () => void;
}

interface Props {
  columns: ColumnDefinition[];
  records: DRecord[];
  extraColumns?: ExtraColumn[];
  formulaCols?: FormulaColDef[];
  showFilterRow?: boolean;
  columnFilters?: Record<string, string>;
  onFilterChange?: (key: string, val: string) => void;
  onCellChange: (recordId: string, fieldKey: string, value: unknown) => void;
  onAddRow: () => void;
  onDeleteRow: (recordId: string) => void;
  onDeleteColumn?: (columnId: string) => void;
  onEditColumn?: (column: ColumnDefinition) => void;
  onReorderColumns?: (fromKey: string, toKey: string) => void;
  onReorderExtraColumns?: (fromUid: string, toUid: string) => void;
  onReorderFormulaCols?: (fromUid: string, toUid: string) => void;
  onRemoveFormula?: (uid: string) => void;
  onShowHistory?: (recordId: string) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

// ── Cell validation ────────────────────────────────────────────────────────────
function validateCell(value: unknown, col: ColumnDefinition): string | null {
  const rules = col.rules || {};
  const empty = value == null || value === "";
  if (empty) return rules.required ? "Requerido" : null;
  if (col.data_type === "number") {
    const n = parseFloat(String(value));
    if (isNaN(n)) return "Debe ser un número";
    if (rules.min !== undefined && n < rules.min) return `Mín: ${rules.min}`;
    if (rules.max !== undefined && n > rules.max) return `Máx: ${rules.max}`;
  }
  if (col.data_type === "enum") {
    if (!(rules.options ?? []).includes(String(value))) return "Valor no válido";
  }
  return null;
}

function FormulaCell({ formula, data }: { formula: string; data: Record<string, unknown> }) {
  const result = evalFormula(formula, data);
  if (result === null) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  if (String(result).startsWith("#"))
    return <span style={{ color: "var(--pm-red-500)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{String(result)}</span>;
  return <>{String(result)}</>;
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="sort-icon sort-icon--inactive">↕</span>;
  return <span className="sort-icon sort-icon--active">{dir === "asc" ? "↑" : "↓"}</span>;
}

export default function DataGrid({
  columns, records, extraColumns = [], formulaCols = [],
  showFilterRow, columnFilters = {}, onFilterChange,
  onCellChange, onAddRow, onDeleteRow, onDeleteColumn, onEditColumn,
  onReorderColumns, onReorderExtraColumns, onReorderFormulaCols, onRemoveFormula,
  onShowHistory,
  selectedIds, onSelectionChange,
}: Props) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ recordId: string; fieldKey: string } | null>(null);
  const [focused, setFocused] = useState<{ recordId: string; fieldKey: string } | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const dragColKey = useRef<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const handleSortClick = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortedRecords = useMemo(() => {
    if (!sortKey) return records;
    return [...records].sort((a, b) => {
      const av = String(a.data[sortKey] ?? "");
      const bv = String(b.data[sortKey] ?? "");
      const cmp = av.localeCompare(bv, "es", { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [records, sortKey, sortDir]);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const navigateTo = useCallback((recordId: string, fieldKey: string, startEditing = false) => {
    if (startEditing) {
      setEditing({ recordId, fieldKey });
      setFocused({ recordId, fieldKey });
    } else {
      setEditing(null);
      setFocused({ recordId, fieldKey });
    }
  }, []);

  const navigate = useCallback((from: { recordId: string; fieldKey: string }, dir: NavDir, startEditing = false) => {
    const rowIdx = sortedRecords.findIndex((r) => r.id === from.recordId);
    const colIdx = columns.findIndex((c) => c.field_key === from.fieldKey);
    if (rowIdx === -1 || colIdx === -1) return;

    let nextRow = rowIdx, nextCol = colIdx;
    if (dir === "next-col") {
      if (colIdx < columns.length - 1) nextCol = colIdx + 1;
      else { nextCol = 0; nextRow = Math.min(rowIdx + 1, sortedRecords.length - 1); }
    } else if (dir === "prev-col") {
      if (colIdx > 0) nextCol = colIdx - 1;
      else { nextCol = columns.length - 1; nextRow = Math.max(rowIdx - 1, 0); }
    } else if (dir === "next-row") {
      nextRow = Math.min(rowIdx + 1, sortedRecords.length - 1);
    } else if (dir === "prev-row") {
      nextRow = Math.max(rowIdx - 1, 0);
    }

    const rec = sortedRecords[nextRow];
    const col = columns[nextCol];
    if (rec && col && !rec.deleted_at) navigateTo(rec.id, col.field_key, startEditing);
  }, [sortedRecords, columns, navigateTo]);

  const handleCommit = useCallback((recordId: string, fieldKey: string, value: unknown, nav?: NavDir) => {
    onCellChange(recordId, fieldKey, value);
    if (nav) navigate({ recordId, fieldKey }, nav, true);
    else { setEditing(null); setFocused({ recordId, fieldKey }); }
  }, [onCellChange, navigate]);

  // ── Table-level keyboard handler (when focused but not editing) ────────────
  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return; // CellEditor handles its own keys
    const anchor = focused;
    if (!anchor) return;

    const dirMap: Record<string, NavDir> = {
      ArrowRight: "next-col", ArrowLeft: "prev-col",
      ArrowDown: "next-row", ArrowUp: "prev-row",
      Tab: e.shiftKey ? "prev-col" : "next-col",
    };

    if (dirMap[e.key]) { e.preventDefault(); navigate(anchor, dirMap[e.key], false); return; }
    if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); setEditing(anchor); return; }
    if (e.key === "Escape") { setFocused(null); return; }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onCellChange(anchor.recordId, anchor.fieldKey, "");
      return;
    }
    // Start typing → open editor
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      setEditing(anchor);
    }
  };

  // ── Paste from Excel (TSV) ─────────────────────────────────────────────────
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (editing) return; // let CellEditor handle paste in cell
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
    if (lines.length === 0) return;

    const anchor = focused ?? (
      sortedRecords[0] && columns[0]
        ? { recordId: sortedRecords[0].id, fieldKey: columns[0].field_key }
        : null
    );
    if (!anchor) return;

    e.preventDefault();

    const startRow = sortedRecords.findIndex((r) => r.id === anchor.recordId);
    const startCol = columns.findIndex((c) => c.field_key === anchor.fieldKey);
    if (startRow === -1 || startCol === -1) return;

    lines.forEach((line, ri) => {
      const cells = line.split("\t");
      cells.forEach((val, ci) => {
        const r = sortedRecords[startRow + ri];
        const c = columns[startCol + ci];
        if (r && c && !r.deleted_at) onCellChange(r.id, c.field_key, val.trim());
      });
    });
  }, [editing, focused, sortedRecords, columns, onCellChange]);

  // ── Copy selected cells as TSV ─────────────────────────────────────────────
  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    if (editing) return;
    if (!selectedIds || selectedIds.size === 0) return;
    const rows = sortedRecords.filter((r) => selectedIds.has(r.id));
    const tsv = rows.map((r) => columns.map((c) => String(r.data[c.field_key] ?? "")).join("\t")).join("\n");
    e.preventDefault();
    e.clipboardData.setData("text/plain", tsv);
  }, [editing, selectedIds, sortedRecords, columns]);

  // ── Selection ──────────────────────────────────────────────────────────────
  const hasSelection = !!onSelectionChange;
  const allSelected = hasSelection && sortedRecords.length > 0 && selectedIds!.size === sortedRecords.length;
  const toggleSelectAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? new Set() : new Set(sortedRecords.map((r) => r.id)));
  };
  const toggleSelectOne = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const n = new Set(selectedIds);
    n.has(id) ? n.delete(id) : n.add(id);
    onSelectionChange(n);
  };

  const totalExtra = extraColumns.length + formulaCols.length;

  return (
    <div>
      <div
        className="table-wrap"
        ref={tableRef}
        tabIndex={0}
        onKeyDown={handleTableKeyDown}
        onPaste={handlePaste}
        onCopy={handleCopy}
        style={{ outline: "none" }}
      >
        <table className="data-table">
          <thead>
            <tr>
              {hasSelection && (
                <th style={{ width: 36, textAlign: "center" }} className="col-frozen">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                </th>
              )}
              <th className="col-rownum col-frozen">#</th>

              {columns.map((col) => (
                <th key={col.id}
                  className={`th-sortable${dragOverKey === col.field_key ? " th-drag-over" : ""}`}
                  onClick={() => handleSortClick(col.field_key)}
                  title={`Ordenar por ${col.name}`}
                  draggable={!!onReorderColumns}
                  onDragStart={(e) => {
                    dragColKey.current = col.field_key;
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverKey(col.field_key); }}
                  onDragLeave={() => setDragOverKey(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverKey(null);
                    if (dragColKey.current && dragColKey.current !== col.field_key)
                      onReorderColumns?.(dragColKey.current, col.field_key);
                    dragColKey.current = null;
                  }}
                  onDragEnd={() => { dragColKey.current = null; setDragOverKey(null); }}>
                  <span className="th-inner">
                    {onReorderColumns && (
                      <span className="col-drag-handle" title="Arrastrar para reordenar">⠿</span>
                    )}
                    <span className="th-col-name">{col.name}</span>
                    <span className="th-col-right">
                      <span className={`col-type col-type-${col.data_type}`}>{col.data_type}</span>
                      <SortIcon active={sortKey === col.field_key} dir={sortDir} />
                      {onEditColumn && (
                        <button className="col-edit-btn" title={`Editar "${col.name}"`}
                          onClick={(e) => { e.stopPropagation(); onEditColumn(col); }}>
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                            <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.4"
                              strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                      {onDeleteColumn && (
                        <button className="col-del-btn" title={`Eliminar "${col.name}"`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = await confirm({
                              title: `Eliminar columna "${col.name}"`,
                              message: "Se eliminará la columna y todos sus datos. Esta acción no se puede deshacer.",
                              confirmLabel: "Eliminar",
                              variant: "danger",
                            });
                            if (ok) onDeleteColumn(col.id);
                          }}>
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                            <path d="M2 4h12M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M4.5 4l.7 8.3a1 1 0 0 0 1 .7h3.6a1 1 0 0 0 1-.7L11.5 4"
                              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                    </span>
                  </span>
                </th>
              ))}

              {extraColumns.map((ec) => (
                <th key={ec.uid}
                  className={`th-joined${dragOverKey === `ec:${ec.uid}` ? " th-drag-over" : ""}`}
                  draggable={!!onReorderExtraColumns}
                  onDragStart={onReorderExtraColumns ? (e) => {
                    dragColKey.current = `ec:${ec.uid}`;
                    e.dataTransfer.effectAllowed = "move";
                  } : undefined}
                  onDragOver={onReorderExtraColumns ? (e) => { e.preventDefault(); setDragOverKey(`ec:${ec.uid}`); } : undefined}
                  onDragLeave={onReorderExtraColumns ? () => setDragOverKey(null) : undefined}
                  onDrop={onReorderExtraColumns ? (e) => {
                    e.preventDefault(); setDragOverKey(null);
                    const from = dragColKey.current;
                    if (from && from !== `ec:${ec.uid}` && from.startsWith("ec:"))
                      onReorderExtraColumns(from.slice(3), ec.uid);
                    dragColKey.current = null;
                  } : undefined}
                  onDragEnd={onReorderExtraColumns ? () => { dragColKey.current = null; setDragOverKey(null); } : undefined}
                >
                  <span className="th-inner">
                    {onReorderExtraColumns && (
                      <span className="col-drag-handle" title="Arrastrar para reordenar">⠿</span>
                    )}
                    <span>🔗 {ec.header}</span>
                  </span>
                  <button onClick={ec.onRemove} title="Quitar columna vinculada" className="col-del-btn"
                    style={{ color: "var(--pm-orange-600)" }}>×</button>
                </th>
              ))}

              {formulaCols.map((fc) => (
                <th key={fc.uid}
                  className={`th-formula${dragOverKey === `fc:${fc.uid}` ? " th-drag-over" : ""}`}
                  title={`=${fc.formula}`}
                  draggable={!!onReorderFormulaCols}
                  onDragStart={onReorderFormulaCols ? (e) => {
                    dragColKey.current = `fc:${fc.uid}`;
                    e.dataTransfer.effectAllowed = "move";
                  } : undefined}
                  onDragOver={onReorderFormulaCols ? (e) => { e.preventDefault(); setDragOverKey(`fc:${fc.uid}`); } : undefined}
                  onDragLeave={onReorderFormulaCols ? () => setDragOverKey(null) : undefined}
                  onDrop={onReorderFormulaCols ? (e) => {
                    e.preventDefault(); setDragOverKey(null);
                    const from = dragColKey.current;
                    if (from && from !== `fc:${fc.uid}` && from.startsWith("fc:"))
                      onReorderFormulaCols(from.slice(3), fc.uid);
                    dragColKey.current = null;
                  } : undefined}
                  onDragEnd={onReorderFormulaCols ? () => { dragColKey.current = null; setDragOverKey(null); } : undefined}
                >
                  <span className="th-inner">
                    {onReorderFormulaCols && (
                      <span className="col-drag-handle" title="Arrastrar para reordenar">⠿</span>
                    )}
                    <span><span style={{ marginRight: 4 }}>ƒ</span>{fc.name}</span>
                  </span>
                  {onRemoveFormula && (
                    <button onClick={() => onRemoveFormula(fc.uid)} title="Quitar columna calculada"
                      className="col-del-btn" style={{ color: "var(--pm-violet-600)" }}>×</button>
                  )}
                </th>
              ))}

              <th className="col-actions" />
            </tr>

            {showFilterRow && (
              <tr className="filter-row">
                {hasSelection && <td />}
                <td />
                {columns.map((col) => (
                  <td key={col.id}>
                    {col.data_type === "enum" ? (
                      <select value={columnFilters[col.field_key] ?? ""}
                        onChange={(e) => onFilterChange?.(col.field_key, e.target.value)}>
                        <option value="">Todos</option>
                        {(col.rules.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input placeholder="Filtrar…"
                        value={columnFilters[col.field_key] ?? ""}
                        onChange={(e) => onFilterChange?.(col.field_key, e.target.value)} />
                    )}
                  </td>
                ))}
                {extraColumns.map((ec) => <td key={ec.uid} />)}
                {formulaCols.map((fc) => <td key={fc.uid} />)}
                <td />
              </tr>
            )}
          </thead>

          <tbody>
            {sortedRecords.length === 0 && (
              <tr>
                <td colSpan={columns.length + totalExtra + 2}
                  style={{ textAlign: "center", padding: "48px 16px", color: "var(--color-text-muted)", cursor: "default" }}>
                  Sin registros
                </td>
              </tr>
            )}

            {sortedRecords.map((rec, rowIdx) => (
              <tr key={rec.id}
                className={[
                  rec.deleted_at ? "row-deleted" : undefined,
                  hasSelection && selectedIds?.has(rec.id) ? "row-selected" : undefined,
                ].filter(Boolean).join(" ") || undefined}>

                {hasSelection && (
                  <td style={{ textAlign: "center" }} className="col-frozen">
                    <input type="checkbox"
                      checked={selectedIds?.has(rec.id) ?? false}
                      onChange={() => toggleSelectOne(rec.id)} />
                  </td>
                )}

                <td className="col-rownum-cell col-frozen">{rowIdx + 1}</td>

                {columns.map((col) => {
                  const isEditing = editing?.recordId === rec.id && editing.fieldKey === col.field_key;
                  const isFocused = !isEditing && focused?.recordId === rec.id && focused.fieldKey === col.field_key;
                  const cellVal = rec.data[col.field_key];
                  const validationError = !rec.deleted_at ? validateCell(cellVal, col) : null;
                  return (
                    <td key={col.id}
                      className={[
                        isEditing ? "cell-editing" : undefined,
                        isFocused ? "cell-focused" : undefined,
                        cellVal == null ? "cell-null" : undefined,
                        validationError ? "cell-invalid" : undefined,
                      ].filter(Boolean).join(" ") || undefined}
                      title={validationError ?? undefined}
                      onClick={() => {
                        if (rec.deleted_at) return;
                        setEditing({ recordId: rec.id, fieldKey: col.field_key });
                        setFocused({ recordId: rec.id, fieldKey: col.field_key });
                      }}>
                      {isEditing ? (
                        <CellEditor column={col} value={cellVal}
                          onCommit={(v, nav) => handleCommit(rec.id, col.field_key, v, nav)}
                          onCancel={() => { setEditing(null); setFocused({ recordId: rec.id, fieldKey: col.field_key }); }} />
                      ) : (
                        <span className="cell-inner">
                          {col.data_type === "boolean" && cellVal != null
                            ? (cellVal === true || String(cellVal).toLowerCase() === "true"
                                ? <span style={{ color: "var(--pm-green-600)", fontWeight: 600 }}>Sí</span>
                                : <span style={{ color: "var(--color-text-muted)" }}>No</span>)
                            : cellVal != null ? String(cellVal) : "—"}
                          {validationError && (
                            <span className="cell-warn" title={validationError}>⚠</span>
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}

                {extraColumns.map((ec) => (
                  <td key={ec.uid} className="td-joined">
                    {ec.lookup.get(ec.fkKey === "__id__" ? rec.id : String(rec.data[ec.fkKey] ?? "")) ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                  </td>
                ))}

                {formulaCols.map((fc) => (
                  <td key={fc.uid} className="td-formula">
                    <FormulaCell formula={fc.formula} data={rec.data as Record<string, unknown>} />
                  </td>
                ))}

                <td className="col-actions">
                  {onShowHistory && (
                    <button className="row-history-btn" onClick={() => onShowHistory(rec.id)} title="Ver historial">
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6"/>
                        <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                  <button className="row-del-btn" onClick={() => onDeleteRow(rec.id)} title="Eliminar fila">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                      <path d="M4 5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      <path d="M8 5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      <path d="M6 5l.8 10.2A1 1 0 0 0 7.8 16h4.4a1 1 0 0 0 1-.8L14 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M8.5 8.5v4M11.5 8.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55"/>
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-footer">
        <button className="btn btn-ghost add-row-btn" onClick={onAddRow}>
          <span style={{ fontSize: 15 }}>＋</span> fila vacía
        </button>
        {sortedRecords.length > 0 && (
          <span className="grid-count">
            {sortedRecords.length} registro{sortedRecords.length !== 1 ? "s" : ""}
            {sortKey && (
              <span style={{ marginLeft: 6, color: "var(--color-primary)", fontWeight: 600 }}>
                · ordenado por {columns.find((c) => c.field_key === sortKey)?.name ?? sortKey} {sortDir === "asc" ? "↑" : "↓"}
                <button onClick={() => setSortKey(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", marginLeft: 4,
                    color: "var(--color-text-muted)", fontSize: 12 }}>✕</button>
              </span>
            )}
          </span>
        )}
        {focused && !editing && (
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: "auto" }}>
            ↑↓←→ navegar · Enter editar · Supr borrar · Ctrl+V pegar · Ctrl+Z deshacer
          </span>
        )}
      </div>
    </div>
  );
}

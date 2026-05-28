import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDefinition, Record as DRecord, FormulaColDef } from "../types";
import { getRecords } from "../api/datasets";
import { evalFormula } from "../utils/formula";
import CellEditor, { type NavDir } from "./CellEditor";
import { useConfirm } from "./ConfirmDialog";
import { styleForCell, type CondRule } from "./ConditionalFormattingModal";
import { validateCell } from "../utils/validation";

/** Resolución de display de un join. `Map<string,string>` lo satisface
 *  estructuralmente; también lo cumple un objeto con `get` custom (ej. el que
 *  expande claves de array serializadas). */
export interface JoinLookup {
  get(key: string): string | undefined;
}

export interface ExtraColumn {
  uid: string;
  header: string;
  title?: string;   // texto completo "Origen › Columna" para el tooltip
  fkKey: string;
  lookup: JoinLookup;
  onRemove: () => void;
}

/** Datos del dataset relacionado para el hover-card V5 de columnas relation.
 *  El registro se busca lazy (on-hover) por `displayField` para soportar targets grandes. */
export interface RelationLookup {
  targetId: string;
  datasetName?: string;
  displayField: string;
  cols: ColumnDefinition[];
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
  columnOrder?: string[];
  onReorderAny?: (fromId: string, toId: string) => void;
  onRemoveFormula?: (uid: string) => void;
  onShowHistory?: (recordId: string) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  conditionalRules?: CondRule[];
  onOpenSearchReplace?: () => void;
  sheetMode?: boolean; // Excel-style A/B/C column letters above the column name
  relationData?: Record<string, RelationLookup>; // field_key → datos del target para hover-card V5
}

// ── Cell display renderer ─────────────────────────────────────────────────────
function renderCellValue(col: ColumnDefinition, cellVal: unknown): React.ReactNode {
  if (cellVal == null || cellVal === "") return "—";

  switch (col.data_type) {
    case "boolean":
      return cellVal === true || String(cellVal).toLowerCase() === "true"
        ? <span style={{ color: "var(--pm-green-600)", fontWeight: 600 }}>Sí</span>
        : <span style={{ color: "var(--color-text-muted)" }}>No</span>;

    case "url":
      return (
        <a href={String(cellVal)} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ color: "var(--color-primary)", textDecoration: "underline", fontSize: "inherit" }}>
          {String(cellVal)}
        </a>
      );

    case "email":
      return (
        <a href={`mailto:${cellVal}`}
          onClick={(e) => e.stopPropagation()}
          style={{ color: "var(--color-primary)", textDecoration: "underline", fontSize: "inherit" }}>
          {String(cellVal)}
        </a>
      );

    case "rating": {
      const max = col.rules.max_rating ?? 5;
      const val = Number(cellVal) || 0;
      return (
        <span style={{ color: "#F59E0B", letterSpacing: 1, fontSize: 14 }}>
          {"★".repeat(Math.min(val, max))}
          <span style={{ color: "var(--color-border)" }}>{"★".repeat(Math.max(0, max - val))}</span>
        </span>
      );
    }

    case "currency": {
      const sym = col.rules.currency_symbol ?? "$";
      const n = parseFloat(String(cellVal));
      if (isNaN(n)) return String(cellVal);
      return `${sym}${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    case "percent": {
      const n = parseFloat(String(cellVal));
      if (isNaN(n)) return String(cellVal);
      return `${n}%`;
    }

    case "multiselect": {
      const vals: string[] = Array.isArray(cellVal)
        ? cellVal as string[]
        : String(cellVal).split(",").map((s) => s.trim()).filter(Boolean);
      if (vals.length === 0) return "—";
      // Chips neutros del design system (OpsGrid)
      return (
        <span style={{ display: "flex", gap: 4, alignItems: "center", overflow: "hidden" }}>
          {vals.map((v) => (
            <span key={v} className="chip" title={v}>{v}</span>
          ))}
        </span>
      );
    }

    case "relation": {
      // Modelo unificado N:N: el valor siempre es un array de referencias.
      // Render V5 (OpsGrid): chip de código mono naranja (.chip--code) por cada referencia.
      const vals: string[] = Array.isArray(cellVal)
        ? (cellVal as unknown[]).map((v) => String(v)).filter(Boolean)
        : [String(cellVal)].filter(Boolean);
      if (vals.length === 0) return "—";
      return (
        <span style={{ display: "flex", gap: 4, alignItems: "center", overflow: "hidden" }}>
          {vals.map((v, i) => (
            <span key={`${v}-${i}`} className="chip chip--code"
              title={`Relación → ${v}`}
              style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
              {v}
            </span>
          ))}
        </span>
      );
    }

    default:
      return String(cellVal);
  }
}

// ── Relation cell (V5): chips de código + hover-card con el registro relacionado ──
const fmtRel = (x: unknown) => (x == null || x === "" ? "—" : Array.isArray(x) ? x.join(", ") : String(x));

function RelChip({ v, rel }: { v: string; rel?: RelationLookup }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // Fetch lazy del registro relacionado al pasar el mouse (soporta targets grandes).
  const { data: rec } = useQuery({
    queryKey: ["rel-hover", rel?.targetId, rel?.displayField, v],
    queryFn: async () => {
      const res = await getRecords(rel!.targetId, { search: v, limit: 8 });
      const exact = res.data.find((r) => String(r.data[rel!.displayField] ?? "") === v);
      return (exact ?? res.data[0])?.data ?? null;
    },
    enabled: !!pos && !!rel?.targetId,
    staleTime: 300_000,
  });
  const fields = rel && rec ? rel.cols.filter((c) => c.field_key !== rel.displayField).slice(0, 6) : [];
  return (
    <>
      <span
        className="chip chip--code"
        title={`Relación → ${v}`}
        style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", cursor: rel?.targetId ? "help" : "default" }}
        onMouseEnter={(e) => {
          if (!rel?.targetId) return;
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPos({ x: Math.min(r.left, window.innerWidth - 320), y: r.bottom + 6 });
        }}
        onMouseLeave={() => setPos(null)}
      >{v}</span>
      {pos && rec && (
        <div className="dv-hover-card" style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 600, pointerEvents: "none" }}>
          <div className="dv-hover-card__head">
            <span className="dv-hover-card__sub">◇ {rel?.datasetName ?? "Relación"}</span>
          </div>
          <h5>{v}</h5>
          <div className="dv-hover-card__kvs">
            {fields.length ? fields.map((c) => (
              <div className="dv-hover-card__kv" key={c.id}>
                <span>{c.name}</span>
                <b className={c.data_type === "number" || c.data_type === "currency" || c.data_type === "date" ? "mono" : undefined}>
                  {fmtRel(rec[c.field_key])}
                </b>
              </div>
            )) : <div className="dv-hover-card__kv"><span>Sin campos adicionales</span></div>}
          </div>
        </div>
      )}
    </>
  );
}

function RelationCell({ value, rel }: { value: unknown; rel?: RelationLookup }) {
  const vals: string[] = Array.isArray(value)
    ? (value as unknown[]).map((x) => String(x)).filter(Boolean)
    : (value != null && value !== "" ? [String(value)] : []);
  if (!vals.length) return <span className="cell-empty">—</span>;
  return (
    <span style={{ display: "flex", gap: 4, alignItems: "center", overflow: "hidden" }}>
      {vals.map((v, i) => <RelChip key={`${v}-${i}`} v={v} rel={rel} />)}
    </span>
  );
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

type UnifiedColumn =
  | { type: 'regular'; id: string; col: ColumnDefinition }
  | { type: 'extra'; id: string; ec: ExtraColumn }
  | { type: 'formula'; id: string; fc: FormulaColDef };

// ── Range selection ───────────────────────────────────────────────────────────
type CellPos = { row: number; col: number };
type SelRange = { from: CellPos; to: CellPos };

function normRange(r: SelRange) {
  return {
    minRow: Math.min(r.from.row, r.to.row),
    maxRow: Math.max(r.from.row, r.to.row),
    minCol: Math.min(r.from.col, r.to.col),
    maxCol: Math.max(r.from.col, r.to.col),
  };
}

function isInRange(rowIdx: number, colIdx: number, range: SelRange | null): boolean {
  if (!range) return false;
  const { minRow, maxRow, minCol, maxCol } = normRange(range);
  return rowIdx >= minRow && rowIdx <= maxRow && colIdx >= minCol && colIdx <= maxCol;
}

function rangeArea(range: SelRange | null): number {
  if (!range) return 0;
  const { minRow, maxRow, minCol, maxCol } = normRange(range);
  return (maxRow - minRow + 1) * (maxCol - minCol + 1);
}

// Excel-style column letter: 0 -> A, 25 -> Z, 26 -> AA, ...
function colLetter(n: number): string {
  let s = "";
  let i = n;
  while (i >= 0) { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; }
  return s;
}

// Extend a 1D series. Given samples (length >= 1), produce the next `count` values.
// If all numeric with constant diff -> arithmetic progression. Else repeat last value.
function extendSeries(samples: unknown[], count: number): unknown[] {
  if (count <= 0 || samples.length === 0) return [];
  const last = samples[samples.length - 1];
  // Try numeric progression with >= 2 samples
  if (samples.length >= 2) {
    const nums = samples.map((v) => parseFloat(String(v)));
    if (nums.every((n) => !isNaN(n) && isFinite(n))) {
      const diffs = nums.slice(1).map((n, i) => n - nums[i]);
      const step = diffs[0];
      if (diffs.every((d) => Math.abs(d - step) < 1e-9)) {
        const out: unknown[] = [];
        let cur = nums[nums.length - 1];
        for (let i = 0; i < count; i++) { cur += step; out.push(cur); }
        return out;
      }
    }
  }
  // Fallback: repeat last
  return Array(count).fill(last);
}

// Returns numeric stats over cells in range (only numeric/currency/percent/rating cells)
function computeStats(
  range: SelRange,
  records: DRecord[],
  cols: ColumnDefinition[],
): { count: number; numericCount: number; sum: number; avg: number; min: number; max: number } {
  const { minRow, maxRow, minCol, maxCol } = normRange(range);
  let count = 0;
  const nums: number[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const rec = records[r];
      const col = cols[c];
      if (!rec || !col) continue;
      const raw = rec.data[col.field_key];
      if (raw === null || raw === undefined || raw === "") continue;
      count++;
      const isNumeric = col.data_type === "number" || col.data_type === "currency"
        || col.data_type === "percent" || col.data_type === "rating";
      if (isNumeric) {
        const n = parseFloat(String(raw));
        if (!isNaN(n)) nums.push(n);
      } else {
        const n = parseFloat(String(raw));
        if (!isNaN(n) && isFinite(n) && String(n) === String(raw).trim()) nums.push(n);
      }
    }
  }
  const numericCount = nums.length;
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = numericCount > 0 ? sum / numericCount : 0;
  const min = numericCount > 0 ? Math.min(...nums) : 0;
  const max = numericCount > 0 ? Math.max(...nums) : 0;
  return { count, numericCount, sum, avg, min, max };
}

function fmtNum(n: number): string {
  return n.toLocaleString("es-PE", { maximumFractionDigits: 4 });
}

// ── Column filter popover ─────────────────────────────────────────────────────
function ColumnFilterPopover({
  column, allValues, selected, onChange, onClose,
}: {
  column: ColumnDefinition;
  allValues: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const filteredValues = useMemo(() => {
    if (!search.trim()) return allValues;
    const q = search.toLowerCase();
    return allValues.filter((v) => v.toLowerCase().includes(q));
  }, [allValues, search]);

  const allSelected = selected.size === 0 || selected.size === allValues.length;

  const toggleAll = () => {
    if (allSelected) onChange(new Set([])); // clear == none (we treat empty as "all", so use sentinel below)
    else onChange(new Set());
  };

  const toggleOne = (v: string) => {
    const n = new Set(selected.size === 0 ? allValues : selected);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    onChange(n);
  };

  return (
    <div ref={ref} className="col-filter-popover" style={{
      position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 50,
      background: "var(--color-surface)", border: "1px solid var(--color-border)",
      borderRadius: 6, boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
      width: 240, maxHeight: 320, display: "flex", flexDirection: "column",
      padding: 8, fontSize: 12,
    }}
    onClick={(e) => e.stopPropagation()}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--color-text)" }}>
        Filtrar: {column.name}
      </div>
      <input
        autoFocus
        placeholder="Buscar valor…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 6, fontSize: 12, padding: "4px 6px" }}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 2px",
        borderBottom: "1px solid var(--color-border-light)", marginBottom: 4, fontWeight: 500 }}>
        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
        (Seleccionar todo)
      </label>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {filteredValues.length === 0 && (
          <div style={{ color: "var(--color-text-muted)", padding: "8px 4px", textAlign: "center" }}>
            Sin coincidencias
          </div>
        )}
        {filteredValues.map((v) => {
          const isOn = selected.size === 0 || selected.has(v);
          return (
            <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 2px", cursor: "pointer" }}>
              <input type="checkbox" checked={isOn} onChange={() => toggleOne(v)} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v || "(vacío)"}</span>
            </label>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--color-border-light)" }}>
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: "3px 8px", flex: 1 }}
          onClick={() => { onChange(new Set()); onClose(); }}>
          Limpiar
        </button>
        <button className="btn btn-primary" style={{ fontSize: 11, padding: "3px 8px", flex: 1 }}
          onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

export default function DataGrid({
  columns, records, extraColumns = [], formulaCols = [],
  showFilterRow, columnFilters = {}, onFilterChange,
  onCellChange, onAddRow, onDeleteRow, onDeleteColumn, onEditColumn,
  columnOrder, onReorderAny, onRemoveFormula,
  onShowHistory,
  selectedIds, onSelectionChange,
  conditionalRules = [], onOpenSearchReplace, sheetMode = false,
  relationData,
}: Props) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ recordId: string; fieldKey: string } | null>(null);
  const [focused, setFocused] = useState<{ recordId: string; fieldKey: string } | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const dragColKey = useRef<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Range selection (mouse drag / Shift+click)
  const [selRange, setSelRange] = useState<SelRange | null>(null);
  const isMouseSelecting = useRef(false);

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number;
    rowIdx: number; colIdx: number;
    recordId: string; fieldKey: string;
  } | null>(null);

  // Visual column filter (Excel AutoFiltro): map field_key -> selected values
  // Empty Set or undefined means "all values pass"
  const [visualFilters, setVisualFilters] = useState<Record<string, Set<string>>>({});
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);

  const unifiedCols = useMemo(() => {
    const list: UnifiedColumn[] = [
      ...columns.map((c) => ({ type: 'regular' as const, id: c.field_key, col: c })),
      ...extraColumns.map((ec) => ({ type: 'extra' as const, id: `ec:${ec.uid}`, ec })),
      ...formulaCols.map((fc) => ({ type: 'formula' as const, id: `fc:${fc.uid}`, fc }))
    ];
    if (columnOrder && columnOrder.length > 0) {
      list.sort((a, b) => {
        const iA = columnOrder.indexOf(a.id);
        const iB = columnOrder.indexOf(b.id);
        if (iA === -1 && iB === -1) return 0;
        if (iA === -1) return 1;
        if (iB === -1) return -1;
        return iA - iB;
      });
    }
    return list;
  }, [columns, extraColumns, formulaCols, columnOrder]);

  const editableCols = useMemo(
    () => unifiedCols.filter((u): u is { type: 'regular'; id: string; col: ColumnDefinition } => u.type === 'regular').map((u) => u.col),
    [unifiedCols]
  );

  const handleSortClick = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  // Apply visual filters first, then sort
  const filteredRecords = useMemo(() => {
    const activeKeys = Object.keys(visualFilters).filter((k) => visualFilters[k] && visualFilters[k].size > 0);
    if (activeKeys.length === 0) return records;
    return records.filter((rec) => {
      for (const k of activeKeys) {
        const allowed = visualFilters[k];
        const val = String(rec.data[k] ?? "");
        if (!allowed.has(val)) return false;
      }
      return true;
    });
  }, [records, visualFilters]);

  const sortedRecords = useMemo(() => {
    if (!sortKey) return filteredRecords;
    return [...filteredRecords].sort((a, b) => {
      const av = String(a.data[sortKey] ?? "");
      const bv = String(b.data[sortKey] ?? "");
      const cmp = av.localeCompare(bv, "es", { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRecords, sortKey, sortDir]);

  // Build sets of unique values per regular column (for filter popover)
  const uniqueValuesByCol = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const c of columns) {
      const vals = new Set<string>();
      for (const r of records) {
        const v = r.data[c.field_key];
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) {
          v.forEach((x) => vals.add(String(x)));
        } else {
          vals.add(String(v));
        }
      }
      map[c.field_key] = Array.from(vals).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    }
    return map;
  }, [columns, records]);

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
    const colIdx = editableCols.findIndex((c) => c.field_key === from.fieldKey);
    if (rowIdx === -1 || colIdx === -1) return;

    let nextRow = rowIdx, nextCol = colIdx;
    if (dir === "next-col") {
      if (colIdx < editableCols.length - 1) nextCol = colIdx + 1;
      else { nextCol = 0; nextRow = Math.min(rowIdx + 1, sortedRecords.length - 1); }
    } else if (dir === "prev-col") {
      if (colIdx > 0) nextCol = colIdx - 1;
      else { nextCol = editableCols.length - 1; nextRow = Math.max(rowIdx - 1, 0); }
    } else if (dir === "next-row") {
      nextRow = Math.min(rowIdx + 1, sortedRecords.length - 1);
    } else if (dir === "prev-row") {
      nextRow = Math.max(rowIdx - 1, 0);
    }

    const rec = sortedRecords[nextRow];
    const col = editableCols[nextCol];
    if (rec && col && !rec.deleted_at) navigateTo(rec.id, col.field_key, startEditing);
  }, [sortedRecords, editableCols, navigateTo]);

  const handleCommit = useCallback((recordId: string, fieldKey: string, value: unknown, nav?: NavDir) => {
    onCellChange(recordId, fieldKey, value);
    if (nav) navigate({ recordId, fieldKey }, nav, true);
    else { setEditing(null); setFocused({ recordId, fieldKey }); }
  }, [onCellChange, navigate]);

  // ── Fill Down / Fill Right (Excel: Ctrl+D / Ctrl+R) ────────────────────────
  const fillRange = useCallback((direction: "down" | "right") => {
    if (!selRange) return;
    const { minRow, maxRow, minCol, maxCol } = normRange(selRange);
    if (direction === "down") {
      if (maxRow <= minRow) return;
      // For each column in the range, take the top row(s) as the source
      // (>1 row source = arithmetic series, 1 row source = repeat)
      for (let c = minCol; c <= maxCol; c++) {
        const col = editableCols[c];
        if (!col) continue;
        // Source = all cells already filled at the top of the column inside the range
        const sourceLen = Math.min(maxRow - minRow, 5);
        const samples: unknown[] = [];
        for (let r = minRow; r < minRow + sourceLen; r++) {
          const rec = sortedRecords[r];
          if (rec) samples.push(rec.data[col.field_key]);
        }
        // Number of cells to write
        const sourceUsed = samples.length;
        const toFill = maxRow - minRow + 1 - sourceUsed;
        const values = extendSeries(samples, toFill);
        for (let i = 0; i < values.length; i++) {
          const rec = sortedRecords[minRow + sourceUsed + i];
          if (rec && !rec.deleted_at) onCellChange(rec.id, col.field_key, values[i]);
        }
      }
    } else {
      if (maxCol <= minCol) return;
      for (let r = minRow; r <= maxRow; r++) {
        const rec = sortedRecords[r];
        if (!rec || rec.deleted_at) continue;
        const sourceLen = Math.min(maxCol - minCol, 5);
        const samples: unknown[] = [];
        for (let c = minCol; c < minCol + sourceLen; c++) {
          const col = editableCols[c];
          if (col) samples.push(rec.data[col.field_key]);
        }
        const sourceUsed = samples.length;
        const toFill = maxCol - minCol + 1 - sourceUsed;
        const values = extendSeries(samples, toFill);
        for (let i = 0; i < values.length; i++) {
          const col = editableCols[minCol + sourceUsed + i];
          if (col) onCellChange(rec.id, col.field_key, values[i]);
        }
      }
    }
  }, [selRange, sortedRecords, editableCols, onCellChange]);

  // ── Table-level keyboard handler (when focused but not editing) ────────────
  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+H opens Search & Replace at any time (even while editing)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h" && onOpenSearchReplace) {
      e.preventDefault();
      onOpenSearchReplace();
      return;
    }
    // Ctrl+D / Ctrl+R = fill down / right inside the selected range
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key.toLowerCase() === "d" || e.key.toLowerCase() === "r")) {
      if (selRange && rangeArea(selRange) > 1) {
        e.preventDefault();
        fillRange(e.key.toLowerCase() === "d" ? "down" : "right");
        return;
      }
    }
    if (editing) return; // CellEditor handles its own keys
    const anchor = focused;
    if (!anchor) return;

    const dirMap: Record<string, NavDir> = {
      ArrowRight: "next-col", ArrowLeft: "prev-col",
      ArrowDown: "next-row", ArrowUp: "prev-row",
      Tab: e.shiftKey ? "prev-col" : "next-col",
    };

    if (dirMap[e.key]) {
      e.preventDefault();
      navigate(anchor, dirMap[e.key], false);
      setSelRange(null);
      return;
    }
    if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); setEditing(anchor); return; }
    if (e.key === "Escape") { setFocused(null); setSelRange(null); return; }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      // If there's a range, clear all numeric/text cells in it; otherwise just the focused cell
      if (selRange && rangeArea(selRange) > 1) {
        const { minRow, maxRow, minCol, maxCol } = normRange(selRange);
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            const rec = sortedRecords[r];
            const col = editableCols[c];
            if (rec && col && !rec.deleted_at) onCellChange(rec.id, col.field_key, "");
          }
        }
      } else {
        onCellChange(anchor.recordId, anchor.fieldKey, "");
      }
      return;
    }
    // Start typing → open editor
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      setEditing(anchor);
    }
  };

  // ── Range selection: mouse handlers ────────────────────────────────────────
  // Click on a cell → set focused + start a 1x1 range (no editor yet — Excel style).
  // Drag → extend range. Double-click or Enter → editor.
  const startRange = useCallback((rowIdx: number, colIdx: number, e: React.MouseEvent) => {
    if (e.shiftKey && selRange) {
      // Shift+click extends range from existing "from"
      setSelRange({ from: selRange.from, to: { row: rowIdx, col: colIdx } });
    } else {
      const pos = { row: rowIdx, col: colIdx };
      setSelRange({ from: pos, to: pos });
      isMouseSelecting.current = true;
    }
  }, [selRange]);

  const extendRange = useCallback((rowIdx: number, colIdx: number) => {
    if (!isMouseSelecting.current) return;
    setSelRange((prev) => prev ? { from: prev.from, to: { row: rowIdx, col: colIdx } } : null);
  }, []);

  useEffect(() => {
    const onUp = () => { isMouseSelecting.current = false; };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // Close context menu on click-anywhere or ESC
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  // ── Paste from Excel (TSV) ─────────────────────────────────────────────────
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (editing) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
    if (lines.length === 0) return;

    const anchor = focused ?? (
      sortedRecords[0] && editableCols[0]
        ? { recordId: sortedRecords[0].id, fieldKey: editableCols[0].field_key }
        : null
    );
    if (!anchor) return;

    e.preventDefault();

    const startRow = sortedRecords.findIndex((r) => r.id === anchor.recordId);
    const startCol = editableCols.findIndex((c) => c.field_key === anchor.fieldKey);
    if (startRow === -1 || startCol === -1) return;

    lines.forEach((line, ri) => {
      const cells = line.split("\t");
      cells.forEach((val, ci) => {
        const r = sortedRecords[startRow + ri];
        const c = editableCols[startCol + ci];
        if (r && c && !r.deleted_at) onCellChange(r.id, c.field_key, val.trim());
      });
    });
  }, [editing, focused, sortedRecords, editableCols, onCellChange]);

  // ── Copy selected cells as TSV ─────────────────────────────────────────────
  // Priority: range > selected rows > nothing
  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    if (editing) return;

    if (selRange && rangeArea(selRange) > 1) {
      const { minRow, maxRow, minCol, maxCol } = normRange(selRange);
      const rows: string[] = [];
      for (let r = minRow; r <= maxRow; r++) {
        const cells: string[] = [];
        for (let c = minCol; c <= maxCol; c++) {
          const rec = sortedRecords[r];
          const col = editableCols[c];
          cells.push(rec && col ? String(rec.data[col.field_key] ?? "") : "");
        }
        rows.push(cells.join("\t"));
      }
      e.preventDefault();
      e.clipboardData.setData("text/plain", rows.join("\n"));
      return;
    }

    if (selectedIds && selectedIds.size > 0) {
      const rows = sortedRecords.filter((r) => selectedIds.has(r.id));
      const tsv = rows.map((r) => editableCols.map((c) => String(r.data[c.field_key] ?? "")).join("\t")).join("\n");
      e.preventDefault();
      e.clipboardData.setData("text/plain", tsv);
    }
  }, [editing, selRange, selectedIds, sortedRecords, editableCols]);

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

  // ── Stats for status bar ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!selRange || rangeArea(selRange) < 2) return null;
    return computeStats(selRange, sortedRecords, editableCols);
  }, [selRange, sortedRecords, editableCols]);

  return (
    <div>
      <div
        className="table-wrap data-grid-wrap"
        ref={tableRef}
        tabIndex={0}
        onKeyDown={handleTableKeyDown}
        onPaste={handlePaste}
        onCopy={handleCopy}
        style={{ outline: "none", position: "relative", overflow: "auto", maxHeight: "calc(100vh - 280px)" }}
      >
        <table className="data-table">
          <thead style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--color-surface)" }}>
            <tr>
              {hasSelection && (
                <th style={{ width: 36, textAlign: "center",
                  position: "sticky", left: 0, zIndex: 4, background: "var(--color-surface)" }} className="col-frozen">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                </th>
              )}
              <th className="col-rownum col-frozen"
                style={{ position: "sticky", left: hasSelection ? 36 : 0, zIndex: 4, background: "var(--color-surface)" }}>#</th>

              {unifiedCols.map((uCol, colDisplayIdx) => {
                const isOver = dragOverKey === uCol.id;
                const dndProps = {
                  draggable: !!onReorderAny,
                  onDragStart: (e: any) => {
                    dragColKey.current = uCol.id;
                    e.dataTransfer.effectAllowed = "move";
                  },
                  onDragOver: (e: any) => { e.preventDefault(); setDragOverKey(uCol.id); },
                  onDragLeave: () => setDragOverKey(null),
                  onDrop: (e: any) => {
                    e.preventDefault();
                    setDragOverKey(null);
                    if (dragColKey.current && dragColKey.current !== uCol.id) {
                      onReorderAny?.(dragColKey.current, uCol.id);
                    }
                    dragColKey.current = null;
                  },
                  onDragEnd: () => { dragColKey.current = null; setDragOverKey(null); }
                };

                if (uCol.type === 'regular') {
                  const col = uCol.col;
                  const filterActive = (visualFilters[col.field_key]?.size ?? 0) > 0;
                  return (
                    <th key={uCol.id}
                      className={`th-sortable${isOver ? " th-drag-over" : ""}${col.data_type === "relation" ? " th-relation" : ""}`}
                      onClick={() => handleSortClick(col.field_key)}
                      title={sheetMode ? `Columna ${colLetter(colDisplayIdx)} · Ordenar por ${col.name}` : `Ordenar por ${col.name}`}
                      style={{ position: "relative" }}
                      {...dndProps}>
                      {sheetMode && (
                        <div style={{
                          textAlign: "center", fontFamily: "var(--font-mono)", fontWeight: 700,
                          fontSize: 11, color: "var(--color-text-muted)", letterSpacing: 1,
                          padding: "2px 0", borderBottom: "1px solid var(--color-border-light)",
                          marginBottom: 4,
                        }}>
                          {colLetter(colDisplayIdx)}
                        </div>
                      )}
                      <span className="th-inner">
                        <span className="th-col-name">{col.name}</span>
                        <span className="th-col-right">
                          <SortIcon active={sortKey === col.field_key} dir={sortDir} />
                          <button
                            className={`col-filter-btn${filterActive ? " is-active" : ""}`}
                            title={filterActive ? `Filtro activo (${visualFilters[col.field_key].size})` : "Filtrar valores"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenFilterKey(openFilterKey === col.field_key ? null : col.field_key);
                            }}
                            style={{
                              padding: "1px 4px",
                              background: filterActive ? "var(--color-primary-bg)" : "transparent",
                              border: "1px solid",
                              borderColor: filterActive ? "var(--color-primary)" : "transparent",
                              borderRadius: 3,
                              cursor: "pointer",
                              color: filterActive ? "var(--color-primary)" : "var(--color-text-muted)",
                              fontSize: 10,
                              lineHeight: 1,
                            }}>
                            ▼
                          </button>
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
                      {openFilterKey === col.field_key && (
                        <ColumnFilterPopover
                          column={col}
                          allValues={uniqueValuesByCol[col.field_key] ?? []}
                          selected={visualFilters[col.field_key] ?? new Set()}
                          onChange={(next) => {
                            setVisualFilters((prev) => {
                              const n = { ...prev };
                              if (next.size === 0) delete n[col.field_key];
                              else n[col.field_key] = next;
                              return n;
                            });
                          }}
                          onClose={() => setOpenFilterKey(null)}
                        />
                      )}
                    </th>
                  );
                }

                if (uCol.type === 'extra') {
                  const ec = uCol.ec;
                  return (
                    <th key={uCol.id}
                      className={`th-joined${isOver ? " th-drag-over" : ""}`}
                      title={ec.title ?? ec.header}
                      {...dndProps}>
                      <span className="th-inner">
                        <span className="th-col-name">{ec.header}</span>
                        <span className="th-col-right">
                          <button onClick={ec.onRemove} title="Quitar columna vinculada" className="col-del-btn"
                            style={{ color: "var(--pm-orange-600)" }}>×</button>
                        </span>
                      </span>
                    </th>
                  );
                }

                if (uCol.type === 'formula') {
                  const fc = uCol.fc;
                  return (
                    <th key={uCol.id}
                      className={`th-formula${isOver ? " th-drag-over" : ""}`}
                      title={`=${fc.formula}`}
                      {...dndProps}>
                      <span className="th-inner">
                        <span className="th-col-name"><span style={{ marginRight: 4 }}>ƒ</span>{fc.name}</span>
                        <span className="th-col-right">
                          {onRemoveFormula && (
                            <button onClick={() => onRemoveFormula(fc.uid)} title="Quitar columna calculada"
                              className="col-del-btn" style={{ color: "var(--pm-violet-600)" }}>×</button>
                          )}
                        </span>
                      </span>
                    </th>
                  );
                }
                return null;
              })}

              <th className="col-actions" />
            </tr>

            {showFilterRow && (
              <tr className="filter-row">
                {hasSelection && <td />}
                <td />
                {unifiedCols.map((uCol) => {
                  if (uCol.type === 'regular') {
                    const col = uCol.col;
                    return (
                      <td key={uCol.id}>
                        {(col.data_type === "enum" || col.data_type === "multiselect") ? (
                          <select value={columnFilters[col.field_key] ?? ""}
                            onChange={(e) => onFilterChange?.(col.field_key, e.target.value)}>
                            <option value="">Todos</option>
                            {(col.rules.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : col.data_type === "boolean" ? (
                          <select value={columnFilters[col.field_key] ?? ""}
                            onChange={(e) => onFilterChange?.(col.field_key, e.target.value)}>
                            <option value="">Todos</option>
                            <option value="true">Sí</option>
                            <option value="false">No</option>
                          </select>
                        ) : (
                          <input placeholder="Filtrar…"
                            value={columnFilters[col.field_key] ?? ""}
                            onChange={(e) => onFilterChange?.(col.field_key, e.target.value)} />
                        )}
                      </td>
                    );
                  }
                  return <td key={uCol.id} />;
                })}
                <td />
              </tr>
            )}
          </thead>

          <tbody>
            {sortedRecords.length === 0 && (
              <tr>
                <td colSpan={unifiedCols.length + 2}
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
                  <td style={{ textAlign: "center",
                    position: "sticky", left: 0, zIndex: 1, background: "var(--color-surface)" }}
                    className="col-frozen">
                    <input type="checkbox"
                      checked={selectedIds?.has(rec.id) ?? false}
                      onChange={() => toggleSelectOne(rec.id)} />
                  </td>
                )}

                <td className="col-rownum-cell col-frozen"
                  style={{ position: "sticky", left: hasSelection ? 36 : 0, zIndex: 1, background: "var(--color-surface)" }}>{rowIdx + 1}</td>

                {unifiedCols.map((uCol) => {
                  if (uCol.type === 'regular') {
                    const col = uCol.col;
                    const colIdx = editableCols.findIndex((c) => c.field_key === col.field_key);
                    const isEditing = editing?.recordId === rec.id && editing.fieldKey === col.field_key;
                    const isFocused = !isEditing && focused?.recordId === rec.id && focused.fieldKey === col.field_key;
                    const inRange = colIdx >= 0 && isInRange(rowIdx, colIdx, selRange) && rangeArea(selRange) > 1;
                    const cellVal = rec.data[col.field_key];
                    const validationError = !rec.deleted_at ? validateCell(cellVal, col) : null;
                    // Conditional formatting style (only when not in range / not editing — so user feedback wins)
                    const condStyle = conditionalRules.length > 0 && !inRange && !isEditing
                      ? styleForCell(conditionalRules, col.field_key, cellVal)
                      : undefined;
                    const cellStyle: React.CSSProperties | undefined = inRange
                      ? { background: "rgba(37, 99, 235, 0.08)" }
                      : condStyle;
                    return (
                      <td key={uCol.id}
                        className={[
                          isEditing ? "cell-editing" : undefined,
                          isFocused ? "cell-focused" : undefined,
                          inRange ? "cell-in-range" : undefined,
                          cellVal == null ? "cell-null" : undefined,
                          validationError ? "cell-invalid" : undefined,
                        ].filter(Boolean).join(" ") || undefined}
                        style={cellStyle}
                        title={validationError ?? undefined}
                        onMouseDown={(e) => {
                          if (rec.deleted_at) return;
                          if (isEditing) return; // don't restart range inside the editor
                          // primary mouse button only
                          if (e.button !== 0) return;
                          // Single click = focus + start range. Avoid stealing focus from inputs (e.g. checkboxes)
                          const target = e.target as HTMLElement;
                          if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "A" || target.tagName === "BUTTON") return;
                          setFocused({ recordId: rec.id, fieldKey: col.field_key });
                          if (colIdx >= 0) startRange(rowIdx, colIdx, e);
                        }}
                        onMouseEnter={() => {
                          if (colIdx >= 0) extendRange(rowIdx, colIdx);
                        }}
                        onDoubleClick={() => {
                          if (rec.deleted_at) return;
                          setEditing({ recordId: rec.id, fieldKey: col.field_key });
                          setFocused({ recordId: rec.id, fieldKey: col.field_key });
                          setSelRange(null);
                        }}
                        onContextMenu={(e) => {
                          if (rec.deleted_at) return;
                          e.preventDefault();
                          // Ensure the right-clicked cell is at least focused
                          setFocused({ recordId: rec.id, fieldKey: col.field_key });
                          // If outside the existing range, replace it with a single-cell range
                          if (colIdx >= 0) {
                            const inside = isInRange(rowIdx, colIdx, selRange);
                            if (!inside) setSelRange({ from: { row: rowIdx, col: colIdx }, to: { row: rowIdx, col: colIdx } });
                          }
                          setContextMenu({
                            x: e.clientX, y: e.clientY,
                            rowIdx, colIdx,
                            recordId: rec.id, fieldKey: col.field_key,
                          });
                        }}>
                        {isEditing ? (
                          <CellEditor column={col} value={cellVal}
                            onCommit={(v, nav) => handleCommit(rec.id, col.field_key, v, nav)}
                            onCancel={() => { setEditing(null); setFocused({ recordId: rec.id, fieldKey: col.field_key }); }} />
                        ) : (
                          <span className="cell-inner">
                            {col.data_type === "relation"
                              ? <RelationCell value={cellVal} rel={relationData?.[col.field_key]} />
                              : renderCellValue(col, cellVal)}
                            {validationError && (
                              <span className="cell-warn" title={validationError}>⚠</span>
                            )}
                          </span>
                        )}
                      </td>
                    );
                  }

                  if (uCol.type === 'extra') {
                    const ec = uCol.ec;
                    const jv = ec.lookup.get(ec.fkKey === "__id__" ? rec.id : String(rec.data[ec.fkKey] ?? ""));
                    return (
                      <td key={uCol.id} className="td-joined">
                        <span className="cell-inner">
                          {jv
                            ? <span className="joined-val" title={jv}>{jv}</span>
                            : <span className="cell-empty">—</span>}
                        </span>
                      </td>
                    );
                  }

                  if (uCol.type === 'formula') {
                    const fc = uCol.fc;
                    return (
                      <td key={uCol.id} className="td-formula">
                        <span className="cell-inner">
                          <FormulaCell formula={fc.formula} data={rec.data as Record<string, unknown>} />
                        </span>
                      </td>
                    );
                  }
                  return null;
                })}

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
            {Object.keys(visualFilters).length > 0 && (
              <span style={{ marginLeft: 6, color: "var(--color-primary)", fontWeight: 600 }}>
                · {Object.keys(visualFilters).length} filtro{Object.keys(visualFilters).length !== 1 ? "s" : ""}
                <button onClick={() => setVisualFilters({})}
                  style={{ background: "none", border: "none", cursor: "pointer", marginLeft: 4,
                    color: "var(--color-text-muted)", fontSize: 12 }}>✕</button>
              </span>
            )}
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

        {/* Status bar (Excel-style): visible when a multi-cell range is selected */}
        {stats && (
          <span style={{
            marginLeft: 12, display: "inline-flex", gap: 14, alignItems: "center",
            padding: "3px 10px",
            background: "var(--color-primary-bg)",
            border: "1px solid var(--color-primary-border)",
            borderRadius: 4, fontSize: 12, fontWeight: 500,
            color: "var(--color-text)",
          }}>
            <span><strong>Cuenta:</strong> {stats.count}</span>
            {stats.numericCount > 0 && (
              <>
                <span><strong>Suma:</strong> {fmtNum(stats.sum)}</span>
                <span><strong>Promedio:</strong> {fmtNum(stats.avg)}</span>
                <span><strong>Mín:</strong> {fmtNum(stats.min)}</span>
                <span><strong>Máx:</strong> {fmtNum(stats.max)}</span>
              </>
            )}
          </span>
        )}

        {focused && !editing && (
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: "auto" }}>
            ↑↓←→ navegar · Enter/F2 editar · clic derecho menú · arrastrar para seleccionar · Supr borrar · Ctrl+V pegar · Ctrl+Z deshacer · Ctrl+H buscar · Ctrl+D rellenar abajo · Ctrl+R rellenar derecha
          </span>
        )}
      </div>

      {/* Context menu (click derecho) */}
      {contextMenu && (() => {
        const hasRange = selRange !== null && rangeArea(selRange) > 1;
        const recordHere = sortedRecords[contextMenu.rowIdx];
        const colHere = editableCols[contextMenu.colIdx];

        const copyCell = async () => {
          if (hasRange && selRange) {
            const { minRow, maxRow, minCol, maxCol } = normRange(selRange);
            const tsvRows: string[] = [];
            for (let r = minRow; r <= maxRow; r++) {
              const cells: string[] = [];
              for (let c = minCol; c <= maxCol; c++) {
                const rec = sortedRecords[r];
                const cl = editableCols[c];
                cells.push(rec && cl ? String(rec.data[cl.field_key] ?? "") : "");
              }
              tsvRows.push(cells.join("\t"));
            }
            await navigator.clipboard?.writeText(tsvRows.join("\n")).catch(() => {});
          } else if (recordHere && colHere) {
            await navigator.clipboard?.writeText(String(recordHere.data[colHere.field_key] ?? "")).catch(() => {});
          }
        };

        const clearContent = () => {
          if (hasRange && selRange) {
            const { minRow, maxRow, minCol, maxCol } = normRange(selRange);
            for (let r = minRow; r <= maxRow; r++) {
              for (let c = minCol; c <= maxCol; c++) {
                const rec = sortedRecords[r];
                const cl = editableCols[c];
                if (rec && cl && !rec.deleted_at) onCellChange(rec.id, cl.field_key, "");
              }
            }
          } else if (recordHere && colHere) {
            onCellChange(recordHere.id, colHere.field_key, "");
          }
        };

        type Item = { label: string; shortcut?: string; danger?: boolean; disabled?: boolean; onClick: () => void };
        const items: Array<Item | "separator"> = [
          { label: "Copiar", shortcut: "Ctrl+C", onClick: copyCell },
          { label: "Borrar contenido", shortcut: "Supr", onClick: clearContent },
          "separator",
          { label: "Rellenar abajo", shortcut: "Ctrl+D", disabled: !hasRange, onClick: () => fillRange("down") },
          { label: "Rellenar derecha", shortcut: "Ctrl+R", disabled: !hasRange, onClick: () => fillRange("right") },
          "separator",
          ...(onOpenSearchReplace ? [{ label: "Buscar y reemplazar…", shortcut: "Ctrl+H", onClick: onOpenSearchReplace }] : []),
          ...(onShowHistory && recordHere ? [{ label: "Ver historial de la fila", onClick: () => onShowHistory(recordHere.id) }] : []),
          "separator",
          { label: "Eliminar fila", danger: true, disabled: !recordHere, onClick: () => recordHere && onDeleteRow(recordHere.id) },
        ];

        // Clamp menu inside viewport
        const menuW = 240, menuH = items.length * 28 + 12;
        const left = Math.min(contextMenu.x, window.innerWidth - menuW - 8);
        const top  = Math.min(contextMenu.y, window.innerHeight - menuH - 8);

        return (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "fixed", left, top, zIndex: 1100,
              minWidth: menuW, padding: "4px 0",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              fontSize: 13,
            }}>
            {items.map((it, i) => {
              if (it === "separator") {
                return <div key={i} style={{ height: 1, margin: "4px 0", background: "var(--color-border-light)" }} />;
              }
              return (
                <button key={i}
                  disabled={it.disabled}
                  onClick={() => { if (it.disabled) return; it.onClick(); setContextMenu(null); }}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
                    width: "100%", padding: "5px 12px", background: "none", border: "none",
                    textAlign: "left", cursor: it.disabled ? "not-allowed" : "pointer",
                    color: it.disabled ? "var(--color-text-muted)" : it.danger ? "var(--pm-red-500)" : "var(--color-text)",
                    fontSize: 13, opacity: it.disabled ? 0.55 : 1,
                  }}
                  onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = "var(--color-bg)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                  <span>{it.label}</span>
                  {it.shortcut && (
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                      {it.shortcut}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

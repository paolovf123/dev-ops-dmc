import type { ColumnDefinition } from "../../types";

interface Props {
  columns: ColumnDefinition[];
  hiddenCols: Set<string>;
  onToggleCol: (colId: string) => void;
  colFilter: string;
  setColFilter: (v: string) => void;
}

/** Tab "Columnas": filtrar y mostrar/ocultar columnas del dataset. */
export default function VisibilityTab({ columns, hiddenCols, onToggleCol, colFilter, setColFilter }: Props) {
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
          placeholder="Buscar columna…"
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
}

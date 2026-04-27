import { useMemo, useState } from "react";
import type { ColumnDefinition, Record as DRecord } from "../types";

interface Props {
  columns: ColumnDefinition[];
  records: DRecord[];
  onCellChange: (recordId: string, fieldKey: string, value: unknown) => void;
}

export default function KanbanView({ columns, records, onCellChange }: Props) {
  const enumCols = columns.filter((c) => c.data_type === "enum");
  const [groupKey, setGroupKey] = useState<string>(() => enumCols[0]?.field_key ?? "");

  const groupCol = columns.find((c) => c.field_key === groupKey);
  const options: string[] = groupCol?.data_type === "enum"
    ? (groupCol.rules.options ?? [])
    : [];

  const cardCols = columns.filter((c) => c.field_key !== groupKey).slice(0, 4);

  const groups = useMemo(() => {
    const map = new Map<string, DRecord[]>();
    options.forEach((o) => map.set(o, []));
    map.set("(sin valor)", []);
    for (const r of records) {
      const val = String(r.data[groupKey] ?? "");
      const bucket = options.includes(val) ? val : "(sin valor)";
      map.get(bucket)!.push(r);
    }
    return map;
  }, [records, groupKey, options]);

  if (enumCols.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--color-text-muted)" }}>
        Necesitas al menos una columna <strong>enum</strong> para usar la vista Kanban.
      </div>
    );
  }

  return (
    <div className="kanban-root">
      {/* Group picker */}
      <div className="kanban-toolbar">
        <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Agrupar por:</span>
        {enumCols.map((c) => (
          <button key={c.id}
            className={`kanban-group-btn${groupKey === c.field_key ? " active" : ""}`}
            onClick={() => setGroupKey(c.field_key)}>
            {c.name}
          </button>
        ))}
      </div>

      {/* Board */}
      <div className="kanban-board">
        {[...groups.entries()].map(([label, recs]) => (
          recs.length === 0 && label === "(sin valor)" ? null : (
            <div key={label} className="kanban-col">
              <div className="kanban-col-header">
                <span className="kanban-col-label">{label}</span>
                <span className="kanban-col-count">{recs.length}</span>
              </div>
              <div className="kanban-cards">
                {recs.map((rec) => (
                  <div key={rec.id} className="kanban-card">
                    {cardCols.map((col) => {
                      const v = rec.data[col.field_key];
                      if (v == null || v === "") return null;
                      return (
                        <div key={col.id} className="kanban-card-field">
                          <span className="kanban-card-label">{col.name}</span>
                          <span className="kanban-card-value">{String(v)}</span>
                        </div>
                      );
                    })}
                    {/* Status changer */}
                    <div className="kanban-card-status">
                      <select
                        value={String(rec.data[groupKey] ?? "")}
                        onChange={(e) => onCellChange(rec.id, groupKey, e.target.value)}
                        className="kanban-status-select"
                        onClick={(e) => e.stopPropagation()}>
                        <option value="">— mover a —</option>
                        {options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

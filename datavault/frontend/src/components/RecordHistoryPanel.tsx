import { useQuery } from "@tanstack/react-query";
import { getRecordHistory } from "../api/datasets";
import type { ColumnDefinition } from "../types";

interface Props {
  datasetId: string;
  recordId: string;
  columns: ColumnDefinition[];
  onClose: () => void;
}

const ACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  create: { label: "Creado",     color: "#0EA5E9", icon: "✦" },
  update: { label: "Editado",    color: "#3B82F6", icon: "✎" },
  delete: { label: "Eliminado",  color: "#EF4444", icon: "✕" },
};

export default function RecordHistoryPanel({ datasetId, recordId, columns, onClose }: Props) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["history", datasetId, recordId],
    queryFn: () => getRecordHistory(datasetId, recordId),
  });

  const colName = (key: string | null) =>
    key ? (columns.find((c) => c.field_key === key)?.name ?? key) : null;

  return (
    <div className="history-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="history-panel">
        {/* Header */}
        <div className="history-header">
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Historial de cambios</p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
              {history.length} evento{history.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}
            style={{ fontSize: 20, padding: "2px 8px" }}>×</button>
        </div>

        {/* Timeline */}
        <div className="history-body">
          {isLoading ? (
            <div className="history-empty">Cargando…</div>
          ) : history.length === 0 ? (
            <div className="history-empty">Sin historial disponible</div>
          ) : (
            <div className="history-timeline">
              {history.map((entry, i) => {
                const meta = ACTION_LABELS[entry.action] ?? { label: entry.action, color: "#6B7280", icon: "•" };
                const date = new Date(entry.changed_at);
                const isLast = i === history.length - 1;
                return (
                  <div key={entry.id} className="history-entry">
                    {/* Line */}
                    <div className="history-line-col">
                      <div className="history-dot" style={{ background: meta.color, borderColor: meta.color + "33" }}>
                        <span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>{meta.icon}</span>
                      </div>
                      {!isLast && <div className="history-connector" />}
                    </div>

                    {/* Content */}
                    <div className="history-content">
                      <div className="history-action-row">
                        <span className="history-action-badge" style={{ background: meta.color + "18", color: meta.color, border: `1px solid ${meta.color}33` }}>
                          {meta.label}
                        </span>
                        {colName(entry.field_key) && (
                          <span className="history-field-name">{colName(entry.field_key)}</span>
                        )}
                        <span className="history-date">
                          {date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                          {" · "}
                          {date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      {entry.action === "update" && entry.old_value !== null && (
                        <div className="history-diff">
                          <span className="history-old">
                            <span className="history-diff-label">antes</span>
                            {entry.old_value ?? <em>vacío</em>}
                          </span>
                          <span className="history-arrow">→</span>
                          <span className="history-new">
                            <span className="history-diff-label">ahora</span>
                            {entry.new_value ?? <em>vacío</em>}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

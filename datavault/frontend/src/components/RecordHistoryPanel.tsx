import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, X, Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import { getRecordHistory } from "../api/datasets";
import { Badge, IconBtn, type Tone } from "./ui/kit";
import type { ColumnDefinition } from "../types";

interface Props {
  datasetId: string;
  recordId: string;
  columns: ColumnDefinition[];
  onClose: () => void;
}

const ACTION_META: Record<
  string,
  { label: string; tone: Tone; dotColor: string; Icon: typeof Plus }
> = {
  create: { label: "CREÓ", tone: "success", dotColor: "var(--success)", Icon: Plus },
  update: { label: "EDITÓ", tone: "primary", dotColor: "var(--accent-pri)", Icon: Pencil },
  delete: { label: "ELIMINÓ", tone: "danger", dotColor: "var(--danger)", Icon: Trash2 },
};

export default function RecordHistoryPanel({ datasetId, recordId, columns, onClose }: Props) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["history", datasetId, recordId],
    queryFn: () => getRecordHistory(datasetId, recordId),
  });

  // Cierra con Esc (helper SlideOver del handoff)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const colName = (key: string | null) =>
    key ? (columns.find((c) => c.field_key === key)?.name ?? key) : null;

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "var(--overlay)", backdropFilter: "blur(4px)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="og-slide"
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0,
          width: 440, maxWidth: "92vw", display: "flex", flexDirection: "column",
          background: "var(--surface)", borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow-4)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "18px 20px", borderBottom: "1px solid var(--border)",
          }}
        >
          <History size={19} color="var(--accent-pri)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 16px var(--font-sans)", color: "var(--text)" }}>
              Historial de cambios
            </div>
            <div style={{ font: "400 12.5px var(--font-sans)", color: "var(--text-soft)" }}>
              Cada cambio queda registrado · {history.length} evento{history.length !== 1 ? "s" : ""}
            </div>
          </div>
          <IconBtn onClick={onClose} title="Cerrar">
            <X size={18} />
          </IconBtn>
        </div>

        {/* Timeline */}
        <div style={{ padding: 20, overflow: "auto", flex: 1 }}>
          {isLoading ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-mute)", font: "400 13.5px var(--font-sans)" }}>
              Cargando…
            </div>
          ) : history.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-mute)", font: "400 13.5px var(--font-sans)" }}>
              Sin historial disponible
            </div>
          ) : (
            <div style={{ position: "relative", paddingLeft: 26 }}>
              {/* Línea vertical del timeline */}
              <div style={{ position: "absolute", left: 8, top: 6, bottom: 6, width: 2, background: "var(--border)" }} />
              {history.map((entry) => {
                const meta = ACTION_META[entry.action] ?? {
                  label: entry.action.toUpperCase(), tone: "neutral" as Tone,
                  dotColor: "var(--text-mute)", Icon: Pencil,
                };
                const field = colName(entry.field_key);
                const date = new Date(entry.changed_at);
                return (
                  <div key={entry.id} style={{ position: "relative", marginBottom: 22 }}>
                    {/* Dot */}
                    <span
                      style={{
                        position: "absolute", left: -24, top: 3, width: 11, height: 11,
                        borderRadius: 999, background: meta.dotColor,
                        border: "2px solid var(--surface)", boxShadow: "0 0 0 1px var(--border)",
                      }}
                    />

                    {/* Acción + campo */}
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <Badge tone={meta.tone}>
                        <meta.Icon size={11} />{meta.label}
                      </Badge>
                      {field && (
                        <span className="mono" style={{ font: "500 12.5px var(--font-mono)", color: "var(--text)" }}>
                          {field}
                        </span>
                      )}
                    </div>

                    {/* Diff anterior → nuevo */}
                    {entry.action === "update" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, font: "400 12.5px var(--font-mono)", flexWrap: "wrap" }}>
                        <span
                          className="mono"
                          style={{ padding: "2px 7px", borderRadius: "var(--r-1)", background: "var(--danger-soft)", color: "var(--danger)" }}
                        >
                          {entry.old_value ?? "vacío"}
                        </span>
                        <ArrowRight size={13} color="var(--text-mute)" />
                        <span
                          className="mono"
                          style={{ padding: "2px 7px", borderRadius: "var(--r-1)", background: "var(--success-soft)", color: "var(--success)" }}
                        >
                          {entry.new_value ?? "vacío"}
                        </span>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div style={{ marginTop: 8, font: "400 12px var(--font-sans)", color: "var(--text-soft)" }}>
                      {date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                      {" · "}
                      {date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
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

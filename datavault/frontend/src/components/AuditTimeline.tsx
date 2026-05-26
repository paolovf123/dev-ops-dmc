import React from "react";

export interface AuditTimelineEntry {
  id: string;
  record_id: string;
  dataset_id: string;
  dataset_name: string;
  field_key: string | null;
  old_value: string | null;
  new_value: string | null;
  action: "create" | "update" | "delete" | "restore";
  changed_at: string;
  user_id: string | null;
  user_name: string | null;
}

interface Props {
  items: AuditTimelineEntry[];
  loading?: boolean;
}

const ACTION_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  create: {
    label: "Creó", color: "#16A34A", bg: "#DCFCE7",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M12 5v14M5 12h14"/></svg>,
  },
  update: {
    label: "Editó", color: "#2563EB", bg: "#DBEAFE",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  },
  delete: {
    label: "Eliminó", color: "#DC2626", bg: "#FEE2E2",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>,
  },
  restore: {
    label: "Restauró", color: "#D97706", bg: "#FED7AA",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.02"/></svg>,
  },
};

const USER_COLORS = ["#6366F1", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#0EA5E9", "#EF4444", "#14B8A6"];
function userColor(name: string) {
  return USER_COLORS[name.charCodeAt(0) % USER_COLORS.length];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Hoy";
  if (sameDay(d, yesterday)) return "Ayer";
  return d.toLocaleDateString("es-PE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function fullTime(iso: string) {
  return new Date(iso).toLocaleString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

export default function AuditTimeline({ items, loading }: Props) {
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>
        Cargando línea de tiempo…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>
        No hay actividad para los filtros seleccionados.
      </div>
    );
  }

  // Agrupar por día
  const groups: { day: string; entries: AuditTimelineEntry[] }[] = [];
  for (const e of items) {
    const d = dayLabel(e.changed_at);
    const last = groups[groups.length - 1];
    if (last && last.day === d) last.entries.push(e);
    else groups.push({ day: d, entries: [e] });
  }

  return (
    <div style={{ padding: "8px 4px" }}>
      {groups.map((g) => (
        <div key={g.day} style={{ marginBottom: 28 }}>
          {/* Day header */}
          <div style={{
            position: "sticky", top: 0, zIndex: 1,
            padding: "8px 16px", fontSize: 12, fontWeight: 700,
            color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5,
            background: "var(--color-bg)", borderRadius: 6, marginBottom: 12,
            display: "inline-block",
          }}>
            {g.day} <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>· {g.entries.length} evento{g.entries.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Vertical line + events */}
          <div style={{ position: "relative", paddingLeft: 36 }}>
            <div style={{
              position: "absolute", left: 17, top: 6, bottom: 6,
              width: 2, background: "var(--color-border-light)",
            }} />

            {g.entries.map((e) => {
              const meta = ACTION_META[e.action] ?? ACTION_META.update;
              const userName = e.user_name ?? "Sistema";
              const uColor = userColor(userName);
              return (
                <div key={e.id} style={{ position: "relative", marginBottom: 14 }}>
                  {/* Dot */}
                  <div style={{
                    position: "absolute", left: -27, top: 4,
                    width: 20, height: 20, borderRadius: "50%",
                    background: meta.bg, color: meta.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: `2px solid var(--color-surface)`,
                    boxShadow: `0 0 0 2px ${meta.color}40`,
                  }}>
                    {meta.icon}
                  </div>

                  {/* Card */}
                  <div style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderLeft: `3px solid ${meta.color}`,
                    borderRadius: 8, padding: "10px 14px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: uColor, color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>
                        {userName.charAt(0).toUpperCase()}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{userName}</span>
                      <span style={{ fontSize: 13, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                      <span style={{ fontSize: 13, color: "var(--color-text)" }}>en</span>
                      <span style={{
                        fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                        background: "var(--color-primary-bg)", color: "var(--color-primary)",
                      }}>
                        {e.dataset_name}
                      </span>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)" }}
                        title={new Date(e.changed_at).toLocaleString("es-PE")}>
                        {timeAgo(e.changed_at)} · {fullTime(e.changed_at)}
                      </span>
                    </div>

                    {e.field_key && (e.action === "update") && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
                        <code style={{ background: "var(--color-bg)", padding: "1px 6px", borderRadius: 4, marginRight: 6 }}>
                          {e.field_key}
                        </code>
                        <span style={{ color: "var(--color-text-muted)" }}>
                          {e.old_value ? <><s>{truncate(e.old_value)}</s> → </> : null}
                        </span>
                        <span style={{ color: "var(--color-text)", fontWeight: 500 }}>
                          {truncate(e.new_value ?? "—")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function truncate(s: string, max = 80) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

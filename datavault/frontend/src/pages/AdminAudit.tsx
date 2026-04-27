import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import UserMenu from "../components/UserMenu";

interface AuditEntry {
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

interface AuditResponse { total: number; items: AuditEntry[] }

const ACTION_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  create:  { label: "Creado",    color: "#16A34A", bg: "#F0FDF4", icon: "+" },
  update:  { label: "Editado",   color: "#2563EB", bg: "#EFF6FF", icon: "✎" },
  delete:  { label: "Eliminado", color: "#DC2626", bg: "#FEF2F2", icon: "✕" },
  restore: { label: "Restaurado",color: "#D97706", bg: "#FFFBEB", icon: "↩" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

const PAGE_SIZE = 50;

export default function AdminAudit() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [filterAction, setFilterAction] = useState("");
  const [filterDataset, setFilterDataset] = useState("");

  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ["audit", page, filterAction, filterDataset],
    queryFn: () => {
      const params: Record<string, string | number> = { skip: page * PAGE_SIZE, limit: PAGE_SIZE };
      if (filterAction) params.action = filterAction;
      if (filterDataset) params.dataset_id = filterDataset;
      return api.get<AuditResponse>("/auth/audit", { params }).then((r) => r.data);
    },
    enabled: isAdmin,
  });

  // Fetch datasets for filter dropdown
  const { data: datasets = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["datasets"],
    queryFn: () => api.get("/datasets").then((r) => r.data),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh" }}>
        <div className="empty"><div className="empty-icon">🔒</div><p>Solo administradores.</p></div>
      </div>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ minHeight:"100vh", background:"var(--color-bg)" }}>
      {/* Header */}
      <header className="app-header">
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo">T</div>
          <span className="app-header-name">Trans<em>Excel</em></span>
        </button>
        <div className="toolbar-sep" />
        <span style={{ fontSize:13, color:"var(--color-text-secondary)", fontWeight:500 }}>
          Registro de auditoría
        </span>
        <div className="app-header-spacer" />
        <UserMenu />
      </header>

      {/* Hero */}
      <div className="ds-hero">
        <div className="ds-hero-inner">
          <div>
            <h1 className="ds-hero-title">Auditoría</h1>
            <p className="ds-hero-sub">Historial completo de cambios en todos los datasets</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <button className="btn btn-ghost" onClick={() => navigate("/admin/users")} style={{ fontSize:12 }}>
              👥 Usuarios
            </button>
          </div>
        </div>
        <div className="ds-stats">
          {[
            { label: "Total cambios", value: total, color: "var(--color-text)" },
            { label: "Creaciones", value: items.filter(i => i.action === "create").length, color: "#16A34A" },
            { label: "Ediciones",  value: items.filter(i => i.action === "update").length, color: "#2563EB" },
            { label: "Eliminaciones", value: items.filter(i => i.action === "delete").length, color: "#DC2626" },
          ].map((s, i, arr) => (
            <div key={s.label} style={{ display:"contents" }}>
              <div className="ds-stat">
                <span className="ds-stat-value" style={{ color: s.color }}>{s.value}</span>
                <span className="ds-stat-label">{s.label}</span>
              </div>
              {i < arr.length - 1 && <div className="ds-stat-divider" />}
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"24px 24px" }}>
        {/* Filters */}
        <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
            style={{ width:"auto", fontSize:13, height:34, padding:"0 10px" }}>
            <option value="">Todas las acciones</option>
            <option value="create">Creaciones</option>
            <option value="update">Ediciones</option>
            <option value="delete">Eliminaciones</option>
            <option value="restore">Restauraciones</option>
          </select>
          <select
            value={filterDataset}
            onChange={(e) => { setFilterDataset(e.target.value); setPage(0); }}
            style={{ width:"auto", fontSize:13, height:34, padding:"0 10px" }}>
            <option value="">Todos los datasets</option>
            {datasets.map((ds) => (
              <option key={ds.id} value={ds.id}>{ds.name}</option>
            ))}
          </select>
          {(filterAction || filterDataset) && (
            <button className="btn btn-ghost" style={{ fontSize:12 }}
              onClick={() => { setFilterAction(""); setFilterDataset(""); setPage(0); }}>
              ✕ Limpiar filtros
            </button>
          )}
          <span style={{ marginLeft:"auto", fontSize:12, color:"var(--color-text-muted)", alignSelf:"center" }}>
            {total} registros encontrados
          </span>
        </div>

        {/* Table */}
        <div className="au-card">
          {isLoading ? (
            <div style={{ padding:"48px 24px", textAlign:"center" }}>
              <div className="csv-loading-spinner" />
            </div>
          ) : items.length === 0 ? (
            <div className="empty"><p>No hay registros de auditoría.</p></div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"linear-gradient(180deg,#FAFBFC,#F3F6F9)" }}>
                    {["Acción","Dataset","Campo","Cambio","Usuario","Cuándo"].map((h) => (
                      <th key={h} style={{
                        padding:"10px 16px", textAlign:"left",
                        fontSize:11, fontWeight:700, textTransform:"uppercase",
                        color:"var(--color-text-muted)", letterSpacing:"0.05em",
                        borderBottom:"2px solid var(--color-border)", whiteSpace:"nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => {
                    const meta = ACTION_META[entry.action] ?? ACTION_META.update;
                    return (
                      <tr key={entry.id}
                        style={{ borderBottom:"1px solid var(--color-border-light)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>

                        {/* Action */}
                        <td style={{ padding:"11px 16px" }}>
                          <span style={{
                            display:"inline-flex", alignItems:"center", gap:5,
                            fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:99,
                            color: meta.color, background: meta.bg,
                            border:`1px solid ${meta.color}33`,
                          }}>
                            {meta.icon} {meta.label}
                          </span>
                        </td>

                        {/* Dataset */}
                        <td style={{ padding:"11px 16px" }}>
                          <span style={{ fontSize:13, fontWeight:500, color:"var(--color-text)" }}>
                            {entry.dataset_name}
                          </span>
                        </td>

                        {/* Field */}
                        <td style={{ padding:"11px 16px" }}>
                          {entry.field_key ? (
                            <span style={{
                              fontSize:11, fontFamily:"var(--font-mono)",
                              background:"var(--color-bg)", border:"1px solid var(--color-border)",
                              borderRadius:4, padding:"2px 7px", color:"var(--color-text-secondary)",
                            }}>
                              {entry.field_key}
                            </span>
                          ) : (
                            <span style={{ color:"var(--color-text-muted)", fontSize:12 }}>—</span>
                          )}
                        </td>

                        {/* Change diff */}
                        <td style={{ padding:"11px 16px", maxWidth:280 }}>
                          {entry.old_value !== null || entry.new_value !== null ? (
                            <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, minWidth:0 }}>
                              {entry.old_value !== null && (
                                <span style={{
                                  color:"#DC2626", background:"#FEF2F2", padding:"1px 7px",
                                  borderRadius:4, maxWidth:100, overflow:"hidden", textOverflow:"ellipsis",
                                  whiteSpace:"nowrap", display:"block",
                                }} title={entry.old_value}>
                                  {entry.old_value || <em style={{ opacity:0.5 }}>vacío</em>}
                                </span>
                              )}
                              {entry.old_value !== null && entry.new_value !== null && (
                                <span style={{ color:"var(--color-text-muted)", flexShrink:0 }}>→</span>
                              )}
                              {entry.new_value !== null && (
                                <span style={{
                                  color:"#16A34A", background:"#F0FDF4", padding:"1px 7px",
                                  borderRadius:4, maxWidth:100, overflow:"hidden", textOverflow:"ellipsis",
                                  whiteSpace:"nowrap", display:"block",
                                }} title={entry.new_value}>
                                  {entry.new_value || <em style={{ opacity:0.5 }}>vacío</em>}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color:"var(--color-text-muted)", fontSize:12 }}>—</span>
                          )}
                        </td>

                        {/* User */}
                        <td style={{ padding:"11px 16px" }}>
                          {entry.user_name ? (
                            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                              <div style={{
                                width:22, height:22, borderRadius:"50%", flexShrink:0,
                                background:"linear-gradient(135deg,var(--pm-green-500),var(--pm-green-700))",
                                color:"#fff", fontSize:10, fontWeight:700,
                                display:"flex", alignItems:"center", justifyContent:"center",
                              }}>
                                {entry.user_name.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontSize:12, fontWeight:500, color:"var(--color-text)" }}>
                                {entry.user_name}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize:12, color:"var(--color-text-muted)" }}>Sistema</span>
                          )}
                        </td>

                        {/* Time */}
                        <td style={{ padding:"11px 16px", whiteSpace:"nowrap" }}>
                          <span style={{ fontSize:12, color:"var(--color-text-muted)" }}
                            title={new Date(entry.changed_at).toLocaleString("es-PE")}>
                            {timeAgo(entry.changed_at)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:12 }}>
            <span style={{ fontSize:12, color:"var(--color-text-muted)" }}>
              Página {page + 1} de {totalPages} · {total} entradas totales
            </span>
            <div style={{ display:"flex", gap:4 }}>
              <button className="btn btn-secondary" style={{ height:28, fontSize:12, padding:"0 10px" }}
                onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                ← Anterior
              </button>
              {Array.from({ length: totalPages }, (_, i) => i)
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
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}>
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

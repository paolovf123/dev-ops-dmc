import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import UserMenu from "../components/UserMenu";
import AuditTimeline from "../components/AuditTimeline";

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
interface UserInfo { id: string; username: string; email: string; role: string }
interface WorkspaceInfo { id: string; name: string; description: string }
interface DatasetInfo { id: string; name: string; workspace_id: string | null }

const ACTION_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  create:  { label: "Creado",     color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", dot: "#22C55E" },
  update:  { label: "Editado",    color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", dot: "#3B82F6" },
  delete:  { label: "Eliminado",  color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", dot: "#EF4444" },
  restore: { label: "Restaurado", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", dot: "#F59E0B" },
};
const ACTION_ICONS: Record<string, React.ReactNode> = {
  create:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>,
  update:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  delete:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>,
  restore: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.02"/></svg>,
};

const USER_COLORS = ["#6366F1","#8B5CF6","#EC4899","#F59E0B","#10B981","#0EA5E9","#EF4444","#14B8A6"];
function userColor(name: string) { return USER_COLORS[name.charCodeAt(0) % USER_COLORS.length]; }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}
function fullDate(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const PAGE_SIZE = 50;

export default function AdminAudit() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [filterAction, setFilterAction] = useState("");
  const [filterWorkspace, setFilterWorkspace] = useState("");
  const [filterDataset, setFilterDataset] = useState("");
  const [filterUsers, setFilterUsers] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userDropOpen, setUserDropOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [view, setView] = useState<"table" | "timeline">("table");
  const userDropRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (userDropRef.current && !userDropRef.current.contains(e.target as Node)) setUserDropOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ["audit", page, filterAction, filterWorkspace, filterDataset, filterUsers],
    queryFn: async () => {
      const baseParams = (): Record<string, string | number> => {
        const p: Record<string, string | number> = {};
        if (filterAction)    p.action       = filterAction;
        if (filterWorkspace) p.workspace_id = filterWorkspace;
        if (filterDataset)   p.dataset_id   = filterDataset;
        return p;
      };
      if (filterUsers.length > 1) {
        const results = await Promise.all(filterUsers.map((uid) =>
          api.get<AuditResponse>("/auth/audit", { params: { ...baseParams(), skip: 0, limit: PAGE_SIZE, user_id: uid } }).then((r) => r.data)
        ));
        const merged = results.flatMap((r) => r.items).sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
        return { total: results.reduce((s, r) => s + r.total, 0), items: merged.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) };
      }
      const params = { ...baseParams(), skip: page * PAGE_SIZE, limit: PAGE_SIZE };
      if (filterUsers.length === 1) (params as Record<string, string | number>).user_id = filterUsers[0];
      return api.get<AuditResponse>("/auth/audit", { params }).then((r) => r.data);
    },
    enabled: isAdmin,
  });

  const { data: workspaces = [] } = useQuery<WorkspaceInfo[]>({
    queryKey: ["workspaces-audit"],
    queryFn: () => api.get<WorkspaceInfo[]>("/workspaces").then((r) => r.data),
    enabled: isAdmin,
  });

  const { data: allDatasets = [] } = useQuery<DatasetInfo[]>({
    queryKey: ["datasets-audit"],
    queryFn: () => api.get<DatasetInfo[]>("/datasets").then((r) => r.data),
    enabled: isAdmin,
  });

  // Datasets visible in the dataset dropdown: filtered by selected workspace
  const datasets = filterWorkspace
    ? allDatasets.filter((d) => d.workspace_id === filterWorkspace)
    : allDatasets;

  const { data: allUsers = [] } = useQuery<UserInfo[]>({
    queryKey: ["all-users"],
    queryFn: () => api.get<UserInfo[]>("/auth/users").then((r) => r.data),
    enabled: isAdmin,
  });

  const selectedUserObjs = allUsers.filter((u) => filterUsers.includes(u.id));
  const filteredUsers = userSearch
    ? allUsers.filter((u) =>
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase()))
    : allUsers;

  function toggleUser(uid: string) {
    setFilterUsers((prev) => prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]);
    setPage(0);
  }

  // ── Fetch all for export ─────────────────────────────────────────────────
  async function fetchAll() {
    const baseParams = (): Record<string, string | number> => {
      const p: Record<string, string | number> = { skip: 0, limit: 9999 };
      if (filterAction)    p.action       = filterAction;
      if (filterWorkspace) p.workspace_id = filterWorkspace;
      if (filterDataset)   p.dataset_id   = filterDataset;
      return p;
    };
    if (filterUsers.length > 1) {
      const results = await Promise.all(filterUsers.map((uid) =>
        api.get<AuditResponse>("/auth/audit", { params: { ...baseParams(), user_id: uid } }).then((r) => r.data.items)
      ));
      return results.flat().sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
    }
    const params = baseParams();
    if (filterUsers.length === 1) params.user_id = filterUsers[0];
    const { data: resp } = await api.get<AuditResponse>("/auth/audit", { params });
    return resp.items;
  }

  function buildSuffix() {
    return [
      filterAction      ? ACTION_META[filterAction]?.label : "",
      filterWorkspace   ? workspaces.find((w) => w.id === filterWorkspace)?.name : "",
      filterDataset     ? allDatasets.find((d) => d.id === filterDataset)?.name : "",
      selectedUserObjs.length ? selectedUserObjs.map((u) => u.username).join("+") : "",
    ].filter(Boolean).join("-");
  }

  async function exportCSV() {
    setDownloading(true); setExportOpen(false);
    try {
      const rows = await fetchAll();
      const headers = ["Fecha","Acción","Dataset","Campo","Valor anterior","Valor nuevo","Usuario"];
      const esc = (v: string | null) => {
        if (v == null) return "";
        const s = String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g,'""')}"` : s;
      };
      const lines = [headers.join(","), ...rows.map((e) =>
        [fullDate(e.changed_at), ACTION_META[e.action]?.label ?? e.action, e.dataset_name,
         e.field_key ?? "", e.old_value ?? "", e.new_value ?? "", e.user_name ?? "Sistema"
        ].map(esc).join(","))];
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      triggerDownload(blob, `auditoria${buildSuffix() ? "-" + buildSuffix() : ""}-${today()}.csv`);
    } finally { setDownloading(false); }
  }

  async function exportExcel() {
    setDownloading(true); setExportOpen(false);
    try {
      const rows = await fetchAll();
      // Build XLSX via raw XML (SpreadsheetML) — no library needed
      const headers = ["Fecha","Acción","Dataset","Campo","Valor anterior","Valor nuevo","Usuario"];
      const xmlRows = [
        `<Row>${headers.map((h) => `<Cell><Data ss:Type="String">${xmlEsc(h)}</Data></Cell>`).join("")}</Row>`,
        ...rows.map((e) =>
          `<Row>${[
            fullDate(e.changed_at),
            ACTION_META[e.action]?.label ?? e.action,
            e.dataset_name,
            e.field_key ?? "",
            e.old_value ?? "",
            e.new_value ?? "",
            e.user_name ?? "Sistema",
          ].map((v) => `<Cell><Data ss:Type="String">${xmlEsc(String(v ?? ""))}</Data></Cell>`).join("")}</Row>`
        ),
      ].join("\n");
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#F4F6F9" ss:Pattern="Solid"/></Style>
  </Styles>
  <Worksheet ss:Name="Auditoría">
    <Table>${xmlRows}</Table>
  </Worksheet>
</Workbook>`;
      const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
      triggerDownload(blob, `auditoria${buildSuffix() ? "-" + buildSuffix() : ""}-${today()}.xls`);
    } finally { setDownloading(false); }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function xmlEsc(s: string) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  if (!isAdmin) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
        <p style={{ color:"var(--color-text-muted)" }}>Solo administradores.</p>
      </div>
    </div>
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!filterAction || !!filterWorkspace || !!filterDataset || filterUsers.length > 0;
  const actionCounts = items.reduce((acc, i) => { acc[i.action] = (acc[i.action] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div style={{ minHeight:"100vh", background:"var(--color-bg)" }}>

      {/* ── Header ── */}
      <header className="app-header" style={{ gap:4 }}>
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo app-header-logo--img"><img src="/opsgrid-logo.svg" alt="OpsGrid" /></div>
          <span className="app-header-name">Ops<em>Grid</em></span>
        </button>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" style={{ flexShrink:0, margin:"0 2px" }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span style={{ fontSize:13, fontWeight:600, color:"var(--color-text)" }}>Auditoría</span>
        <div style={{ width:1, height:22, background:"var(--color-border)", margin:"0 8px", flexShrink:0 }}/>
        <div className="app-header-spacer"/>
        <nav style={{ display:"flex", gap:2 }}>
          {([
            { title:"Workspaces", path:"/admin/workspaces", icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
            { title:"Grupos",     path:"/admin/groups",     icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6"/><circle cx="16" cy="8" r="3"/><path d="M22 20c0-3.3-2.7-6-6-6"/><path d="M9 14c0 0 1.5-.5 3-.5s3 .5 3 .5"/></svg> },
            { title:"Usuarios",   path:"/admin/users",      icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
          ] as { title: string; path: string; icon: React.ReactNode }[]).map(({ title, path, icon }) => (
            <button key={path} onClick={() => navigate(path)} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", height:34, borderRadius:7, background:"transparent", border:"1.5px solid transparent", cursor:"pointer", color:"var(--color-text-secondary)", fontSize:12.5, fontWeight:600, transition:"all 0.14s", whiteSpace:"nowrap" }}
              onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background="var(--color-border-light)"; el.style.borderColor="var(--color-border)"; el.style.color="var(--color-text)"; }}
              onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background="transparent"; el.style.borderColor="transparent"; el.style.color="var(--color-text-secondary)"; }}>
              {icon}<span>{title}</span>
            </button>
          ))}
        </nav>
        <div style={{ width:1, height:22, background:"var(--color-border)", margin:"0 4px", flexShrink:0 }}/>
        <UserMenu/>
      </header>

      <div style={{ maxWidth:1280, margin:"0 auto", padding:"28px 24px 56px" }}>

        {/* ── Título + stat cards + export ── */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, gap:20, flexWrap:"wrap" }}>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:800, letterSpacing:-0.5 }}>Registro de auditoría</h1>
            <p style={{ margin:"4px 0 0", fontSize:13, color:"var(--color-text-muted)" }}>
              Historial completo de cambios · {total.toLocaleString()} entradas
            </p>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {/* Stat cards */}
            {!isLoading && Object.entries(ACTION_META).map(([key, meta]) => {
              const count = actionCounts[key] ?? 0;
              if (!count) return null;
              const active = filterAction === key;
              return (
                <button key={key}
                  onClick={() => { setFilterAction(active ? "" : key); setPage(0); }}
                  style={{
                    display:"flex", flexDirection:"column", alignItems:"center",
                    padding:"8px 14px", borderRadius:10, cursor:"pointer",
                    background: active ? meta.bg : "var(--color-surface)",
                    border:`1.5px solid ${active ? meta.border : "var(--color-border)"}`,
                    boxShadow: active ? `0 0 0 3px ${meta.dot}18` : "none",
                    transition:"all 0.15s", minWidth:70,
                  }}>
                  <span style={{ fontSize:18, fontWeight:800, color: active ? meta.color : "var(--color-text)", lineHeight:1 }}>{count}</span>
                  <span style={{ fontSize:10.5, fontWeight:600, color: active ? meta.color : "var(--color-text-muted)", marginTop:2, display:"flex", alignItems:"center", gap:4 }}>
                    <div style={{ width:5, height:5, borderRadius:"50%", background: meta.dot, flexShrink:0 }}/>
                    {meta.label}
                  </span>
                </button>
              );
            })}

            {/* View toggle: Table vs Timeline */}
            <div style={{ display: "flex", border: "1.5px solid var(--color-border)", borderRadius: 8, overflow: "hidden", height: 38 }}>
              {([["table", "Tabla"], ["timeline", "Timeline"]] as const).map(([k, label]) => (
                <button key={k}
                  onClick={() => setView(k)}
                  style={{
                    padding: "0 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    border: "none",
                    background: view === k ? "var(--color-primary)" : "var(--color-surface)",
                    color: view === k ? "#fff" : "var(--color-text-secondary)",
                    transition: "all 0.14s",
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Export dropdown */}
            <div ref={exportRef} style={{ position:"relative" }}>
              <button
                onClick={() => setExportOpen((v) => !v)}
                disabled={downloading || total === 0}
                style={{
                  display:"flex", alignItems:"center", gap:7, padding:"8px 14px",
                  borderRadius:8, cursor:"pointer", height:38,
                  background:"var(--color-surface)", border:"1.5px solid var(--color-border)",
                  color:"var(--color-text-secondary)", fontSize:13, fontWeight:600,
                  transition:"all 0.14s", whiteSpace:"nowrap",
                }}
                onMouseEnter={(e) => { if (!downloading && total > 0) { const el=e.currentTarget as HTMLElement; el.style.background="#F0FDF4"; el.style.borderColor="#0EA5E9"; el.style.color="#0EA5E9"; }}}
                onMouseLeave={(e) => { const el=e.currentTarget as HTMLElement; el.style.background="var(--color-surface)"; el.style.borderColor="var(--color-border)"; el.style.color="var(--color-text-secondary)"; }}
              >
                {downloading
                  ? <div style={{ width:14, height:14, borderRadius:"50%", border:"2px solid #0EA5E940", borderTopColor:"#0EA5E9", animation:"spin 0.7s linear infinite" }}/>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                }
                {downloading ? "Exportando…" : "Exportar"}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: exportOpen ? "rotate(180deg)":"none", transition:"transform 0.18s" }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {exportOpen && (
                <div style={{
                  position:"absolute", top:"calc(100% + 6px)", right:0, minWidth:180, zIndex:50,
                  background:"var(--color-surface)", border:"1.5px solid var(--color-border)",
                  borderRadius:10, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", overflow:"hidden",
                }}>
                  <div style={{ padding:"8px 12px 6px", borderBottom:"1px solid var(--color-border-light)" }}>
                    <p style={{ margin:0, fontSize:11, fontWeight:700, color:"var(--color-text-muted)", textTransform:"uppercase", letterSpacing:0.5 }}>
                      {hasFilters ? "Exportar con filtros" : "Exportar todo"}
                    </p>
                  </div>
                  {[
                    { label:"CSV", sub:"Compatible con cualquier app", icon:"📄", fn: exportCSV },
                    { label:"Excel (.xls)", sub:"Abre directo en Excel", icon:"📊", fn: exportExcel },
                  ].map(({ label, sub, icon, fn }) => (
                    <button key={label} onClick={fn}
                      style={{ width:"100%", padding:"10px 14px", background:"transparent", border:"none", cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:10, transition:"background 0.1s" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background="var(--color-border-light)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background="transparent"; }}
                    >
                      <span style={{ fontSize:18, lineHeight:1 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:"var(--color-text)" }}>{label}</div>
                        <div style={{ fontSize:11, color:"var(--color-text-muted)" }}>{sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Barra de filtros ── */}
        <div style={{
          display:"flex", gap:8, marginBottom:20, alignItems:"center",
          background:"var(--color-surface)", border:"1px solid var(--color-border)",
          borderRadius:12, padding:"10px 14px", flexWrap:"wrap",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" style={{ flexShrink:0 }}>
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span style={{ fontSize:11, fontWeight:700, color:"var(--color-text-muted)", textTransform:"uppercase", letterSpacing:0.5, marginRight:4 }}>Filtros</span>

          {/* Acción */}
          <select value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setPage(0); }} style={selectStyle(!!filterAction)}>
            <option value="">Toda acción</option>
            <option value="create">Creaciones</option>
            <option value="update">Ediciones</option>
            <option value="delete">Eliminaciones</option>
            <option value="restore">Restauraciones</option>
          </select>

          {/* Workspace */}
          <select value={filterWorkspace} onChange={(e) => { setFilterWorkspace(e.target.value); setFilterDataset(""); setPage(0); }} style={{ ...selectStyle(!!filterWorkspace), maxWidth:160 }}>
            <option value="">Todo workspace</option>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>

          {/* Dataset — filtered by workspace */}
          <select value={filterDataset} onChange={(e) => { setFilterDataset(e.target.value); setPage(0); }} style={{ ...selectStyle(!!filterDataset), maxWidth:180 }} disabled={datasets.length === 0 && !filterDataset}>
            <option value="">{filterWorkspace ? "Todo dataset" : "Todo dataset"}</option>
            {datasets.map((ds) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
          </select>

          {/* Persona — dropdown multi-select */}
          <div ref={userDropRef} style={{ position:"relative" }}>
            <button onClick={() => setUserDropOpen((v) => !v)} style={{
              display:"flex", alignItems:"center", gap:6, height:32, padding:"0 10px",
              borderRadius:7, cursor:"pointer", fontSize:13, fontWeight: filterUsers.length ? 600 : 400,
              border:`1px solid ${filterUsers.length ? "var(--color-primary,#0EA5E9)" : "var(--color-border)"}`,
              background: filterUsers.length ? "#F0FDF4" : "var(--color-bg)",
              color: filterUsers.length ? "#0EA5E9" : "var(--color-text-muted)", whiteSpace:"nowrap",
            }}>
              {filterUsers.length === 0 ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  <span>Toda persona</span>
                </>
              ) : filterUsers.length === 1 ? (
                <>
                  <UserAvatar name={selectedUserObjs[0].username} size={18}/>
                  <span>{selectedUserObjs[0].username}</span>
                </>
              ) : (
                <>
                  <div style={{ display:"flex", alignItems:"center" }}>
                    {selectedUserObjs.slice(0,3).map((u, i) => (
                      <div key={u.id} style={{ marginLeft: i > 0 ? -6 : 0, zIndex: 3-i }}>
                        <UserAvatar name={u.username} size={18}/>
                      </div>
                    ))}
                  </div>
                  <span>{filterUsers.length} personas</span>
                </>
              )}
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: userDropOpen ? "rotate(180deg)":"none", transition:"transform 0.18s", flexShrink:0 }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {userDropOpen && (
              <div style={{ position:"absolute", top:"calc(100% + 6px)", left:0, minWidth:260, zIndex:50, background:"var(--color-surface)", border:"1.5px solid var(--color-border)", borderRadius:10, boxShadow:"0 8px 24px rgba(0,0,0,0.13)", overflow:"hidden" }}>
                <div style={{ padding:"8px 10px", borderBottom:"1px solid var(--color-border-light)" }}>
                  <input autoFocus placeholder="Buscar persona…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                    style={{ width:"100%", padding:"5px 9px", borderRadius:6, fontSize:12, border:"1px solid var(--color-border)", background:"var(--color-bg)", color:"var(--color-text)", outline:"none", boxSizing:"border-box" }}/>
                </div>
                {filterUsers.length > 0 && (
                  <div style={{ padding:"6px 10px", borderBottom:"1px solid var(--color-border-light)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontSize:11, color:"var(--color-text-muted)" }}>{filterUsers.length} seleccionada{filterUsers.length > 1 ? "s":""}</span>
                    <button onClick={() => { setFilterUsers([]); setPage(0); }} style={{ fontSize:11, fontWeight:600, color:"#DC2626", background:"transparent", border:"none", cursor:"pointer", padding:"2px 6px" }}>Limpiar</button>
                  </div>
                )}
                <div style={{ maxHeight:240, overflowY:"auto" }}>
                  {filteredUsers.map((u) => {
                    const isActive = filterUsers.includes(u.id);
                    return (
                      <button key={u.id} onClick={() => toggleUser(u.id)}
                        style={{ width:"100%", padding:"7px 12px", background: isActive ? "#F0FDF4":"transparent", border:"none", cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:8, transition:"background 0.1s" }}
                        onMouseEnter={(e) => { if(!isActive) (e.currentTarget as HTMLElement).style.background="var(--color-border-light)"; }}
                        onMouseLeave={(e) => { if(!isActive) (e.currentTarget as HTMLElement).style.background="transparent"; }}>
                        {/* Checkbox visual */}
                        <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${isActive ? "#0EA5E9":"var(--color-border)"}`, background: isActive ? "#0EA5E9":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.12s" }}>
                          {isActive && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        <UserAvatar name={u.username} size={22}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight: isActive ? 600:500, color: isActive ? "#0EA5E9":"var(--color-text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.username}</div>
                          <div style={{ fontSize:11, color:"var(--color-text-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.email}</div>
                        </div>
                      </button>
                    );
                  })}
                  {filteredUsers.length === 0 && <p style={{ padding:"10px 12px", fontSize:12, color:"var(--color-text-muted)", margin:0 }}>Sin resultados</p>}
                </div>
              </div>
            )}
          </div>

          {/* Chips filtros activos */}
          {hasFilters && (
            <div style={{ display:"flex", gap:5, alignItems:"center", marginLeft:4, flexWrap:"wrap" }}>
              {filterAction && (
                <FilterChip label={ACTION_META[filterAction]?.label ?? filterAction} color={ACTION_META[filterAction]?.color} bg={ACTION_META[filterAction]?.bg} border={ACTION_META[filterAction]?.border} onRemove={() => { setFilterAction(""); setPage(0); }}/>
              )}
              {filterWorkspace && (
                <FilterChip label={workspaces.find((w) => w.id === filterWorkspace)?.name ?? "Workspace"} color="#8B5CF6" bg="#F5F3FF" border="#DDD6FE" onRemove={() => { setFilterWorkspace(""); setFilterDataset(""); setPage(0); }}/>
              )}
              {filterDataset && (
                <FilterChip label={allDatasets.find((d) => d.id === filterDataset)?.name ?? "Dataset"} color="#6366F1" bg="#EEF2FF" border="#C7D2FE" onRemove={() => { setFilterDataset(""); setPage(0); }}/>
              )}
              {selectedUserObjs.map((u) => (
                <FilterChip key={u.id} label={u.username} color="#0EA5E9" bg="#F0FDF4" border="#BBF7D0" onRemove={() => { setFilterUsers((prev) => prev.filter((id) => id !== u.id)); setPage(0); }}/>
              ))}
              <button onClick={() => { setFilterAction(""); setFilterWorkspace(""); setFilterDataset(""); setFilterUsers([]); setUserSearch(""); setPage(0); }}
                style={{ fontSize:11, fontWeight:600, color:"var(--color-text-muted)", background:"transparent", border:"none", cursor:"pointer", padding:"2px 6px", borderRadius:5, textDecoration:"underline" }}>
                Limpiar todo
              </button>
            </div>
          )}

          <span style={{ marginLeft:"auto", fontSize:12, color:"var(--color-text-muted)", whiteSpace:"nowrap" }}>
            {total.toLocaleString()} resultado{total !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── Tabla ── */}
        <div style={{ background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:14, overflow:"hidden" }}>
          {isLoading ? (
            <div style={{ padding:"72px 0", display:"flex", flexDirection:"column", alignItems:"center", gap:14, color:"var(--color-text-muted)" }}>
              <div style={{ width:32, height:32, borderRadius:"50%", border:"3px solid var(--color-border)", borderTopColor:"var(--color-primary)", animation:"spin 0.8s linear infinite" }}/>
              <span style={{ fontSize:13 }}>Cargando registros…</span>
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding:"72px 0", textAlign:"center", color:"var(--color-text-muted)" }}>
              <div style={{ fontSize:36, marginBottom:12, opacity:0.5 }}>📋</div>
              <p style={{ fontSize:15, margin:0, fontWeight:700, color:"var(--color-text)" }}>Sin registros</p>
              <p style={{ fontSize:13, margin:"6px 0 0" }}>{hasFilters ? "Prueba ajustando los filtros" : "Aún no hay actividad registrada"}</p>
            </div>
          ) : view === "timeline" ? (
            <AuditTimeline items={items} loading={isLoading} />
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"var(--color-bg)", borderBottom:"2px solid var(--color-border)" }}>
                    {[["Cuándo","w:120px"],["Acción",""],["Usuario",""],["Dataset",""],["Campo",""],["Cambio","w:260px"]].map(([h, w]) => (
                      <th key={h} style={{ padding:"9px 14px", textAlign:"left", fontSize:10.5, fontWeight:700, textTransform:"uppercase", color:"var(--color-text-muted)", letterSpacing:"0.07em", whiteSpace:"nowrap", width: w || undefined }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry, idx) => {
                    const meta = ACTION_META[entry.action] ?? ACTION_META.update;
                    const isLast = idx === items.length - 1;
                    const isFiltered = !!entry.user_id && filterUsers.includes(entry.user_id);
                    return (
                      <tr key={entry.id}
                        style={{ borderBottom: isLast ? "none" : "1px solid var(--color-border-light)", transition:"background 0.1s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        {/* Cuándo */}
                        <td style={{ padding:"10px 14px", whiteSpace:"nowrap" }}>
                          <span title={fullDate(entry.changed_at)} style={{ fontSize:12, color:"var(--color-text-muted)", cursor:"default", fontVariantNumeric:"tabular-nums" }}>
                            {timeAgo(entry.changed_at)}
                          </span>
                        </td>

                        {/* Acción */}
                        <td style={{ padding:"10px 14px", whiteSpace:"nowrap" }}>
                          <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11, fontWeight:700, padding:"3px 9px 3px 7px", borderRadius:99, color:meta.color, background:meta.bg, border:`1px solid ${meta.border}` }}>
                            <span style={{ display:"flex", alignItems:"center", color:meta.color }}>{ACTION_ICONS[entry.action]}</span>
                            {meta.label}
                          </span>
                        </td>

                        {/* Usuario — clickeable para filtrar */}
                        <td style={{ padding:"10px 14px", whiteSpace:"nowrap" }}>
                          {entry.user_name ? (
                            <button title={isFiltered ? "Quitar filtro" : `Filtrar por ${entry.user_name}`}
                              onClick={() => { toggleUser(entry.user_id ?? ""); }}
                              style={{ display:"flex", alignItems:"center", gap:6, background: isFiltered ? "#F0FDF4":"transparent", border:`1px solid ${isFiltered ? "#0EA5E950":"transparent"}`, borderRadius:99, padding:"2px 8px 2px 3px", cursor:"pointer", transition:"all 0.12s" }}
                              onMouseEnter={(e) => { if(!isFiltered) { (e.currentTarget as HTMLElement).style.background="var(--color-border-light)"; (e.currentTarget as HTMLElement).style.borderColor="var(--color-border)"; }}}
                              onMouseLeave={(e) => { if(!isFiltered) { (e.currentTarget as HTMLElement).style.background="transparent"; (e.currentTarget as HTMLElement).style.borderColor="transparent"; }}}>
                              <UserAvatar name={entry.user_name} size={22}/>
                              <span style={{ fontSize:12.5, fontWeight: isFiltered ? 700:500, color: isFiltered ? "#0EA5E9":"var(--color-text)" }}>{entry.user_name}</span>
                            </button>
                          ) : (
                            <span style={{ fontSize:12, color:"var(--color-text-muted)", fontStyle:"italic" }}>Sistema</span>
                          )}
                        </td>

                        {/* Dataset */}
                        <td style={{ padding:"10px 14px" }}>
                          <span style={{ fontSize:13, fontWeight:600, color:"var(--color-text)" }}>{entry.dataset_name}</span>
                        </td>

                        {/* Campo */}
                        <td style={{ padding:"10px 14px" }}>
                          {entry.field_key ? (
                            <code style={{ fontSize:11, fontFamily:"var(--font-mono)", background:"var(--color-bg)", border:"1px solid var(--color-border)", borderRadius:5, padding:"2px 7px", color:"var(--color-text-secondary)", whiteSpace:"nowrap" }}>
                              {entry.field_key}
                            </code>
                          ) : <span style={{ color:"var(--color-text-muted)", fontSize:13 }}>—</span>}
                        </td>

                        {/* Diff */}
                        <td style={{ padding:"10px 14px" }}>
                          {entry.old_value !== null || entry.new_value !== null ? (
                            <div style={{ display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
                              {entry.old_value !== null && (
                                <span title={entry.old_value} style={{ color:"#DC2626", background:"#FEF2F2", padding:"2px 7px", borderRadius:5, border:"1px solid #FECACA", maxWidth:110, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"var(--font-mono)", fontSize:11, flexShrink:1 }}>
                                  {entry.old_value || <em style={{ opacity:0.5 }}>vacío</em>}
                                </span>
                              )}
                              {entry.old_value !== null && entry.new_value !== null && (
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" style={{ flexShrink:0 }}>
                                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                                </svg>
                              )}
                              {entry.new_value !== null && (
                                <span title={entry.new_value} style={{ color:"#16A34A", background:"#F0FDF4", padding:"2px 7px", borderRadius:5, border:"1px solid #BBF7D0", maxWidth:110, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"var(--font-mono)", fontSize:11, flexShrink:1 }}>
                                  {entry.new_value || <em style={{ opacity:0.5 }}>vacío</em>}
                                </span>
                              )}
                            </div>
                          ) : <span style={{ color:"var(--color-text-muted)", fontSize:13 }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Paginación ── */}
        {totalPages > 1 && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:16, flexWrap:"wrap", gap:10 }}>
            <span style={{ fontSize:12, color:"var(--color-text-muted)" }}>
              Página {page + 1} de {totalPages} · {total.toLocaleString()} entradas
            </span>
            <div style={{ display:"flex", gap:4 }}>
              <PgBtn label="«" onClick={() => setPage(0)} disabled={page === 0}/>
              <PgBtn label="‹" onClick={() => setPage((p) => Math.max(0, p-1))} disabled={page === 0}/>
              {Array.from({ length: totalPages }, (_, i) => i)
                .filter((i) => Math.abs(i - page) <= 2)
                .map((i) => <PgBtn key={i} label={String(i+1)} onClick={() => setPage(i)} active={i === page}/>)}
              <PgBtn label="›" onClick={() => setPage((p) => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1}/>
              <PgBtn label="»" onClick={() => setPage(totalPages-1)} disabled={page >= totalPages-1}/>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Small reusable components ────────────────────────────────────────────────

function UserAvatar({ name, size = 24 }: { name: string; size?: number }) {
  const c = userColor(name);
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", flexShrink:0, background:c+"1A", border:`1.5px solid ${c}40`, color:c, fontSize:size*0.4, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function FilterChip({ label, color, bg, border, onRemove }: { label: string; color: string; bg: string; border: string; onRemove: () => void }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 8px 3px 10px", borderRadius:99, background:bg, border:`1px solid ${border}`, fontSize:12, fontWeight:600, color }}>
      {label}
      <button onClick={onRemove} style={{ background:"none", border:"none", cursor:"pointer", color, display:"flex", alignItems:"center", padding:0, opacity:0.7 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </span>
  );
}

function PgBtn({ label, onClick, disabled, active }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled || active}
      style={{ height:32, minWidth:32, padding:"0 10px", borderRadius:8, fontSize:12, fontWeight:600, cursor: disabled || active ? "default":"pointer", border:"1.5px solid", borderColor: active ? "var(--color-primary,#0EA5E9)":"var(--color-border)", background: active ? "var(--color-primary,#0EA5E9)":"var(--color-surface)", color: active ? "#fff":"var(--color-text-secondary)", opacity: disabled ? 0.4:1, transition:"all 0.12s" }}>
      {label}
    </button>
  );
}

function selectStyle(active: boolean): React.CSSProperties {
  return {
    fontSize:13, height:32, padding:"0 10px", borderRadius:7,
    border:`1px solid ${active ? "var(--color-primary,#0EA5E9)":"var(--color-border)"}`,
    background: active ? "#F0FDF4":"var(--color-bg)",
    color: active ? "#0EA5E9":"var(--color-text-muted)",
    cursor:"pointer", outline:"none", fontWeight: active ? 600:400,
  };
}

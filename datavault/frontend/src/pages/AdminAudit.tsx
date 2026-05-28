import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import AuditTimeline from "../components/AuditTimeline";
import AppShell from "../components/chrome/AppShell";
import {
  Lock, History, Download, FileText, FileSpreadsheet, ChevronDown,
  Filter, User, X, ChevronLeft, ChevronRight, Search, Check,
  Plus, Pencil, Trash2, RotateCcw, ArrowRight, List, Clock,
} from "lucide-react";

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

const ACTION_META: Record<string, { label: string; chip: string; icon: React.ReactNode }> = {
  create:  { label: "Creado",     chip: "is-create", icon: <Plus /> },
  update:  { label: "Editado",    chip: "is-update", icon: <Pencil /> },
  delete:  { label: "Eliminado",  chip: "is-delete", icon: <Trash2 /> },
  restore: { label: "Restaurado", chip: "is-import", icon: <RotateCcw /> },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}
function fullDate(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function shortStamp(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

const PAGE_SIZE = 50;

export default function AdminAudit() {
  const { isAdmin } = useAuth();
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
    <AppShell active="audit">
      <main className="page">
        <div className="empty" style={{ marginTop: "var(--sp-8)" }}>
          <span className="empty__art"><Lock /></span>
          <h4>Solo administradores</h4>
          <p>Esta sección requiere rol de administrador global.</p>
        </div>
      </main>
    </AppShell>
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!filterAction || !!filterWorkspace || !!filterDataset || filterUsers.length > 0;

  return (
    <AppShell active="audit">
      <main className="page" style={{ maxWidth: "none", width: "100%", overflowY: "auto" }}>

        {/* ── Page header ── */}
        <div className="page-header">
          <div>
            <h1>Registro de auditoría</h1>
            <p>
              Historial inmutable de todo lo que pasa en el workspace · {total.toLocaleString()} entrada{total !== 1 ? "s" : ""}.
            </p>
          </div>
          <div className="page-header__actions">
            {/* View toggle: Tabla / Timeline */}
            <div className="segmented" role="tablist" aria-label="Vista">
              <button
                className={`segmented__item${view === "table" ? " is-active" : ""}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: view === "table" ? undefined : "transparent" }}
                onClick={() => setView("table")}
              >
                <List style={{ width: 13, height: 13 }} /> Tabla
              </button>
              <button
                className={`segmented__item${view === "timeline" ? " is-active" : ""}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: view === "timeline" ? undefined : "transparent" }}
                onClick={() => setView("timeline")}
              >
                <Clock style={{ width: 13, height: 13 }} /> Timeline
              </button>
            </div>

            {/* Export dropdown */}
            <div ref={exportRef} style={{ position: "relative" }}>
              <button
                className={`btn btn--secondary${downloading ? " is-loading" : ""}`}
                onClick={() => setExportOpen((v) => !v)}
                disabled={downloading || total === 0}
              >
                <Download /> {downloading ? "Exportando…" : "Exportar"}
                <ChevronDown style={{ transform: exportOpen ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
              </button>

              {exportOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 200, zIndex: 50,
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "var(--r-3)", boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,.12))", overflow: "hidden",
                }}>
                  <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid var(--border-soft)" }}>
                    <p style={{ margin: 0, fontSize: "var(--fs-11)", fontWeight: 600, color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                      {hasFilters ? "Exportar con filtros" : "Exportar todo"}
                    </p>
                  </div>
                  {[
                    { label: "CSV", sub: "Compatible con cualquier app", icon: <FileText />, fn: exportCSV },
                    { label: "Excel (.xls)", sub: "Abre directo en Excel", icon: <FileSpreadsheet />, fn: exportExcel },
                  ].map(({ label, sub, icon, fn }) => (
                    <button key={label} onClick={fn} style={{ width: "100%", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}>
                      <span style={{ display: "inline-flex", color: "var(--text-soft)", lineHeight: 1 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--text)" }}>{label}</div>
                        <div style={{ fontSize: "var(--fs-11)", color: "var(--text-mute)" }}>{sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="dv-toolbar-wrap" style={{ border: "1px solid var(--border-soft)", borderRadius: "var(--r-3)", overflow: "visible", marginBottom: "var(--sp-4)" }}>
          <div className="dv-toolbar" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", padding: "var(--sp-2) var(--sp-3)", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--fs-11)", fontWeight: 600, color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: ".04em", marginRight: 2 }}>
              <Filter style={{ width: 14, height: 14 }} /> Filtros
            </span>

            {/* Acción */}
            <select className="input" value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setPage(0); }} style={{ width: "auto", height: 32 }}>
              <option value="">Toda acción</option>
              <option value="create">Creaciones</option>
              <option value="update">Ediciones</option>
              <option value="delete">Eliminaciones</option>
              <option value="restore">Restauraciones</option>
            </select>

            {/* Workspace */}
            <select className="input" value={filterWorkspace} onChange={(e) => { setFilterWorkspace(e.target.value); setFilterDataset(""); setPage(0); }} style={{ width: "auto", height: 32, maxWidth: 180 }}>
              <option value="">Todo workspace</option>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>

            {/* Dataset — filtered by workspace */}
            <select className="input" value={filterDataset} onChange={(e) => { setFilterDataset(e.target.value); setPage(0); }} style={{ width: "auto", height: 32, maxWidth: 200 }} disabled={datasets.length === 0 && !filterDataset}>
              <option value="">Todo dataset</option>
              {datasets.map((ds) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
            </select>

            {/* Persona — dropdown multi-select */}
            <div ref={userDropRef} style={{ position: "relative" }}>
              <button
                className={`btn btn--secondary btn--sm${filterUsers.length ? " is-active" : ""}`}
                onClick={() => setUserDropOpen((v) => !v)}
                style={{ height: 32 }}
              >
                {filterUsers.length === 0 ? (
                  <><User /> Toda persona</>
                ) : filterUsers.length === 1 ? (
                  <><span className="avatar avatar--xs">{initials(selectedUserObjs[0].username)}</span>{selectedUserObjs[0].username}</>
                ) : (
                  <>
                    <span className="avatar-group">
                      {selectedUserObjs.slice(0, 3).map((u) => (
                        <span key={u.id} className="avatar avatar--xs">{initials(u.username)}</span>
                      ))}
                    </span>
                    {filterUsers.length} personas
                  </>
                )}
                <ChevronDown style={{ transform: userDropOpen ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
              </button>

              {userDropOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 260, zIndex: 50, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,.13))", overflow: "hidden" }}>
                  <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-soft)" }}>
                    <span className="input-affix" style={{ width: "100%" }}>
                      <Search />
                      <input autoFocus className="input input--with-icon" placeholder="Buscar persona…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} style={{ width: "100%", height: 32 }} />
                    </span>
                  </div>
                  {filterUsers.length > 0 && (
                    <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "var(--fs-11)", color: "var(--text-mute)" }}>{filterUsers.length} seleccionada{filterUsers.length > 1 ? "s" : ""}</span>
                      <button className="btn btn--ghost btn--sm" onClick={() => { setFilterUsers([]); setPage(0); }} style={{ color: "var(--danger)" }}>Limpiar</button>
                    </div>
                  )}
                  <div style={{ maxHeight: 240, overflowY: "auto" }}>
                    {filteredUsers.map((u) => {
                      const isActive = filterUsers.includes(u.id);
                      return (
                        <button key={u.id} onClick={() => toggleUser(u.id)}
                          style={{ width: "100%", padding: "7px 12px", background: isActive ? "var(--accent-pri-soft)" : "transparent", border: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${isActive ? "var(--accent-pri)" : "var(--border-strong)"}`, background: isActive ? "var(--accent-pri)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff" }}>
                            {isActive && <Check style={{ width: 11, height: 11 }} />}
                          </span>
                          <span className="avatar avatar--sm">{initials(u.username)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "var(--fs-13)", fontWeight: isActive ? 600 : 500, color: isActive ? "var(--accent-pri)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.username}</div>
                            <div style={{ fontSize: "var(--fs-11)", color: "var(--text-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                          </div>
                        </button>
                      );
                    })}
                    {filteredUsers.length === 0 && <p style={{ padding: "10px 12px", fontSize: "var(--fs-12)", color: "var(--text-mute)", margin: 0 }}>Sin resultados</p>}
                  </div>
                </div>
              )}
            </div>

            <span style={{ marginLeft: "auto", fontSize: "var(--fs-12)", color: "var(--text-mute)", whiteSpace: "nowrap" }}>
              <b style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{total.toLocaleString()}</b> resultado{total !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="dv-filters" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", padding: "var(--sp-2) var(--sp-3)", borderTop: "1px dashed var(--border-soft)", flexWrap: "wrap" }}>
              <span style={{ fontSize: "var(--fs-11)", color: "var(--text-mute)", fontWeight: 600 }}>Filtros activos</span>
              {filterAction && (
                <Chip label={ACTION_META[filterAction]?.label ?? filterAction} onRemove={() => { setFilterAction(""); setPage(0); }} />
              )}
              {filterWorkspace && (
                <Chip label={workspaces.find((w) => w.id === filterWorkspace)?.name ?? "Workspace"} onRemove={() => { setFilterWorkspace(""); setFilterDataset(""); setPage(0); }} />
              )}
              {filterDataset && (
                <Chip label={allDatasets.find((d) => d.id === filterDataset)?.name ?? "Dataset"} onRemove={() => { setFilterDataset(""); setPage(0); }} />
              )}
              {selectedUserObjs.map((u) => (
                <Chip key={u.id} label={u.username} onRemove={() => { setFilterUsers((prev) => prev.filter((id) => id !== u.id)); setPage(0); }} />
              ))}
              <button className="btn btn--ghost btn--sm" onClick={() => { setFilterAction(""); setFilterWorkspace(""); setFilterDataset(""); setFilterUsers([]); setUserSearch(""); setPage(0); }}>
                Limpiar todo
              </button>
            </div>
          )}
        </div>

        {/* ── Content: timeline / table / empty ── */}
        {isLoading ? (
          <div className="empty">
            <span className="empty__art"><History /></span>
            <h4>Cargando registros…</h4>
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            <span className="empty__art"><List /></span>
            <h4>Sin registros</h4>
            <p>{hasFilters ? "Probá ajustando los filtros." : "Aún no hay actividad registrada."}</p>
          </div>
        ) : view === "timeline" ? (
          <AuditTimeline items={items} loading={isLoading} />
        ) : (
          <table className="audit-tbl">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Cuándo</th>
                <th style={{ width: 200 }}>Quién</th>
                <th style={{ width: 120 }}>Acción</th>
                <th>Objetivo</th>
                <th>Cambio</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => {
                const meta = ACTION_META[entry.action] ?? ACTION_META.update;
                const isFiltered = !!entry.user_id && filterUsers.includes(entry.user_id);
                return (
                  <tr key={entry.id}>
                    {/* Cuándo */}
                    <td>
                      <span className="when" title={fullDate(entry.changed_at)}>{timeAgo(entry.changed_at)}</span>
                      <div style={{ fontSize: 10, color: "var(--text-mute)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                        {shortStamp(entry.changed_at)}
                      </div>
                    </td>

                    {/* Quién — clickeable para filtrar */}
                    <td>
                      {entry.user_name ? (
                        <button
                          className="who"
                          title={isFiltered ? "Quitar filtro" : `Filtrar por ${entry.user_name}`}
                          onClick={() => toggleUser(entry.user_id ?? "")}
                          style={{ background: isFiltered ? "var(--accent-pri-soft)" : "transparent", border: "none", borderRadius: "var(--r-2)", padding: "2px 6px 2px 2px", cursor: "pointer" }}
                        >
                          <span className="avatar avatar--xs">{initials(entry.user_name)}</span>
                          <b style={{ color: isFiltered ? "var(--accent-pri)" : undefined }}>{entry.user_name}</b>
                        </button>
                      ) : (
                        <span className="who"><span className="avatar avatar--xs avatar--calc">ƒ</span><b style={{ color: "var(--text-mute)", fontStyle: "italic" }}>Sistema</b></span>
                      )}
                    </td>

                    {/* Acción */}
                    <td>
                      <span className={`action-chip ${meta.chip}`}>{meta.icon} {meta.label.toUpperCase()}</span>
                    </td>

                    {/* Objetivo */}
                    <td>
                      <span className="target"><b>{entry.dataset_name}</b></span>
                      {entry.field_key && (
                        <div style={{ fontSize: "var(--fs-11)", color: "var(--text-mute)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                          columna · {entry.field_key}
                        </div>
                      )}
                    </td>

                    {/* Cambio (diff) */}
                    <td>
                      {entry.old_value !== null || entry.new_value !== null ? (
                        <div className="diff">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {entry.old_value !== null && (
                              <code className="old">{entry.old_value || "vacío"}</code>
                            )}
                            {entry.old_value !== null && entry.new_value !== null && (
                              <ArrowRight style={{ width: 11, height: 11, color: "var(--text-mute)" }} />
                            )}
                            {entry.new_value !== null && (
                              <code className="new">{entry.new_value || "vacío"}</code>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-mute)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* ── Footer / pagination ── */}
        {!isLoading && items.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--sp-4)", padding: "0 var(--sp-1)", fontSize: "var(--fs-12)", color: "var(--text-mute)", flexWrap: "wrap", gap: "var(--sp-2)" }}>
            <span>
              Mostrando {items.length} de <b style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{total.toLocaleString()}</b> evento{total !== 1 ? "s" : ""}
            </span>
            {totalPages > 1 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <button className="btn btn--secondary btn--icon btn--sm" title="Anterior" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  <ChevronLeft />
                </button>
                <span style={{ padding: "0 var(--sp-2)", color: "var(--text)", fontWeight: 600 }}>{page + 1} / {totalPages}</span>
                <button className="btn btn--secondary btn--icon btn--sm" title="Siguiente" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                  <ChevronRight />
                </button>
              </span>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}

// ── Small reusable components ────────────────────────────────────────────────

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="chip">
      {label}
      <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", display: "inline-flex", alignItems: "center", padding: 0, marginLeft: 4, opacity: 0.7 }}>
        <X style={{ width: 12, height: 12 }} />
      </button>
    </span>
  );
}

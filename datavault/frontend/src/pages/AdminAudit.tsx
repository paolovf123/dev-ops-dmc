import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import AuditTimeline from "../components/AuditTimeline";
import AppShell from "../components/chrome/AppShell";
import { Avatar, Badge, Btn, Chip as KitChip, type Tone } from "../components/ui/kit";
import {
  Lock, BarChart3, Download, FileText, FileSpreadsheet, ChevronDown,
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

// Acción → label, tono semántico (badge handoff CREÓ/EDITÓ/ELIMINÓ/RESTAURÓ) e icono lucide
const ACTION_META: Record<string, { label: string; verb: string; tone: Tone; icon: React.ReactNode }> = {
  create:  { label: "Creado",     verb: "CREÓ",      tone: "success", icon: <Plus size={13} /> },
  update:  { label: "Editado",    verb: "EDITÓ",     tone: "primary", icon: <Pencil size={13} /> },
  delete:  { label: "Eliminado",  verb: "ELIMINÓ",   tone: "danger",  icon: <Trash2 size={13} /> },
  restore: { label: "Restaurado", verb: "RESTAURÓ",  tone: "warn",    icon: <RotateCcw size={13} /> },
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

const PAGE_SIZE = 50;

// Estilo común de los <select> de la barra de filtros (look "chip" del handoff)
const selectStyle: React.CSSProperties = {
  appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
  height: 34, padding: "0 30px 0 12px", borderRadius: "var(--r-2)",
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", font: "500 12.5px/1 var(--font-sans)", cursor: "pointer",
  backgroundImage:
    "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%2398a1b2' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e\")",
  backgroundRepeat: "no-repeat", backgroundPosition: "right 9px center",
};

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

  // ── Sin acceso (no admin global) ──
  if (!isAdmin) return (
    <AppShell active="audit">
      <main className="home-main" style={{ overflowY: "auto" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 32px 80px" }}>
          <div className="og-rise" style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            textAlign: "center", padding: "60px 24px", marginTop: 24,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--r-3)", boxShadow: "var(--shadow-1)",
          }}>
            <span style={{
              display: "grid", placeItems: "center", width: 56, height: 56,
              borderRadius: "var(--r-3)", background: "var(--danger-soft)", color: "var(--danger)",
            }}><Lock size={26} /></span>
            <h4 style={{ margin: 0, font: "700 18px/1.2 var(--font-sans)", color: "var(--text)" }}>Solo administradores</h4>
            <p style={{ margin: 0, font: "400 14px/1.5 var(--font-sans)", color: "var(--text-soft)" }}>
              Esta sección requiere rol de administrador global.
            </p>
          </div>
        </div>
      </main>
    </AppShell>
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!filterAction || !!filterWorkspace || !!filterDataset || filterUsers.length > 0;

  // Grid de columnas compartido entre header y filas (Tabla)
  const GRID_COLS = "138px 1.2fr 116px 1.4fr 1.5fr";

  return (
    <AppShell active="audit">
      <main className="home-main" style={{ overflowY: "auto", padding: 0 }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 32px 80px" }}>

          {/* ── Page header ── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 22 }}>
            <div>
              <h1 style={{ margin: 0, font: "700 28px/1.1 var(--font-sans)", letterSpacing: "-.02em", color: "var(--text)", display: "flex", alignItems: "center", gap: 10 }}>
                <BarChart3 size={25} style={{ color: "var(--accent-pri)" }} /> Registro de auditoría
              </h1>
              <p style={{ margin: "7px 0 0", font: "400 15px/1.4 var(--font-sans)", color: "var(--text-soft)" }}>
                Historial inmutable de todo lo que pasa en el workspace · {total.toLocaleString()} entrada{total !== 1 ? "s" : ""}.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {/* View toggle: Tabla / Línea de tiempo */}
              <div role="tablist" aria-label="Vista" style={{
                display: "inline-flex", padding: 3, borderRadius: "var(--r-2)",
                background: "var(--surface-alt)", border: "1px solid var(--border)",
              }}>
                {([["table", "Tabla", <List size={14} key="l" />], ["timeline", "Línea", <Clock size={14} key="c" />]] as const).map(([k, l, ic]) => (
                  <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k as "table" | "timeline")} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    font: "600 12.5px/1 var(--font-sans)", padding: "7px 11px", borderRadius: 6,
                    border: "none", cursor: "pointer",
                    background: view === k ? "var(--surface)" : "transparent",
                    color: view === k ? "var(--text)" : "var(--text-soft)",
                    boxShadow: view === k ? "var(--shadow-1)" : "none", transition: "all var(--t-fast)",
                  }}>{ic}{l}</button>
                ))}
              </div>

              {/* Export dropdown */}
              <div ref={exportRef} style={{ position: "relative" }}>
                <Btn variant="soft" icon={<Download size={16} />} iconR={
                  <ChevronDown size={15} style={{ transform: exportOpen ? "rotate(180deg)" : "none", transition: "transform var(--t-fast)" }} />
                } onClick={() => setExportOpen((v) => !v)} disabled={downloading || total === 0}>
                  {downloading ? "Exportando…" : "Exportar"}
                </Btn>

                {exportOpen && (
                  <div className="og-pop" style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 230, zIndex: 50,
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: "var(--r-3)", boxShadow: "var(--shadow-3)", overflow: "hidden",
                    animation: "ogPop var(--t-fast)",
                  }}>
                    <div style={{ padding: "9px 13px 7px", borderBottom: "1px solid var(--border-soft)" }}>
                      <p style={{ margin: 0, font: "600 11px/1 var(--font-sans)", color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                        {hasFilters ? "Exportar con filtros" : "Exportar todo"}
                      </p>
                    </div>
                    {[
                      { label: "CSV", sub: "Compatible con cualquier app", icon: <FileText size={17} />, fn: exportCSV },
                      { label: "Excel (.xls)", sub: "Abre directo en Excel", icon: <FileSpreadsheet size={17} />, fn: exportExcel },
                    ].map(({ label, sub, icon, fn }) => (
                      <button key={label} onClick={fn} className="og-menu-item" style={{
                        width: "100%", padding: "10px 14px", display: "flex", alignItems: "center", gap: 11,
                        textAlign: "left", background: "transparent", border: "none", cursor: "pointer",
                      }}>
                        <span style={{ display: "inline-flex", color: "var(--accent-pri)", lineHeight: 1 }}>{icon}</span>
                        <div>
                          <div style={{ font: "600 13.5px/1.2 var(--font-sans)", color: "var(--text)" }}>{label}</div>
                          <div style={{ font: "400 11.5px/1.2 var(--font-sans)", color: "var(--text-mute)", marginTop: 2 }}>{sub}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Filter bar ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "600 11px/1 var(--font-sans)", color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: ".04em", marginRight: 2 }}>
              <Filter size={14} /> Filtros
            </span>

            {/* Acción */}
            <select value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setPage(0); }} style={selectStyle}>
              <option value="">Toda acción</option>
              <option value="create">Creaciones</option>
              <option value="update">Ediciones</option>
              <option value="delete">Eliminaciones</option>
              <option value="restore">Restauraciones</option>
            </select>

            {/* Workspace */}
            <select value={filterWorkspace} onChange={(e) => { setFilterWorkspace(e.target.value); setFilterDataset(""); setPage(0); }} style={{ ...selectStyle, maxWidth: 180 }}>
              <option value="">Todo workspace</option>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>

            {/* Dataset — filtered by workspace */}
            <select value={filterDataset} onChange={(e) => { setFilterDataset(e.target.value); setPage(0); }} disabled={datasets.length === 0 && !filterDataset}
              style={{ ...selectStyle, maxWidth: 200, opacity: datasets.length === 0 && !filterDataset ? 0.55 : 1, cursor: datasets.length === 0 && !filterDataset ? "not-allowed" : "pointer" }}>
              <option value="">Todo dataset</option>
              {datasets.map((ds) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
            </select>

            {/* Persona — dropdown multi-select */}
            <div ref={userDropRef} style={{ position: "relative" }}>
              <button onClick={() => setUserDropOpen((v) => !v)} style={{
                display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 11px",
                borderRadius: "var(--r-2)", cursor: "pointer",
                border: `1px solid ${filterUsers.length ? "color-mix(in srgb, var(--accent-pri) 40%, transparent)" : "var(--border)"}`,
                background: filterUsers.length ? "var(--pri-soft)" : "var(--surface)",
                color: filterUsers.length ? "var(--accent-pri)" : "var(--text)",
                font: "500 12.5px/1 var(--font-sans)",
              }}>
                {filterUsers.length === 0 ? (
                  <><User size={14} /> Toda persona</>
                ) : filterUsers.length === 1 ? (
                  <><Avatar name={selectedUserObjs[0].username} size={18} />{selectedUserObjs[0].username}</>
                ) : (
                  <>
                    <span style={{ display: "inline-flex" }}>
                      {selectedUserObjs.slice(0, 3).map((u, i) => (
                        <span key={u.id} style={{ marginLeft: i === 0 ? 0 : -7 }}>
                          <Avatar name={u.username} size={18} ring />
                        </span>
                      ))}
                    </span>
                    {filterUsers.length} personas
                  </>
                )}
                <ChevronDown size={14} style={{ transform: userDropOpen ? "rotate(180deg)" : "none", transition: "transform var(--t-fast)" }} />
              </button>

              {userDropOpen && (
                <div className="og-pop" style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 264, zIndex: 50,
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
                  boxShadow: "var(--shadow-3)", overflow: "hidden", animation: "ogPop var(--t-fast)",
                }}>
                  <div style={{ padding: "9px 10px", borderBottom: "1px solid var(--border-soft)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                      <Search size={15} style={{ color: "var(--text-mute)", flex: "none" }} />
                      <input autoFocus placeholder="Buscar persona…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                        style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--text)", font: "400 13px/1 var(--font-sans)" }} />
                    </div>
                  </div>
                  {filterUsers.length > 0 && (
                    <div style={{ padding: "7px 12px", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ font: "400 11.5px/1 var(--font-sans)", color: "var(--text-mute)" }}>{filterUsers.length} seleccionada{filterUsers.length > 1 ? "s" : ""}</span>
                      <button onClick={() => { setFilterUsers([]); setPage(0); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--danger)", font: "600 12px/1 var(--font-sans)" }}>Limpiar</button>
                    </div>
                  )}
                  <div style={{ maxHeight: 252, overflowY: "auto" }}>
                    {filteredUsers.map((u) => {
                      const isActive = filterUsers.includes(u.id);
                      return (
                        <button key={u.id} onClick={() => toggleUser(u.id)} className={isActive ? undefined : "og-menu-item"}
                          style={{ width: "100%", padding: "8px 12px", background: isActive ? "var(--pri-soft)" : "transparent", border: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 9 }}>
                          <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${isActive ? "var(--accent-pri)" : "var(--border-strong)"}`, background: isActive ? "var(--accent-pri)" : "transparent", display: "grid", placeItems: "center", flexShrink: 0, color: "#fff" }}>
                            {isActive && <Check size={11} strokeWidth={3} />}
                          </span>
                          <Avatar name={u.username} size={26} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ font: `${isActive ? 600 : 500} 13px/1.2 var(--font-sans)`, color: isActive ? "var(--accent-pri)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.username}</div>
                            <div style={{ font: "400 11.5px/1.2 var(--font-sans)", color: "var(--text-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{u.email}</div>
                          </div>
                        </button>
                      );
                    })}
                    {filteredUsers.length === 0 && <p style={{ padding: "12px", font: "400 12.5px/1 var(--font-sans)", color: "var(--text-mute)", margin: 0 }}>Sin resultados</p>}
                  </div>
                </div>
              )}
            </div>

            <div style={{ flex: 1 }} />
            <span style={{ font: "400 13px/1 var(--font-mono)", color: "var(--text-mute)", whiteSpace: "nowrap" }}>
              <b style={{ color: "var(--text)" }}>{total.toLocaleString()}</b> evento{total !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ font: "600 11px/1 var(--font-sans)", color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: ".04em" }}>Activos</span>
              {filterAction && (
                <FilterChip label={`Acción: ${ACTION_META[filterAction]?.label ?? filterAction}`} onRemove={() => { setFilterAction(""); setPage(0); }} />
              )}
              {filterWorkspace && (
                <FilterChip label={`Workspace: ${workspaces.find((w) => w.id === filterWorkspace)?.name ?? "—"}`} onRemove={() => { setFilterWorkspace(""); setFilterDataset(""); setPage(0); }} />
              )}
              {filterDataset && (
                <FilterChip label={`Dataset: ${allDatasets.find((d) => d.id === filterDataset)?.name ?? "—"}`} onRemove={() => { setFilterDataset(""); setPage(0); }} />
              )}
              {selectedUserObjs.map((u) => (
                <FilterChip key={u.id} label={u.username} onRemove={() => { setFilterUsers((prev) => prev.filter((id) => id !== u.id)); setPage(0); }} />
              ))}
              <button onClick={() => { setFilterAction(""); setFilterWorkspace(""); setFilterDataset(""); setFilterUsers([]); setUserSearch(""); setPage(0); }}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--accent-pri)", font: "600 12px/1 var(--font-sans)" }}>
                Limpiar todo
              </button>
            </div>
          )}

          {/* ── Content: timeline / table / empty ── */}
          {isLoading ? (
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="og-rise" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: i < 4 ? "1px solid var(--border)" : "none", animationDelay: `${i * 55}ms` }}>
                  <div className="og-shimmer" style={{ width: 80, height: 12, borderRadius: 5 }} />
                  <div className="og-shimmer" style={{ width: 26, height: 26, borderRadius: 999 }} />
                  <div className="og-shimmer" style={{ width: 120, height: 12, borderRadius: 5 }} />
                  <div className="og-shimmer" style={{ width: 70, height: 20, borderRadius: 999 }} />
                  <div className="og-shimmer" style={{ flex: 1, height: 12, borderRadius: 5 }} />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="og-rise" style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              textAlign: "center", padding: "60px 24px",
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--r-3)", boxShadow: "var(--shadow-1)",
            }}>
              <span style={{ display: "grid", placeItems: "center", width: 56, height: 56, borderRadius: "var(--r-3)", background: "var(--surface-alt)", color: "var(--text-mute)" }}>
                <List size={26} />
              </span>
              <h4 style={{ margin: 0, font: "700 18px/1.2 var(--font-sans)", color: "var(--text)" }}>Sin registros</h4>
              <p style={{ margin: 0, font: "400 14px/1.5 var(--font-sans)", color: "var(--text-soft)" }}>
                {hasFilters ? "Probá ajustando los filtros." : "Aún no hay actividad registrada."}
              </p>
            </div>
          ) : view === "timeline" ? (
            <AuditTimeline items={items} loading={isLoading} />
          ) : (
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
              {/* head */}
              <div style={{ display: "grid", gridTemplateColumns: GRID_COLS, padding: "11px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", font: "600 12px/1 var(--font-sans)", color: "var(--text-mute)" }}>
                <span>Cuándo</span><span>Quién</span><span>Acción</span><span>Objetivo</span><span>Cambio</span>
              </div>
              {items.map((entry, i) => {
                const meta = ACTION_META[entry.action] ?? ACTION_META.update;
                const isFiltered = !!entry.user_id && filterUsers.includes(entry.user_id);
                return (
                  <div key={entry.id} className="og-gridrow og-rise" style={{
                    display: "grid", gridTemplateColumns: GRID_COLS, alignItems: "center",
                    padding: "12px 16px", borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none",
                    animationDelay: `${Math.min(i, 12) * 28}ms`,
                  }}>
                    {/* Cuándo */}
                    <span>
                      <span title={fullDate(entry.changed_at)} style={{ display: "block", font: "500 12.5px/1.2 var(--font-sans)", color: "var(--text)" }}>{timeAgo(entry.changed_at)}</span>
                      <span className="mono" style={{ display: "block", font: "400 10.5px/1.2 var(--font-mono)", color: "var(--text-mute)", marginTop: 2 }}>{shortStamp(entry.changed_at)}</span>
                    </span>

                    {/* Quién — clickeable para filtrar */}
                    <span>
                      {entry.user_name ? (
                        <button
                          title={isFiltered ? "Quitar filtro" : `Filtrar por ${entry.user_name}`}
                          onClick={() => toggleUser(entry.user_id ?? "")}
                          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: isFiltered ? "var(--pri-soft)" : "transparent", border: "none", borderRadius: "var(--r-pill)", padding: "3px 9px 3px 3px", cursor: "pointer", maxWidth: "100%" }}>
                          <Avatar name={entry.user_name} size={24} />
                          <span style={{ font: "600 13px/1 var(--font-sans)", color: isFiltered ? "var(--accent-pri)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.user_name}</span>
                        </button>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span className="mono" style={{ display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: "var(--r-pill)", background: "var(--calc-soft)", color: "var(--accent-calc)", font: "700 12px/1 var(--font-mono)" }}>ƒ</span>
                          <span style={{ font: "500 13px/1 var(--font-sans)", color: "var(--text-mute)", fontStyle: "italic" }}>Sistema</span>
                        </span>
                      )}
                    </span>

                    {/* Acción */}
                    <span>
                      <Badge tone={meta.tone}>{meta.icon} {meta.verb}</Badge>
                    </span>

                    {/* Objetivo */}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", font: "600 13px/1.3 var(--font-sans)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.dataset_name}</span>
                      {entry.field_key && (
                        <span className="mono" style={{ display: "block", font: "400 11px/1.2 var(--font-mono)", color: "var(--text-mute)", marginTop: 2 }}>
                          columna · {entry.field_key}
                        </span>
                      )}
                    </span>

                    {/* Cambio (diff) */}
                    <span style={{ minWidth: 0 }}>
                      {entry.old_value !== null || entry.new_value !== null ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {entry.old_value !== null && (
                            <code className="mono" style={{ font: "400 11.5px/1.2 var(--font-mono)", padding: "2px 7px", borderRadius: 6, background: "var(--danger-soft)", color: "var(--danger)", textDecoration: "line-through", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.old_value || "vacío"}</code>
                          )}
                          {entry.old_value !== null && entry.new_value !== null && (
                            <ArrowRight size={12} style={{ color: "var(--text-mute)", flex: "none" }} />
                          )}
                          {entry.new_value !== null && (
                            <code className="mono" style={{ font: "400 11.5px/1.2 var(--font-mono)", padding: "2px 7px", borderRadius: 6, background: "var(--success-soft)", color: "var(--success)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.new_value || "vacío"}</code>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-mute)" }}>—</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Footer / pagination ── */}
          {!isLoading && items.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, padding: "0 2px", font: "400 12.5px/1 var(--font-sans)", color: "var(--text-mute)", flexWrap: "wrap", gap: 10 }}>
              <span>
                Mostrando {items.length} de <b className="mono" style={{ color: "var(--text)" }}>{total.toLocaleString()}</b> evento{total !== 1 ? "s" : ""}
              </span>
              {totalPages > 1 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <button className="og-iconbtn" title="Anterior" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                    style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-soft)", cursor: page === 0 ? "not-allowed" : "pointer", opacity: page === 0 ? 0.5 : 1 }}>
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{ padding: "0 8px", color: "var(--text)", font: "600 12.5px/1 var(--font-sans)" }}>{page + 1} / {totalPages}</span>
                  <button className="og-iconbtn" title="Siguiente" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-soft)", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer", opacity: page >= totalPages - 1 ? 0.5 : 1 }}>
                    <ChevronRight size={16} />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}

// ── Chip de filtro activo (estilo handoff: pill con × removible) ────────────────
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <KitChip tone="neutral" style={{ paddingRight: 4 }}>
      {label}
      <button onClick={onRemove} title="Quitar filtro" style={{
        display: "grid", placeItems: "center", width: 17, height: 17, marginLeft: 2,
        border: "none", background: "transparent", cursor: "pointer", color: "var(--text-mute)", borderRadius: 999,
      }}>
        <X size={12} />
      </button>
    </KitChip>
  );
}

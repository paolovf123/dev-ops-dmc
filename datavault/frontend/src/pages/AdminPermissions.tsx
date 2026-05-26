import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getWorkspaces } from "../api/workspaces";
import { getGroups } from "../api/groups";
import { getDatasets } from "../api/datasets";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import UserMenu from "../components/UserMenu";
import WsTabPermissions from "../components/admin/WsTabPermissions";
import DatasetAccessModal from "../components/DatasetAccessModal";

type Tab = "by_workspace" | "by_group" | "by_user" | "by_dataset";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
}

export default function AdminPermissions() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("by_workspace");

  // Solo admin global ve esta página
  if (!isAdmin) {
    return (
      <main className="page" style={{ padding: 40, textAlign: "center" }}>
        <h2>Acceso restringido</h2>
        <p style={{ color: "var(--color-text-muted)" }}>
          Esta sección es solo para administradores globales.
        </p>
        <button className="btn btn-primary" onClick={() => navigate("/")}>Volver al inicio</button>
      </main>
    );
  }

  return (
    <>
      <header className="app-header">
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo app-header-logo--img"><img src="/opsgrid-logo.svg" alt="OpsGrid" /></div>
          <span className="app-header-name">Ops<em>Grid</em></span>
        </button>
        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Centro de permisos</span>
        <div className="app-header-spacer" />
        <nav style={{ display: "flex", gap: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 13, gap: 6 }} onClick={() => navigate("/admin/workspaces")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Workspaces
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 13, gap: 6 }} onClick={() => navigate("/admin/users")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            Usuarios
          </button>
        </nav>
        <UserMenu />
      </header>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 28px 48px" }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
            🔐 Centro de permisos
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
            Vista cross-workspace de seguridad y accesos. Solo visible para admin global del sistema.
          </p>
        </div>

        {/* Tab bar */}
        <div style={{
          display: "flex", gap: 2, marginBottom: 20,
          borderBottom: "1px solid var(--color-border)", paddingBottom: 0,
        }}>
          {([
            ["by_workspace", "🏢 Por workspace"],
            ["by_group",     "🔗 Por grupo"],
            ["by_user",      "👤 Por usuario"],
            ["by_dataset",   "📊 Por dataset"],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{
                padding: "10px 16px", fontSize: 13, fontWeight: tab === k ? 700 : 500,
                background: "none", border: "none", cursor: "pointer",
                borderBottom: tab === k ? "2px solid var(--color-primary)" : "2px solid transparent",
                color: tab === k ? "var(--color-primary)" : "var(--color-text-secondary)",
                marginBottom: -1,
              }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "by_workspace" && <ByWorkspaceTab />}
        {tab === "by_group"     && <ByGroupTab />}
        {tab === "by_user"      && <ByUserTab />}
        {tab === "by_dataset"   && <ByDatasetTab />}
      </div>
    </>
  );
}

// ── Tab: Por workspace ───────────────────────────────────────────────────────
function ByWorkspaceTab() {
  const [selectedWsId, setSelectedWsId] = useState<string>("");
  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: getWorkspaces,
  });
  const selected = workspaces.find((w) => w.id === selectedWsId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        padding: "12px 16px", background: "var(--color-surface)",
        border: "1px solid var(--color-border)", borderRadius: 10,
        display: "flex", gap: 10, alignItems: "center",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Workspace:</span>
        <select value={selectedWsId} onChange={(e) => setSelectedWsId(e.target.value)}
          style={{ fontSize: 13, padding: "5px 10px", borderRadius: 6, flex: 1, maxWidth: 400 }}>
          <option value="">Seleccionar…</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>
      {selected ? (
        <WsTabPermissions workspaceId={selected.id} workspaceName={selected.name} />
      ) : (
        <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>
          Seleccioná un workspace para ver su matriz de permisos.
        </div>
      )}
    </div>
  );
}

// ── Tab: Por grupo (todos los grupos cross-workspace) ────────────────────────
function ByGroupTab() {
  const [filter, setFilter] = useState("");
  const [wsFilter, setWsFilter] = useState("");
  const [accessFor, setAccessFor] = useState<{ id: string; name: string; workspaceId?: string } | null>(null);

  const { data: workspaces = [] } = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });
  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups", "all"],
    queryFn: () => getGroups(),
  });

  const wsById = useMemo(() => new Map(workspaces.map((w) => [w.id, w.name])), [workspaces]);

  const q = filter.trim().toLowerCase();
  const filtered = allGroups.filter((g) => {
    if (wsFilter && g.workspace_id !== wsFilter) return false;
    if (!q) return true;
    return g.name.toLowerCase().includes(q) || (g.description ?? "").toLowerCase().includes(q);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        padding: "12px 16px", background: "var(--color-surface)",
        border: "1px solid var(--color-border)", borderRadius: 10,
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
      }}>
        <input
          placeholder="🔍 Buscar grupo…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: "1 1 220px", fontSize: 13, padding: "5px 10px", border: "1px solid var(--color-border)", borderRadius: 6 }}
        />
        <select value={wsFilter} onChange={(e) => setWsFilter(e.target.value)}
          style={{ fontSize: 13, padding: "5px 10px", borderRadius: 6 }}>
          <option value="">Todos los workspaces</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {filtered.length} grupos
        </span>
      </div>

      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--color-bg)" }}>
              <th style={thStyle}>Grupo</th>
              <th style={thStyle}>Workspace</th>
              <th style={thStyle}>Descripción</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.id} style={{ borderTop: "1px solid var(--color-border-light)" }}>
                <td style={tdStyle}><strong>{g.name}</strong></td>
                <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }}>
                  {g.workspace_id ? (wsById.get(g.workspace_id) ?? "—") : <em style={{ color: "var(--color-text-muted)" }}>global</em>}
                </td>
                <td style={{ ...tdStyle, color: "var(--color-text-muted)", fontSize: 12 }}>
                  {g.description ?? "—"}
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => setAccessFor({ id: g.id, name: g.name, workspaceId: g.workspace_id ?? undefined })}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
                      background: "var(--color-primary-bg)", color: "var(--color-primary)",
                      border: "1px solid var(--color-primary)", cursor: "pointer",
                    }}>
                    🔓 Datasets accesibles
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {accessFor && (
        <DatasetAccessModal
          open={!!accessFor}
          onClose={() => setAccessFor(null)}
          subject={{ kind: "group", id: accessFor.id, name: accessFor.name }}
          workspaceId={accessFor.workspaceId}
        />
      )}
    </div>
  );
}

// ── Tab: Por usuario ─────────────────────────────────────────────────────────
function ByUserTab() {
  const [filter, setFilter] = useState("");
  const [accessFor, setAccessFor] = useState<{ id: string; name: string } | null>(null);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users", "all-system"],
    queryFn: () => api.get<User[]>("/auth/users?list_all=true").then((r) => r.data),
  });

  const q = filter.trim().toLowerCase();
  const filtered = users.filter((u) =>
    !q ||
    u.username.toLowerCase().includes(q) ||
    u.email.toLowerCase().includes(q)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        padding: "12px 16px", background: "var(--color-surface)",
        border: "1px solid var(--color-border)", borderRadius: 10,
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
      }}>
        <input
          placeholder="🔍 Buscar usuario por nombre o email…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: "1 1 280px", fontSize: 13, padding: "5px 10px", border: "1px solid var(--color-border)", borderRadius: 6 }}
        />
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {filtered.length} usuarios
        </span>
      </div>

      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--color-bg)" }}>
              <th style={thStyle}>Usuario</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Rol global</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--color-border-light)" }}>
                <td style={tdStyle}><strong>{u.username}</strong></td>
                <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }}>{u.email}</td>
                <td style={tdStyle}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                    background: u.role === "admin" ? "#FEE2E2" : "#F3F4F6",
                    color: u.role === "admin" ? "#DC2626" : "#6B7280",
                  }}>
                    {u.role}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: 11, color: u.is_active ? "var(--pm-green-600)" : "var(--color-text-muted)" }}>
                  {u.is_active ? "● activo" : "○ inactivo"}
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => setAccessFor({ id: u.id, name: u.username })}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
                      background: "var(--color-primary-bg)", color: "var(--color-primary)",
                      border: "1px solid var(--color-primary)", cursor: "pointer",
                    }}>
                    🔓 Datasets accesibles
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {accessFor && (
        <DatasetAccessModal
          open={!!accessFor}
          onClose={() => setAccessFor(null)}
          subject={{ kind: "user", id: accessFor.id, name: accessFor.name }}
        />
      )}
    </div>
  );
}

// ── Tab: Por dataset (cross-workspace) ───────────────────────────────────────
function ByDatasetTab() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const [wsFilter, setWsFilter] = useState("");

  const { data: workspaces = [] } = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });
  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", "all-system"],
    queryFn: () => getDatasets(),
  });

  const wsById = useMemo(() => new Map(workspaces.map((w) => [w.id, w.name])), [workspaces]);
  const q = filter.trim().toLowerCase();
  const filtered = datasets.filter((d) => {
    if (wsFilter && d.workspace_id !== wsFilter) return false;
    if (!q) return true;
    return d.name.toLowerCase().includes(q);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        padding: "12px 16px", background: "var(--color-surface)",
        border: "1px solid var(--color-border)", borderRadius: 10,
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
      }}>
        <input
          placeholder="🔍 Buscar dataset…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: "1 1 220px", fontSize: 13, padding: "5px 10px", border: "1px solid var(--color-border)", borderRadius: 6 }}
        />
        <select value={wsFilter} onChange={(e) => setWsFilter(e.target.value)}
          style={{ fontSize: 13, padding: "5px 10px", borderRadius: 6 }}>
          <option value="">Todos los workspaces</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {filtered.length} datasets
        </span>
      </div>

      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--color-bg)" }}>
              <th style={thStyle}>Dataset</th>
              <th style={thStyle}>Workspace</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} style={{ borderTop: "1px solid var(--color-border-light)" }}>
                <td style={tdStyle}><strong>{d.name}</strong></td>
                <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }}>
                  {d.workspace_id ? (wsById.get(d.workspace_id) ?? "—") : <em>sin workspace</em>}
                </td>
                <td style={{ ...tdStyle, fontSize: 11, color: "var(--color-text-muted)" }}>
                  {d.is_bridge ? "🌉 intermedia" : d.is_computed ? "ƒ computado" : "📊 estándar"}
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => navigate(`/datasets/${d.id}`)}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
                      background: "var(--color-primary-bg)", color: "var(--color-primary)",
                      border: "1px solid var(--color-primary)", cursor: "pointer",
                    }}>
                    Abrir y gestionar permisos
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
  color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 0.5,
};
const tdStyle: React.CSSProperties = {
  padding: "10px 14px", verticalAlign: "middle",
};

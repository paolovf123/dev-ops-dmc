import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import UserMenu from "../components/UserMenu";
import { useToast } from "../components/Toast";
import { getGroups, getGroupMembers } from "../api/groups";
import { getWorkspaces, getWorkspaceMembers } from "../api/workspaces";

interface UserRow {
  id: string;
  email: string;
  username: string;
  role: "admin" | "editor" | "viewer";
  is_active: boolean;
  created_at: string;
}

type SortField = "username" | "role" | "created_at";
type SortDir = "asc" | "desc";

const ROLE_META = {
  admin:  { label: "Admin",  color: "#7C3AED", bg: "#EDE9FE", border: "#C4B5FD", icon: "★" },
  editor: { label: "Editor", color: "#15803D", bg: "#DCFCE7", border: "#86EFAC", icon: "✎" },
  viewer: { label: "Viewer", color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1", icon: "◉" },
} as const;

function Avatar({ name, role, size = 36 }: { name: string; role: string; size?: number }) {
  const gradients: Record<string, string> = {
    admin:  "linear-gradient(135deg,#7C3AED,#5B21B6)",
    editor: "linear-gradient(135deg,#009A44,#007A36)",
    viewer: "linear-gradient(135deg,#94A3B8,#64748B)",
  };
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: gradients[role] ?? gradients.viewer,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
      border: "2px solid rgba(255,255,255,0.15)",
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function RoleBadge({ role }: { role: keyof typeof ROLE_META }) {
  const m = ROLE_META[role];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
      whiteSpace: "nowrap",
    }}>
      {m.icon} {m.label}
    </span>
  );
}

function SortIcon({ field, current, dir }: { field: SortField; current: SortField; dir: SortDir }) {
  if (field !== current) return <span style={{ color: "#CBD5E1", fontSize: 10, marginLeft: 3 }}>↕</span>;
  return <span style={{ color: "#7C3AED", fontSize: 10, marginLeft: 3 }}>{dir === "asc" ? "↑" : "↓"}</span>;
}

export default function AdminUsers() {
  const { user: me, isAdmin } = useAuth();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const confirm   = useConfirm();
  const toast     = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initWsId = searchParams.get("workspace_id") ?? "";

  const [search,    setSearch]    = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | "admin" | "editor" | "viewer">("");
  const [wsFilter,  setWsFilter]  = useState(initWsId);
  const [grpFilter, setGrpFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sortField, setSortField] = useState<SortField>("username");
  const [sortDir,   setSortDir]   = useState<SortDir>("asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<string>("");
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: { row: number; error: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ["admin-users", isAdmin ? null : initWsId],
    queryFn: () => {
      const url = isAdmin ? "/auth/users" : `/auth/users?workspace_id=${initWsId}`;
      return api.get<UserRow[]>(url).then((r) => r.data);
    },
    enabled: isAdmin || !!initWsId,
  });

  const { data: groups    = [] } = useQuery({ queryKey: ["groups"],    queryFn: getGroups,    staleTime: 60_000 });
  const { data: workspaces = [], isLoading: isLoadingWs } = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces, staleTime: 60_000 });

  // El rol del usuario en el workspace filtrado (permite acceso a owner/admin_ws)
  const activeWs   = workspaces.find((w) => w.id === wsFilter) ?? null;
  const myWsRole   = activeWs?.my_role ?? null;
  const canAccess  = isAdmin || myWsRole === "owner" || myWsRole === "admin_ws";

  const groupMemberQueries = useQueries({
    queries: groups.map((g) => ({
      queryKey: ["group-members", g.id],
      queryFn: () => getGroupMembers(g.id),
      staleTime: 60_000,
    })),
  });

  const wsMemberQueries = useQueries({
    queries: workspaces.map((ws) => ({
      queryKey: ["workspace-members", ws.id],
      queryFn: () => getWorkspaceMembers(ws.id),
      staleTime: 60_000,
    })),
  });

  const userGroupsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    groups.forEach((g, i) => {
      (groupMemberQueries[i]?.data ?? []).forEach((m) => {
        if (!map.has(m.user_id)) map.set(m.user_id, []);
        map.get(m.user_id)!.push(g.name);
      });
    });
    return map;
  }, [groups, groupMemberQueries]);

  const userWorkspacesMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    workspaces.forEach((ws, i) => {
      (wsMemberQueries[i]?.data ?? []).forEach((m) => {
        if (!map.has(m.user_id)) map.set(m.user_id, []);
        map.get(m.user_id)!.push({ id: ws.id, name: ws.name });
      });
    });
    return map;
  }, [workspaces, wsMemberQueries]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users
      .filter((u) => {
        if (!showInactive && !u.is_active) return false;
        if (showInactive && u.is_active) return false;
        if (roleFilter && u.role !== roleFilter) return false;
        if (q && !u.username.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
        if (wsFilter) {
          const uws = userWorkspacesMap.get(u.id) ?? [];
          if (!uws.some((w) => w.id === wsFilter)) return false;
        }
        if (grpFilter) {
          const ugs = userGroupsMap.get(u.id) ?? [];
          if (!ugs.some((g) => g === grpFilter)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let va = a[sortField] as string;
        let vb = b[sortField] as string;
        if (sortField === "role") {
          const order = { admin: 0, editor: 1, viewer: 2 };
          return sortDir === "asc"
            ? (order[a.role] ?? 3) - (order[b.role] ?? 3)
            : (order[b.role] ?? 3) - (order[a.role] ?? 3);
        }
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
  }, [users, search, roleFilter, wsFilter, grpFilter, showInactive, sortField, sortDir, userWorkspacesMap, userGroupsMap]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  function clearFilters() {
    setSearch(""); setRoleFilter(""); setWsFilter(""); setGrpFilter("");
    setSearchParams({});
  }

  const hasFilters = search || roleFilter || wsFilter || grpFilter;

  const roleM = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/auth/users/${id}/role`, { role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setEditingId(null); toast("Rol actualizado", "success"); },
    onError: () => toast("No se pudo cambiar el rol", "error"),
  });

  const deactivateM = useMutation({
    mutationFn: (id: string) => api.patch(`/auth/users/${id}/deactivate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast("Cuenta desactivada", "warning"); },
    onError: () => toast("No se pudo desactivar la cuenta", "error"),
  });

  const activateM = useMutation({
    mutationFn: (id: string) => api.patch(`/auth/users/${id}/activate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast("Cuenta activada", "success"); },
    onError: () => toast("No se pudo activar la cuenta", "error"),
  });

  const importM = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.post<{ created: number; skipped: number; errors: { row: number; error: string }[] }>(
        "/auth/users/import-excel", fd, { headers: { "Content-Type": "multipart/form-data" } }
      ).then((r) => r.data);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setImportResult(data);
      toast(`${data.created} usuario${data.created !== 1 ? "s" : ""} importado${data.created !== 1 ? "s" : ""}`, data.created > 0 ? "success" : "warning");
    },
    onError: () => toast("Error al importar el archivo", "error"),
  });

  async function saveRole(user: UserRow) {
    if (pendingRole === user.role) { setEditingId(null); return; }
    const ok = await confirm({
      title: "Cambiar rol",
      message: `¿Cambiar el rol de ${user.username} a "${ROLE_META[pendingRole as keyof typeof ROLE_META]?.label}"?`,
      confirmLabel: "Confirmar",
    });
    if (ok) roleM.mutate({ id: user.id, role: pendingRole });
    else setEditingId(null);
  }

  async function deactivate(user: UserRow) {
    const ok = await confirm({
      title: "Desactivar cuenta",
      message: `${user.username} no podrá iniciar sesión hasta que un admin reactive su cuenta.`,
      confirmLabel: "Desactivar",
      variant: "danger",
    });
    if (ok) deactivateM.mutate(user.id);
  }

  if (isLoadingWs) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="csv-loading-spinner" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="empty">
          <div className="empty-icon">🔒</div>
          <h3>Sin acceso</h3>
          <p>Accede desde un workspace en el que seas owner o admin_ws.</p>
        </div>
      </div>
    );
  }

  const totalActive = users.filter((u) => u.is_active).length;
  const totalAdmins = users.filter((u) => u.role === "admin").length;
  const totalEditors = users.filter((u) => u.role === "editor").length;
  const totalInactive = users.filter((u) => !u.is_active).length;

  const wsLabel = workspaces.find((w) => w.id === wsFilter)?.name ?? "";
  const grpLabel = grpFilter;

  return (
    <>
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>

      {/* ── Header ── */}
      <header className="app-header">
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo">T</div>
          <span className="app-header-name">Trans<em>Excel</em></span>
        </button>
        <div className="toolbar-sep" />
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500 }}>
          Gestión de usuarios
        </span>
        <div className="app-header-spacer" />
        <UserMenu />
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Page title + stats ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--color-text)", margin: 0 }}>
            Usuarios
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "4px 0 20px" }}>
            Gestiona roles y acceso al sistema
          </p>

          {/* Stats cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "Activos",   value: totalActive,   color: "#15803D", bg: "#F0FDF4", border: "#BBF7D0", icon: "●" },
              { label: "Admins",    value: totalAdmins,   color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE", icon: "★" },
              { label: "Editores",  value: totalEditors,  color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", icon: "✎" },
              { label: "Inactivos", value: totalInactive, color: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0", icon: "○" },
            ].map((s) => (
              <div key={s.label} style={{
                background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12,
                padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
              }}>
                <span style={{ fontSize: 22, color: s.color, opacity: 0.7 }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: s.color, opacity: 0.8, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div style={{
          background: "var(--color-surface)", border: "1px solid var(--color-border)",
          borderRadius: 14, padding: "16px 20px", marginBottom: 16,
          display: "flex", flexDirection: "column", gap: 12,
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}>

          {/* Row 1: search + status toggle */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {/* Search */}
            <div style={{ position: "relative", flex: 1 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", pointerEvents: "none" }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o email..."
                style={{
                  width: "100%", height: 38, paddingLeft: 36, paddingRight: 12,
                  border: "1.5px solid var(--color-border)", borderRadius: 9, fontSize: 13,
                  background: "var(--color-bg)", color: "var(--color-text)", outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#7C3AED"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
              />
            </div>

            {/* Status toggle */}
            <div style={{ display: "flex", background: "var(--color-bg)", border: "1.5px solid var(--color-border)", borderRadius: 9, overflow: "hidden" }}>
              {[
                { label: "Activos",   value: false },
                { label: "Inactivos", value: true },
              ].map((opt) => (
                <button key={String(opt.value)}
                  onClick={() => setShowInactive(opt.value)}
                  style={{
                    padding: "0 16px", height: 38, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                    background: showInactive === opt.value ? "#7C3AED" : "transparent",
                    color: showInactive === opt.value ? "#fff" : "var(--color-text-secondary)",
                    transition: "all 0.15s",
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Clear filters */}
            {hasFilters && (
              <button onClick={clearFilters}
                style={{
                  height: 38, padding: "0 14px", border: "1.5px solid #FCA5A5", borderRadius: 9,
                  background: "#FEF2F2", color: "#DC2626", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                }}>
                ✕ Limpiar filtros
              </button>
            )}
          </div>

          {/* Row 2: role + workspace + group */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* Role chips */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>Rol:</span>
              {(["", "admin", "editor", "viewer"] as const).map((r) => {
                const active = roleFilter === r;
                const meta = r ? ROLE_META[r] : null;
                return (
                  <button key={r} onClick={() => setRoleFilter(r)}
                    style={{
                      padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                      cursor: "pointer", border: "1.5px solid",
                      background: active ? (meta?.bg ?? "#F8FAFC") : "transparent",
                      color: active ? (meta?.color ?? "var(--color-text)") : "var(--color-text-secondary)",
                      borderColor: active ? (meta?.border ?? "var(--color-border)") : "var(--color-border)",
                      transition: "all 0.15s",
                    }}>
                    {r === "" ? "Todos" : `${meta!.icon} ${meta!.label}`}
                  </button>
                );
              })}
            </div>

            <div style={{ width: 1, height: 22, background: "var(--color-border)" }} />

            {/* Workspace dropdown */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>Workspace:</span>
              <select
                value={wsFilter}
                onChange={(e) => { setWsFilter(e.target.value); setSearchParams(e.target.value ? { workspace_id: e.target.value } : {}); }}
                style={{
                  height: 32, padding: "0 10px", border: "1.5px solid var(--color-border)",
                  borderRadius: 8, fontSize: 12, background: wsFilter ? "#F0FDF4" : "var(--color-bg)",
                  color: wsFilter ? "#15803D" : "var(--color-text)", cursor: "pointer", outline: "none",
                  fontWeight: wsFilter ? 600 : 400,
                }}>
                <option value="">Todos</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>

            {/* Group dropdown */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>Grupo:</span>
              <select
                value={grpFilter}
                onChange={(e) => setGrpFilter(e.target.value)}
                style={{
                  height: 32, padding: "0 10px", border: "1.5px solid var(--color-border)",
                  borderRadius: 8, fontSize: 12, background: grpFilter ? "#F5F3FF" : "var(--color-bg)",
                  color: grpFilter ? "#7C3AED" : "var(--color-text)", cursor: "pointer", outline: "none",
                  fontWeight: grpFilter ? 600 : 400,
                }}>
                <option value="">Todos</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.name}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Active filter pills */}
          {hasFilters && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 4, borderTop: "1px solid var(--color-border-light)" }}>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)", alignSelf: "center" }}>Filtros activos:</span>
              {search && (
                <FilterPill label={`"${search}"`} onRemove={() => setSearch("")} />
              )}
              {roleFilter && (
                <FilterPill label={`Rol: ${ROLE_META[roleFilter].label}`} color={ROLE_META[roleFilter].color} onRemove={() => setRoleFilter("")} />
              )}
              {wsFilter && (
                <FilterPill label={`WS: ${wsLabel}`} color="#15803D" onRemove={() => { setWsFilter(""); setSearchParams({}); }} />
              )}
              {grpFilter && (
                <FilterPill label={`Grupo: ${grpLabel}`} color="#7C3AED" onRemove={() => setGrpFilter("")} />
              )}
            </div>
          )}
        </div>

        {/* ── Result count + import button ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, padding: "0 2px" }}>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500 }}>
            {filtered.length} {filtered.length === 1 ? "usuario" : "usuarios"}
            {hasFilters && <span style={{ color: "var(--color-text-muted)" }}> de {users.filter(u => u.is_active === !showInactive).length}</span>}
          </span>
          {isAdmin && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importM.mutate(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => {
                  const csv = "email,username,password,role\nusuario@empresa.com,usuario,Contraseña1!,viewer\n";
                  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = "plantilla_usuarios.csv";
                  a.click(); URL.revokeObjectURL(url);
                }}
                title="Descargar plantilla de ejemplo"
                style={{
                  height: 34, padding: "0 10px", border: "1.5px solid var(--color-border)",
                  borderRadius: 9, background: "var(--color-bg)", color: "var(--color-text-secondary)",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <path d="M4 14v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Plantilla
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importM.isPending}
                style={{
                  height: 34, padding: "0 14px", border: "1.5px solid #22C55E",
                  borderRadius: 9, background: "#F0FDF4", color: "#15803D",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  opacity: importM.isPending ? 0.6 : 1,
                }}>
                {importM.isPending ? (
                  <span className="csv-loading-spinner" style={{ width: 12, height: 12 }} />
                ) : (
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                    <path d="M4 14v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                Importar desde Excel
              </button>
            </div>
          )}
        </div>

        {/* ── Table ── */}
        <div style={{
          background: "var(--color-surface)", border: "1px solid var(--color-border)",
          borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}>
          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 1fr 1.6fr 1fr 140px",
            padding: "10px 20px", background: "var(--color-bg)",
            borderBottom: "1px solid var(--color-border)",
          }}>
            {[
              { label: "Usuario", field: "username" as SortField },
              { label: "Rol",     field: "role"     as SortField },
              { label: "Membresías", field: null },
              { label: "Desde",   field: "created_at" as SortField },
              { label: "Acciones", field: null },
            ].map((col) => (
              <div key={col.label}
                onClick={() => col.field && toggleSort(col.field)}
                style={{
                  fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase",
                  letterSpacing: "0.06em", cursor: col.field ? "pointer" : "default",
                  userSelect: "none", display: "flex", alignItems: "center", gap: 2,
                }}>
                {col.label}
                {col.field && <SortIcon field={col.field} current={sortField} dir={sortDir} />}
              </div>
            ))}
          </div>

          {/* Rows */}
          {isLoading ? (
            <div style={{ padding: "56px 24px", textAlign: "center" }}>
              <div className="csv-loading-spinner" style={{ margin: "0 auto" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "56px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>
                {hasFilters ? "🔍" : showInactive ? "👤" : "✓"}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text)", marginBottom: 6 }}>
                {hasFilters ? "Sin resultados" : showInactive ? "No hay cuentas inactivas" : "No hay usuarios activos"}
              </div>
              {hasFilters && (
                <button onClick={clearFilters}
                  style={{ marginTop: 8, fontSize: 13, color: "#7C3AED", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            filtered.map((user, idx) => {
              const uws = userWorkspacesMap.get(user.id) ?? [];
              const ugs = userGroupsMap.get(user.id) ?? [];
              const isEditing = editingId === user.id;
              return (
                <div key={user.id} style={{
                  display: "grid", gridTemplateColumns: "2fr 1fr 1.6fr 1fr 140px",
                  padding: "14px 20px", alignItems: "center",
                  borderBottom: idx < filtered.length - 1 ? "1px solid var(--color-border-light)" : "none",
                  background: "transparent", transition: "background 0.1s",
                  opacity: showInactive ? 0.75 : 1,
                }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-bg)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {/* Usuario */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <Avatar name={user.username} role={user.role} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {user.username}
                        </span>
                        {user.id === me?.id && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE" }}>
                            Tú
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {user.email}
                      </div>
                    </div>
                  </div>

                  {/* Rol */}
                  <div>
                    {isEditing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {(["admin", "editor", "viewer"] as const).map((r) => {
                            const m = ROLE_META[r];
                            const sel = pendingRole === r;
                            return (
                              <button key={r} onClick={() => setPendingRole(r)}
                                style={{
                                  padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                                  cursor: "pointer", border: `1.5px solid ${m.border}`,
                                  background: sel ? m.bg : "transparent",
                                  color: sel ? m.color : "var(--color-text-muted)",
                                  transition: "all 0.12s",
                                }}>
                                {m.icon} {m.label}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button className="btn btn-primary" style={{ height: 26, fontSize: 11, padding: "0 10px" }}
                            onClick={() => saveRole(user)} disabled={roleM.isPending}>
                            Guardar
                          </button>
                          <button className="btn btn-ghost" style={{ height: 26, fontSize: 11 }}
                            onClick={() => setEditingId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <RoleBadge role={user.role} />
                    )}
                  </div>

                  {/* Membresías */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {uws.map((ws) => (
                      <button key={ws.id}
                        onClick={() => { setWsFilter(ws.id); setSearchParams({ workspace_id: ws.id }); }}
                        title={`Filtrar por workspace: ${ws.name}`}
                        style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                          background: wsFilter === ws.id ? "#DCFCE7" : "#F0FDF4",
                          color: "#15803D", border: `1px solid ${wsFilter === ws.id ? "#4ADE80" : "#86EFAC"}`,
                          cursor: "pointer", transition: "all 0.12s",
                          boxShadow: wsFilter === ws.id ? "0 0 0 2px #86EFAC" : "none",
                        }}>
                        ⬡ {ws.name}
                      </button>
                    ))}
                    {ugs.map((g) => (
                      <button key={g}
                        onClick={() => setGrpFilter(g === grpFilter ? "" : g)}
                        title={`Filtrar por grupo: ${g}`}
                        style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                          background: grpFilter === g ? "#EDE9FE" : "#F5F3FF",
                          color: "#7C3AED", border: `1px solid ${grpFilter === g ? "#A78BFA" : "#C4B5FD"}`,
                          cursor: "pointer", transition: "all 0.12s",
                          boxShadow: grpFilter === g ? "0 0 0 2px #C4B5FD" : "none",
                        }}>
                        👥 {g}
                      </button>
                    ))}
                    {uws.length === 0 && ugs.length === 0 && (
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontStyle: "italic" }}>Sin asignar</span>
                    )}
                  </div>

                  {/* Desde */}
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {new Date(user.created_at).toLocaleDateString("es-PE", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </div>

                  {/* Acciones */}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {user.id !== me?.id && !isEditing && (
                      <>
                        <button
                          onClick={() => { setEditingId(user.id); setPendingRole(user.role); }}
                          title="Cambiar rol"
                          style={{
                            height: 30, width: 30, borderRadius: 8, border: "1px solid var(--color-border)",
                            background: "var(--color-bg)", cursor: "pointer", display: "flex",
                            alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--color-text-secondary)",
                            transition: "all 0.12s",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#7C3AED"; (e.currentTarget as HTMLElement).style.color = "#7C3AED"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)"; (e.currentTarget as HTMLElement).style.color = "var(--color-text-secondary)"; }}
                        >✎</button>
                        {user.is_active ? (
                          <button
                            onClick={() => deactivate(user)}
                            title="Desactivar cuenta"
                            disabled={deactivateM.isPending}
                            style={{
                              height: 30, width: 30, borderRadius: 8, border: "1px solid var(--color-border)",
                              background: "var(--color-bg)", cursor: "pointer", display: "flex",
                              alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--color-text-secondary)",
                              transition: "all 0.12s",
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#F87171"; (e.currentTarget as HTMLElement).style.color = "#DC2626"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)"; (e.currentTarget as HTMLElement).style.color = "var(--color-text-secondary)"; }}
                          >⊘</button>
                        ) : (
                          <button
                            onClick={() => activateM.mutate(user.id)}
                            title="Activar cuenta"
                            disabled={activateM.isPending}
                            style={{
                              height: 30, width: 30, borderRadius: 8, border: "1px solid var(--color-border)",
                              background: "var(--color-bg)", cursor: "pointer", display: "flex",
                              alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--color-text-secondary)",
                              transition: "all 0.12s",
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#4ADE80"; (e.currentTarget as HTMLElement).style.color = "#16A34A"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)"; (e.currentTarget as HTMLElement).style.color = "var(--color-text-secondary)"; }}
                          >✓</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Role guide ── */}
        <div style={{
          marginTop: 20, padding: "14px 20px", background: "var(--color-surface)",
          border: "1px solid var(--color-border)", borderRadius: 12,
          display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Guía de roles
          </span>
          {(["admin", "editor", "viewer"] as const).map((r) => (
            <div key={r} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <RoleBadge role={r} />
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                {r === "admin"  && "Acceso total: datasets, columnas, registros y usuarios"}
                {r === "editor" && "Crear, editar y eliminar registros"}
                {r === "viewer" && "Solo puede ver datos"}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>

    {importResult && (
        <div className="modal-overlay" onClick={() => setImportResult(null)}>
          <div className="modal modal-v2" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-accent" style={{ background: importResult.created > 0 ? "#22C55E" : "#F59E0B" }} />
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="modal-header-icon"
                  style={{ background: importResult.created > 0 ? "#F0FDF4" : "#FFFBEB",
                    color: importResult.created > 0 ? "#15803D" : "#D97706", fontSize: 18 }}>
                  {importResult.created > 0 ? "✓" : "⚠"}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Resultado de importación</h3>
                  <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-text-muted)" }}>
                    Los usuarios importados están inactivos hasta que un admin los active
                  </p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setImportResult(null)} title="Cerrar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "Creados",  value: importResult.created,        color: "#15803D", bg: "#F0FDF4", border: "#BBF7D0" },
                  { label: "Omitidos", value: importResult.skipped,        color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
                  { label: "Errores",  value: importResult.errors.length,  color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5" },
                ].map((s) => (
                  <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`,
                    borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: s.color, fontWeight: 600, marginTop: 3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {importResult.errors.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Filas con error
                  </div>
                  <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                    {importResult.errors.map((e, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, padding: "6px 10px", background: "#FEF2F2",
                        borderRadius: 6, border: "1px solid #FCA5A5", fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: "#DC2626", minWidth: 32 }}>Fila {e.row}</span>
                        <span style={{ color: "var(--color-text-secondary)" }}>{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {importResult.skipped > 0 && (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "12px 0 0" }}>
                  Las filas omitidas corresponden a emails que ya existen en el sistema.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setImportResult(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FilterPill({ label, color, onRemove }: { label: string; color?: string; onRemove: () => void }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
      background: color ? `${color}18` : "#F1F5F9",
      color: color ?? "var(--color-text-secondary)",
      border: `1px solid ${color ? `${color}40` : "var(--color-border)"}`,
    }}>
      {label}
      <button onClick={onRemove}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit", fontSize: 12, opacity: 0.7 }}>
        ×
      </button>
    </span>
  );
}

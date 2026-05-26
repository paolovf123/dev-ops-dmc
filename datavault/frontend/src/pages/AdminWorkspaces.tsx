import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace,
  getWorkspaceMembers, addWorkspaceMember, updateMemberRole, removeWorkspaceMember,
} from "../api/workspaces";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import UserMenu from "../components/UserMenu";
import type { Workspace } from "../workspace/WorkspaceContext";
import type { WorkspaceMember } from "../api/workspaces";

const ROLE_BADGE: Record<string, { bg: string; color: string; label: string; dot: string }> = {
  owner:    { bg: "#EDE9FE", color: "#7C3AED", label: "Owner",    dot: "#7C3AED" },
  admin_ws: { bg: "#E0F2FE", color: "#0284C7", label: "Admin WS", dot: "#0284C7" },
  member:   { bg: "#F0FDF4", color: "#15803D", label: "Member",   dot: "#15803D" },
};

const WS_COLORS = [
  ["#6366F1","#818CF8"], ["#8B5CF6","#A78BFA"], ["#EC4899","#F472B6"],
  ["#F59E0B","#FCD34D"], ["#10B981","#34D399"], ["#0EA5E9","#38BDF8"],
  ["#EF4444","#F87171"], ["#14B8A6","#2DD4BF"],
];

function wsColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % WS_COLORS.length;
  return WS_COLORS[h];
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const [from, to] = wsColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: `linear-gradient(135deg, ${from}, ${to})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 700, fontSize: size * 0.42, flexShrink: 0,
      letterSpacing: -0.5,
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function UserAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const colors = ["#6366F1","#8B5CF6","#EC4899","#F59E0B","#10B981","#0EA5E9","#EF4444","#14B8A6"];
  const ci = name.charCodeAt(0) % colors.length;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: colors[ci] + "22",
      border: `2px solid ${colors[ci]}40`, display: "flex", alignItems: "center",
      justifyContent: "center", color: colors[ci], fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

export default function AdminWorkspaces() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const { isAdmin } = useAuth();

  const [selected, setSelected] = useState<Workspace | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newIsSandbox, setNewIsSandbox] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("member");
  const [memberSearch, setMemberSearch] = useState("");

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["admin-workspaces"],
    queryFn: getWorkspaces,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["workspace-members", selected?.id],
    queryFn: () => getWorkspaceMembers(selected!.id),
    enabled: !!selected,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users", isAdmin],
    queryFn: () => {
      const url = isAdmin ? "/auth/users" : "/auth/users?list_all=true";
      return api.get<{ id: string; username: string; email: string }[]>(url).then((r) => r.data);
    },
  });

  const createMut = useMutation({
    mutationFn: () => createWorkspace({ name: newName.trim(), description: newDesc.trim() || null, is_sandbox: newIsSandbox }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-workspaces"] });
      toast(newIsSandbox ? "Workspace demo creado con plantillas de ejemplo" : "Workspace creado", "success");
      setShowCreate(false); setNewName(""); setNewDesc(""); setNewIsSandbox(false);
    },
    onError: () => toast("Error al crear workspace", "error"),
  });

  const updateMut = useMutation({
    mutationFn: (id: string) => updateWorkspace(id, { name: editName.trim(), description: editDesc.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-workspaces"] });
      toast("Workspace actualizado", "success");
      setEditingId(null);
    },
    onError: () => toast("Error al actualizar", "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteWorkspace(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-workspaces"] });
      toast("Workspace eliminado", "success");
      if (selected && workspaces.find((w) => w.id === selected.id)) setSelected(null);
    },
    onError: () => toast("Error al eliminar workspace", "error"),
  });

  const addMemberMut = useMutation({
    mutationFn: () => addWorkspaceMember(selected!.id, selectedUserId, selectedRole),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-members", selected?.id] });
      toast("Miembro agregado", "success");
      setSelectedUserId(""); setUserSearch("");
    },
    onError: () => toast("El usuario ya es miembro o no existe", "error"),
  });

  const updateRoleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      updateMemberRole(selected!.id, userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-members", selected?.id] });
      toast("Rol actualizado", "success");
    },
  });

  const removeMemberMut = useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember(selected!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-members", selected?.id] });
      toast("Miembro removido", "success");
    },
    onError: () => toast("Error al remover miembro", "error"),
  });

  const handleDelete = async (ws: Workspace) => {
    const ok = await confirm({
      title: `Eliminar "${ws.name}"`,
      message: `Se eliminarán el workspace y todos sus datasets permanentemente. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar workspace",
      variant: "danger",
    });
    if (ok) deleteMut.mutate(ws.id);
  };

  const filteredUsers = allUsers.filter((u) => {
    const memberIds = members.map((m) => m.user_id);
    const q = userSearch.toLowerCase();
    return !memberIds.includes(u.id) &&
      (u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  });

  const filteredMembers = memberSearch
    ? members.filter((m) =>
        m.username.toLowerCase().includes(memberSearch.toLowerCase()) ||
        m.email.toLowerCase().includes(memberSearch.toLowerCase())
      )
    : members;

  const roleOrder: Record<string, number> = { owner: 0, admin_ws: 1, member: 2 };
  const sortedMembers = [...filteredMembers].sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9));

  const totalMembers = members.length;
  const ownerCount  = members.filter((m) => m.role === "owner").length;

  return (
    <>
      <header className="app-header">
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo app-header-logo--img"><img src="/opsgrid-logo.svg" alt="OpsGrid" /></div>
          <span className="app-header-name">Ops<em>Grid</em></span>
        </button>
        <div className="app-header-spacer" />
        <nav style={{ display: "flex", gap: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 13, gap: 6 }} onClick={() => navigate("/admin/users")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            Usuarios
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 13, gap: 6 }} onClick={() => navigate("/admin/groups")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6"/><circle cx="16" cy="8" r="3"/><path d="M22 20c0-3.3-2.7-6-6-6"/><path d="M9 14c0 0 1.5-.5 3-.5s3 .5 3 .5"/></svg>
            Grupos
          </button>
        </nav>
        <UserMenu />
      </header>

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 24px 48px", display: "flex", gap: 24, alignItems: "flex-start" }}>

        {/* ── Sidebar izquierdo ── */}
        <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Cabecera sidebar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: -0.3 }}>Workspaces</h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                {workspaces.length} equipo{workspaces.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, padding: "6px 12px", gap: 5, display: "flex", alignItems: "center" }}
              onClick={() => { setShowCreate(true); setEditingId(null); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Nuevo
            </button>
          </div>

          {/* Formulario crear */}
          {showCreate && (
            <div style={{
              background: "var(--color-surface)", border: "1.5px solid var(--color-primary, #6366F1)",
              borderRadius: 12, padding: 16, boxShadow: "0 4px 16px #6366F120",
            }}>
              <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 13, color: "var(--color-primary, #6366F1)" }}>
                Nuevo workspace
              </p>
              <input
                autoFocus
                placeholder="Nombre del equipo *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newName.trim() && createMut.mutate()}
                style={inputStyle}
              />
              <input
                placeholder="Descripción (opcional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                style={{ ...inputStyle, marginTop: 8 }}
              />
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" checked={newIsSandbox}
                  onChange={(e) => setNewIsSandbox(e.target.checked)}
                  style={{ marginTop: 2 }} />
                <span>
                  <strong>Workspace demo / sandbox</strong>
                  <span style={{ display: "block", color: "var(--color-text-muted)", marginTop: 2 }}>
                    Pre-pobla con las 4 plantillas (Inventario, CRM, Tickets, Tareas) y filas de ejemplo
                  </span>
                </span>
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" style={{ fontSize: 12, flex: 1 }}
                  disabled={!newName.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}>
                  {createMut.isPending ? "Creando…" : "Crear workspace"}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowCreate(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Lista workspaces */}
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3].map((i) => (
                <div key={i} style={{ height: 72, borderRadius: 12, background: "var(--color-surface)", border: "1px solid var(--color-border)", opacity: 0.5 }} />
              ))}
            </div>
          ) : workspaces.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-muted)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🏢</div>
              <p style={{ fontSize: 13, margin: 0 }}>No hay workspaces aún</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {workspaces.map((ws) => {
                const isActive = selected?.id === ws.id;
                const [from] = wsColor(ws.name);
                return (
                  <div
                    key={ws.id}
                    onClick={() => { setSelected(ws); setEditingId(null); setMemberSearch(""); }}
                    style={{
                      background: isActive ? "var(--color-surface)" : "var(--color-surface)",
                      border: `1.5px solid ${isActive ? from : "var(--color-border)"}`,
                      borderRadius: 12,
                      padding: "11px 12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      boxShadow: isActive ? `0 0 0 3px ${from}22, 0 2px 8px ${from}14` : "none",
                      transition: "all 0.15s",
                      position: "relative",
                    }}
                  >
                    <Avatar name={ws.name} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingId === ws.id ? (
                        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <input
                            autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                            style={{ ...inputStyle, fontSize: 12, padding: "4px 7px" }}
                          />
                          <input
                            value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                            placeholder="Descripción"
                            style={{ ...inputStyle, fontSize: 11, padding: "3px 7px" }}
                          />
                          <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
                            <button className="btn btn-primary" style={{ fontSize: 11, padding: "3px 8px" }}
                              disabled={updateMut.isPending}
                              onClick={() => updateMut.mutate(ws.id)}>Guardar</button>
                            <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }}
                              onClick={() => setEditingId(null)}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ws.name}
                          </p>
                          {ws.description && (
                            <p style={{ margin: "1px 0 0", fontSize: 11, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {ws.description}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    {editingId !== ws.id && (
                      <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          title="Editar"
                          onClick={() => { setEditingId(ws.id); setEditName(ws.name); setEditDesc(ws.description ?? ""); setSelected(ws); }}
                          style={iconBtnStyle}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button
                          title="Eliminar"
                          onClick={() => handleDelete(ws)}
                          style={{ ...iconBtnStyle, color: "#EF4444" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Panel derecho ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selected ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "100px 0", color: "var(--color-text-muted)", textAlign: "center",
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20, background: "var(--color-surface)",
                border: "1.5px dashed var(--color-border)", display: "flex", alignItems: "center",
                justifyContent: "center", marginBottom: 16, fontSize: 32,
              }}>🏢</div>
              <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px", color: "var(--color-text)" }}>Selecciona un workspace</p>
              <p style={{ fontSize: 13, margin: 0 }}>Elige un equipo de la lista para ver y gestionar sus miembros</p>
            </div>
          ) : (
            <>
              {/* Header workspace seleccionado */}
              <div style={{
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 16, padding: "20px 24px", marginBottom: 20,
                display: "flex", alignItems: "center", gap: 16,
              }}>
                <Avatar name={selected.name} size={52} />
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.4 }}>{selected.name}</h2>
                  {selected.description && (
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>{selected.description}</p>
                  )}
                </div>
                {/* Stats rápidas */}
                <div style={{ display: "flex", gap: 20, borderLeft: "1px solid var(--color-border)", paddingLeft: 20 }}>
                  <StatBadge value={totalMembers} label="miembros" icon="👥" />
                  <StatBadge value={ownerCount} label={ownerCount === 1 ? "owner" : "owners"} icon="👑" />
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, gap: 5, display: "flex", alignItems: "center" }}
                  onClick={() => navigate(`/ws/${selected.id}`)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Abrir
                </button>
              </div>

              {/* Agregar miembro */}
              <div style={{
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 14, padding: "18px 20px", marginBottom: 20,
              }}>
                <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 14 }}>Agregar miembro</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 200px", position: "relative" }}>
                    <input
                      placeholder="Buscar por nombre o email…"
                      value={userSearch}
                      onChange={(e) => { setUserSearch(e.target.value); setSelectedUserId(""); }}
                      style={inputStyle}
                    />
                    {userSearch && filteredUsers.length > 0 && !selectedUserId && (
                      <div style={{
                        position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                        background: "var(--color-surface)", border: "1px solid var(--color-border)",
                        borderRadius: 10, zIndex: 30, maxHeight: 200, overflowY: "auto",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      }}>
                        {filteredUsers.slice(0, 8).map((u) => (
                          <button key={u.id}
                            onClick={() => { setSelectedUserId(u.id); setUserSearch(u.username + " (" + u.email + ")"); }}
                            style={{
                              width: "100%", padding: "9px 13px", background: "none", border: "none",
                              textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                            }}>
                            <UserAvatar name={u.username} size={26} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{u.username}</div>
                              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{u.email}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    style={{ ...inputStyle, flex: "0 0 auto", minWidth: 180 }}>
                    <option value="member">Member — accede a los datos</option>
                    <option value="admin_ws">Admin WS — gestiona miembros y grupos</option>
                    <option value="owner">Owner — control total + puede eliminar</option>
                  </select>
                  <button className="btn btn-primary" style={{ fontSize: 13, whiteSpace: "nowrap" }}
                    disabled={!selectedUserId || addMemberMut.isPending}
                    onClick={() => addMemberMut.mutate()}>
                    {addMemberMut.isPending ? "Agregando…" : "Agregar"}
                  </button>
                </div>
              </div>

              {/* Lista de miembros */}
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, overflow: "hidden" }}>
                {/* Header tabla */}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 20px", borderBottom: "1px solid var(--color-border)",
                  background: "var(--color-bg)",
                }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
                    Miembros
                    <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "var(--color-text-muted)" }}>
                      ({members.length})
                    </span>
                  </p>
                  {members.length > 3 && (
                    <input
                      placeholder="Filtrar miembros…"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      style={{ ...inputStyle, width: 200, fontSize: 12, padding: "5px 10px" }}
                    />
                  )}
                </div>

                {members.length === 0 ? (
                  <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-text-muted)" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>👤</div>
                    <p style={{ fontSize: 13, margin: 0 }}>Sin miembros aún. Agrega el primero arriba.</p>
                  </div>
                ) : sortedMembers.length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
                    No hay miembros que coincidan con "{memberSearch}"
                  </div>
                ) : (
                  <div>
                    {sortedMembers.map((m: WorkspaceMember, idx) => {
                      const badge = ROLE_BADGE[m.role] ?? { bg: "#f1f5f9", color: "#64748b", label: m.role, dot: "#64748b" };
                      const isLast = idx === sortedMembers.length - 1;
                      return (
                        <div
                          key={m.user_id}
                          style={{
                            display: "flex", alignItems: "center", gap: 14,
                            padding: "12px 20px",
                            borderBottom: isLast ? "none" : "1px solid var(--color-border)",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <UserAvatar name={m.username} size={34} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5 }}>{m.username}</p>
                            <p style={{ margin: "1px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>{m.email}</p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {/* Rol select pill */}
                            <div style={{ position: "relative" }}>
                              <div style={{
                                display: "flex", alignItems: "center", gap: 5,
                                background: badge.bg, borderRadius: 99, padding: "3px 10px 3px 8px",
                                border: `1px solid ${badge.color}40`,
                              }}>
                                <div style={{ width: 6, height: 6, borderRadius: "50%", background: badge.dot, flexShrink: 0 }} />
                                <select
                                  value={m.role}
                                  onChange={(e) => updateRoleMut.mutate({ userId: m.user_id, role: e.target.value })}
                                  style={{
                                    background: "none", border: "none", color: badge.color,
                                    fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0,
                                    appearance: "none", WebkitAppearance: "none",
                                  }}>
                                  <option value="member">Member</option>
                                  <option value="admin_ws">Admin WS</option>
                                  <option value="owner">Owner</option>
                                </select>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={badge.color} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                              </div>
                            </div>
                            {/* Fecha */}
                            <span style={{ fontSize: 12, color: "var(--color-text-muted)", minWidth: 76, textAlign: "right" }}>
                              {new Date(m.joined_at).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                            {/* Eliminar */}
                            <button
                              onClick={async () => {
                                const ok = await confirm({
                                  title: "Remover miembro",
                                  message: `¿Quitar a ${m.username} del workspace "${selected.name}"?`,
                                  confirmLabel: "Remover",
                                  variant: "danger",
                                });
                                if (ok) removeMemberMut.mutate(m.user_id);
                              }}
                              style={{
                                background: "none", border: "1px solid transparent", borderRadius: 6,
                                cursor: "pointer", color: "var(--color-text-muted)", padding: "4px 6px",
                                display: "flex", alignItems: "center", transition: "all 0.15s",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.background = "#FEE2E2"; e.currentTarget.style.borderColor = "#FECACA"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "transparent"; }}
                              title="Remover del workspace"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function StatBadge({ value, label, icon }: { value: number; label: string; icon: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>{label}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 11px", borderRadius: 8,
  border: "1px solid var(--color-border)", background: "var(--color-bg)",
  color: "var(--color-text)", fontSize: 13, boxSizing: "border-box",
  outline: "none",
};

const iconBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: "5px 5px",
  borderRadius: 6, color: "var(--color-text-muted)", display: "flex",
  alignItems: "center", transition: "all 0.12s",
};

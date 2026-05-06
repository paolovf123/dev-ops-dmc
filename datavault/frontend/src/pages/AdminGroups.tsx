import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getGroups, createGroup, deleteGroup, getGroupMembers, addGroupMember, removeGroupMember } from "../api/groups";
import api from "../api/client";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import UserMenu from "../components/UserMenu";
import type { UserGroup, GroupMember } from "../types";

export default function AdminGroups() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const [selectedGroup, setSelectedGroup] = useState<UserGroup | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: getGroups,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["group-members", selectedGroup?.id],
    queryFn: () => getGroupMembers(selectedGroup!.id),
    enabled: !!selectedGroup,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ id: string; email: string; username: string; role: string }[]>("/auth/users").then((r) => r.data),
  });

  const nonMembers = allUsers.filter(
    (u) => !members.find((m) => m.user_id === u.id) &&
    (u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
     u.username.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const createMut = useMutation({
    mutationFn: () => createGroup(newName.trim(), newDesc.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      toast("Grupo creado", "success");
      setShowCreateForm(false);
      setNewName("");
      setNewDesc("");
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast(msg ?? "Error creando grupo", "error");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteGroup(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      if (selectedGroup?.id === id) setSelectedGroup(null);
      toast("Grupo eliminado", "success");
    },
    onError: () => toast("Error eliminando grupo", "error"),
  });

  const addMemberMut = useMutation({
    mutationFn: (userId: string) => addGroupMember(selectedGroup!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-members", selectedGroup?.id] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      setSelectedUserId("");
      setUserSearch("");
      toast("Miembro agregado", "success");
    },
    onError: () => toast("Error agregando miembro", "error"),
  });

  const removeMemberMut = useMutation({
    mutationFn: (userId: string) => removeGroupMember(selectedGroup!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-members", selectedGroup?.id] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      toast("Miembro eliminado", "success");
    },
    onError: () => toast("Error eliminando miembro", "error"),
  });

  return (
    <>
      <header className="app-header">
        <button className="btn btn-ghost" onClick={() => navigate("/")} style={{ padding: "5px 8px", fontSize: 18 }}>←</button>
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo" style={{ width: 28, height: 28, fontSize: 13, borderRadius: "var(--radius-xs)" }}>T</div>
          <span className="app-header-name">Trans<em>Excel</em></span>
        </button>
        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Grupos de usuarios</span>
        <div className="app-header-spacer" />
        <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => navigate("/admin/users")}>Usuarios</button>
        <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => navigate("/admin/audit")}>Auditoría</button>
        <UserMenu />
      </header>

      <main className="page" style={{ paddingTop: 28, display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, maxWidth: 960 }}>

        {/* Left: group list */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p className="section-title" style={{ margin: 0 }}>Grupos</p>
            <button className="btn btn-primary" style={{ fontSize: 12, padding: "4px 12px" }}
              onClick={() => setShowCreateForm(true)}>
              + Nuevo
            </button>
          </div>

          {showCreateForm && (
            <div className="card" style={{ padding: 14, marginBottom: 12 }}>
              <input
                placeholder="Nombre del grupo *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                style={{ marginBottom: 8 }}
              />
              <input
                placeholder="Descripción (opcional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                style={{ marginBottom: 10 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" style={{ fontSize: 12 }}
                  disabled={!newName.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}>
                  Crear
                </button>
                <button className="btn btn-secondary" style={{ fontSize: 12 }}
                  onClick={() => { setShowCreateForm(false); setNewName(""); setNewDesc(""); }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Cargando...</p>
          ) : groups.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Sin grupos todavía.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {groups.map((g) => (
                <div
                  key={g.id}
                  onClick={() => setSelectedGroup(g)}
                  style={{
                    padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                    border: selectedGroup?.id === g.id
                      ? "1px solid var(--color-primary)"
                      : "1px solid var(--color-border-light)",
                    background: selectedGroup?.id === g.id
                      ? "var(--color-primary-bg)"
                      : "var(--color-surface)",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>👥 {g.name}</p>
                    {g.description && (
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>{g.description}</p>
                    )}
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>
                      {g.member_count} miembro{g.member_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    className="btn btn-danger-ghost"
                    style={{ padding: "3px 7px", fontSize: 13 }}
                    title="Eliminar grupo"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await confirm({
                        title: `Eliminar grupo "${g.name}"`,
                        message: "Se eliminarán todos los permisos asociados. Los usuarios mantienen su rol global.",
                        confirmLabel: "Eliminar",
                        variant: "danger",
                      });
                      if (ok) deleteMut.mutate(g.id);
                    }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: members */}
        <div>
          {!selectedGroup ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              height: 300, color: "var(--color-text-muted)" }}>
              <span style={{ fontSize: 40 }}>👥</span>
              <p style={{ marginTop: 12, fontSize: 14 }}>Selecciona un grupo para ver sus miembros</p>
            </div>
          ) : (
            <div className="card" style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{selectedGroup.name}</h3>
                  {selectedGroup.description && (
                    <p style={{ margin: "4px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>{selectedGroup.description}</p>
                  )}
                </div>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {members.length} miembro{members.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Member list */}
              {members.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 16 }}>Sin miembros todavía.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                  {members.map((m) => (
                    <MemberRow
                      key={m.user_id}
                      member={m}
                      onRemove={() => removeMemberMut.mutate(m.user_id)}
                    />
                  ))}
                </div>
              )}

              {/* Add member */}
              <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: 16 }}>
                <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600 }}>Agregar miembro</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <input
                      placeholder="Buscar usuario por email o nombre..."
                      value={userSearch}
                      onChange={(e) => { setUserSearch(e.target.value); setSelectedUserId(""); }}
                    />
                    {userSearch.length >= 1 && (
                      <div style={{
                        position: "absolute", top: "100%", left: 0, right: 0,
                        background: "var(--color-surface)", border: "1px solid var(--color-border)",
                        borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        zIndex: 10, maxHeight: 180, overflowY: "auto",
                      }}>
                        {nonMembers.slice(0, 8).map((u) => (
                          <button key={u.id} onClick={() => { setSelectedUserId(u.id); setUserSearch(`${u.username} (${u.email})`); }}
                            style={{
                              display: "block", width: "100%", textAlign: "left",
                              padding: "8px 12px", fontSize: 13,
                              background: selectedUserId === u.id ? "var(--color-primary-bg)" : "transparent",
                              border: "none", cursor: "pointer",
                            }}>
                            <span style={{ fontWeight: 600 }}>{u.username}</span>
                            <span style={{ color: "var(--color-text-muted)", marginLeft: 8, fontSize: 12 }}>{u.email}</span>
                            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--color-text-muted)" }}>[{u.role}]</span>
                          </button>
                        ))}
                        {nonMembers.length === 0 && (
                          <p style={{ padding: "8px 12px", fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>Sin resultados</p>
                        )}
                      </div>
                    )}
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 13, whiteSpace: "nowrap" }}
                    disabled={!selectedUserId || addMemberMut.isPending}
                    onClick={() => addMemberMut.mutate(selectedUserId)}>
                    + Agregar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function MemberRow({ member, onRemove }: { member: GroupMember; onRemove: () => void }) {
  const roleColors: Record<string, string> = {
    admin: "#DC2626", editor: "#D97706", viewer: "#2563EB",
  };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px", borderRadius: 8,
      border: "1px solid var(--color-border-light)",
    }}>
      <span style={{ fontSize: 18 }}>👤</span>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{member.username}</p>
        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>{member.email}</p>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
        background: `${roleColors[member.role] ?? "#6B7280"}18`,
        color: roleColors[member.role] ?? "#6B7280",
        border: `1px solid ${roleColors[member.role] ?? "#6B7280"}40`,
      }}>
        {member.role}
      </span>
      <button className="btn btn-danger-ghost" onClick={onRemove} style={{ padding: "3px 7px", fontSize: 13 }} title="Quitar del grupo">×</button>
    </div>
  );
}

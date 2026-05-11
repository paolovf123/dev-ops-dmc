import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getGroups, createGroup, deleteGroup, getGroupMembers, addGroupMember, removeGroupMember } from "../api/groups";
import api from "../api/client";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import UserMenu from "../components/UserMenu";
import type { UserGroup } from "../types";

const GROUP_COLORS = [
  ["#6366F1","#818CF8"], ["#8B5CF6","#A78BFA"], ["#EC4899","#F472B6"],
  ["#F59E0B","#FCD34D"], ["#10B981","#34D399"], ["#0EA5E9","#38BDF8"],
  ["#EF4444","#F87171"], ["#009A44","#34D399"],
];
function groupColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % GROUP_COLORS.length;
  return GROUP_COLORS[h];
}

const USER_COLORS = ["#6366F1","#8B5CF6","#EC4899","#F59E0B","#10B981","#0EA5E9","#EF4444","#14B8A6"];
function userColor(name: string) { return USER_COLORS[name.charCodeAt(0) % USER_COLORS.length]; }

function GroupAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const [from, to] = groupColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: `linear-gradient(135deg, ${from}, ${to})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 700, fontSize: size * 0.44, flexShrink: 0,
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function UserAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const c = userColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: c + "1A", border: `2px solid ${c}40`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: c, fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  admin:  { bg: "#EDE9FE", color: "#7C3AED" },
  editor: { bg: "#FEF3C7", color: "#D97706" },
  viewer: { bg: "#DCFCE7", color: "#16A34A" },
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 11px", borderRadius: 8,
  border: "1px solid var(--color-border)", background: "var(--color-bg)",
  color: "var(--color-text)", fontSize: 13, boxSizing: "border-box", outline: "none",
};

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
  const [memberSearch, setMemberSearch] = useState("");

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

  const filteredMembers = memberSearch
    ? members.filter((m) =>
        m.username.toLowerCase().includes(memberSearch.toLowerCase()) ||
        m.email.toLowerCase().includes(memberSearch.toLowerCase())
      )
    : members;

  return (
    <>
      <header className="app-header" style={{ gap: 4 }}>
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo">T</div>
          <span className="app-header-name">Trans<em>Excel</em></span>
        </button>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" style={{ flexShrink: 0, margin: "0 2px" }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Grupos</span>
        <div style={{ width: 1, height: 22, background: "var(--color-border)", margin: "0 8px", flexShrink: 0 }} />
        <div className="app-header-spacer" />
        <nav style={{ display: "flex", gap: 2 }}>
          {[
            { title: "Workspaces", path: "/admin/workspaces", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
            { title: "Usuarios", path: "/admin/users", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
            { title: "Auditoría", path: "/admin/audit", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
          ].map(({ title, path, icon }) => (
            <button key={path} onClick={() => navigate(path)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", height: 34, borderRadius: 7, background: "transparent", border: "1.5px solid transparent", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 12.5, fontWeight: 600, transition: "all 0.14s", whiteSpace: "nowrap" }}
              onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "var(--color-border-light)"; el.style.borderColor = "var(--color-border)"; el.style.color = "var(--color-text)"; }}
              onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "transparent"; el.style.borderColor = "transparent"; el.style.color = "var(--color-text-secondary)"; }}
            >
              {icon}<span>{title}</span>
            </button>
          ))}
        </nav>
        <div style={{ width: 1, height: 22, background: "var(--color-border)", margin: "0 4px", flexShrink: 0 }} />
        <UserMenu />
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 48px", display: "flex", gap: 24, alignItems: "flex-start" }}>

        {/* ── Sidebar ── */}
        <div style={{ width: 290, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: -0.3 }}>Grupos</h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                {groups.length} grupo{groups.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, padding: "6px 12px", gap: 5, display: "flex", alignItems: "center" }}
              onClick={() => { setShowCreateForm(true); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Nuevo
            </button>
          </div>

          {/* Formulario crear */}
          {showCreateForm && (
            <div style={{
              background: "var(--color-surface)", border: "1.5px solid var(--color-primary, #009A44)",
              borderRadius: 12, padding: 16, boxShadow: "0 4px 16px rgba(0,154,68,0.12)",
            }}>
              <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 13, color: "var(--color-primary, #009A44)" }}>
                Nuevo grupo
              </p>
              <input
                autoFocus placeholder="Nombre del grupo *"
                value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newName.trim() && createMut.mutate()}
                style={inputStyle}
              />
              <input
                placeholder="Descripción (opcional)"
                value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                style={{ ...inputStyle, marginTop: 8 }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" style={{ fontSize: 12, flex: 1 }}
                  disabled={!newName.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}>
                  {createMut.isPending ? "Creando…" : "Crear grupo"}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }}
                  onClick={() => { setShowCreateForm(false); setNewName(""); setNewDesc(""); }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Lista de grupos */}
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3].map((i) => (
                <div key={i} style={{ height: 68, borderRadius: 12, background: "var(--color-surface)", border: "1px solid var(--color-border)", opacity: 0.5 }} />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-muted)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
              <p style={{ fontSize: 13, margin: 0 }}>No hay grupos aún</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {groups.map((g) => {
                const isActive = selectedGroup?.id === g.id;
                const [from] = groupColor(g.name);
                return (
                  <div
                    key={g.id}
                    onClick={() => { setSelectedGroup(g); setMemberSearch(""); }}
                    style={{
                      background: "var(--color-surface)",
                      border: `1.5px solid ${isActive ? from : "var(--color-border)"}`,
                      borderRadius: 12, padding: "11px 12px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 10,
                      boxShadow: isActive ? `0 0 0 3px ${from}22, 0 2px 8px ${from}14` : "none",
                      transition: "all 0.15s",
                    }}
                  >
                    <GroupAvatar name={g.name} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.name}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>
                        {g.member_count} miembro{g.member_count !== 1 ? "s" : ""}
                        {g.description ? ` · ${g.description.slice(0, 28)}${g.description.length > 28 ? "…" : ""}` : ""}
                      </p>
                    </div>
                    <button
                      title="Eliminar grupo"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await confirm({
                          title: `Eliminar "${g.name}"`,
                          message: "Se eliminarán todos los permisos asociados. Los usuarios mantienen su rol global.",
                          confirmLabel: "Eliminar",
                          variant: "danger",
                        });
                        if (ok) deleteMut.mutate(g.id);
                      }}
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: "5px",
                        borderRadius: 6, color: "var(--color-text-muted)", display: "flex",
                        alignItems: "center", flexShrink: 0, transition: "all 0.12s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#EF4444"; (e.currentTarget as HTMLElement).style.background = "#FEE2E2"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)"; (e.currentTarget as HTMLElement).style.background = "none"; }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                        <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Panel derecho ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedGroup ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "100px 0", color: "var(--color-text-muted)", textAlign: "center",
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20, background: "var(--color-surface)",
                border: "1.5px dashed var(--color-border)", display: "flex", alignItems: "center",
                justifyContent: "center", marginBottom: 16, fontSize: 32,
              }}>👥</div>
              <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px", color: "var(--color-text)" }}>Selecciona un grupo</p>
              <p style={{ fontSize: 13, margin: 0 }}>Elige un grupo para ver y gestionar sus miembros</p>
            </div>
          ) : (
            <>
              {/* Header grupo seleccionado */}
              <div style={{
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 16, padding: "20px 24px", marginBottom: 20,
                display: "flex", alignItems: "center", gap: 16,
              }}>
                <GroupAvatar name={selectedGroup.name} size={52} />
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.4 }}>{selectedGroup.name}</h2>
                  {selectedGroup.description && (
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>{selectedGroup.description}</p>
                  )}
                </div>
                <div style={{ borderLeft: "1px solid var(--color-border)", paddingLeft: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 11, marginBottom: 2 }}>👤</div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{members.length}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>
                    {members.length === 1 ? "miembro" : "miembros"}
                  </div>
                </div>
              </div>

              {/* Agregar miembro */}
              <div style={{
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 14, padding: "18px 20px", marginBottom: 20,
              }}>
                <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 14 }}>Agregar miembro</p>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <input
                      placeholder="Buscar por nombre o email…"
                      value={userSearch}
                      onChange={(e) => { setUserSearch(e.target.value); setSelectedUserId(""); }}
                      style={inputStyle}
                    />
                    {userSearch.length >= 1 && !selectedUserId && (
                      <div style={{
                        position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                        background: "var(--color-surface)", border: "1px solid var(--color-border)",
                        borderRadius: 10, zIndex: 30, maxHeight: 200, overflowY: "auto",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      }}>
                        {nonMembers.length === 0 ? (
                          <p style={{ padding: "10px 14px", fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>Sin resultados</p>
                        ) : nonMembers.slice(0, 8).map((u) => {
                          const rs = ROLE_STYLE[u.role] ?? { bg: "#F1F5F9", color: "#64748B" };
                          return (
                            <button key={u.id}
                              onClick={() => { setSelectedUserId(u.id); setUserSearch(u.username + " (" + u.email + ")"); }}
                              style={{ width: "100%", padding: "9px 13px", background: "none", border: "none", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-border-light)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                            >
                              <UserAvatar name={u.username} size={26} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{u.username}</div>
                                <div style={{ fontSize: 11, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                              </div>
                              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99, fontWeight: 700, background: rs.bg, color: rs.color, flexShrink: 0 }}>{u.role}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 13, whiteSpace: "nowrap" }}
                    disabled={!selectedUserId || addMemberMut.isPending}
                    onClick={() => addMemberMut.mutate(selectedUserId)}>
                    {addMemberMut.isPending ? "Agregando…" : "Agregar"}
                  </button>
                </div>
              </div>

              {/* Lista miembros */}
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, overflow: "hidden" }}>
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
                      placeholder="Filtrar…"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      style={{ ...inputStyle, width: 180, fontSize: 12, padding: "5px 10px" }}
                    />
                  )}
                </div>

                {members.length === 0 ? (
                  <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-text-muted)" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>👤</div>
                    <p style={{ fontSize: 13, margin: 0 }}>Sin miembros. Agrega el primero arriba.</p>
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
                    No coincide con "{memberSearch}"
                  </div>
                ) : (
                  filteredMembers.map((m, idx) => {
                    const rs = ROLE_STYLE[m.role] ?? { bg: "#F1F5F9", color: "#64748B" };
                    const isLast = idx === filteredMembers.length - 1;
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
                        <span style={{
                          fontSize: 11, padding: "3px 10px", borderRadius: 99, fontWeight: 700,
                          background: rs.bg, color: rs.color,
                        }}>
                          {m.role}
                        </span>
                        <button
                          onClick={() => removeMemberMut.mutate(m.user_id)}
                          title="Quitar del grupo"
                          style={{
                            background: "none", border: "1px solid transparent", borderRadius: 6,
                            cursor: "pointer", color: "var(--color-text-muted)", padding: "4px 6px",
                            display: "flex", alignItems: "center", transition: "all 0.15s",
                          }}
                          onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.color = "#EF4444"; el.style.background = "#FEE2E2"; el.style.borderColor = "#FECACA"; }}
                          onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.color = "var(--color-text-muted)"; el.style.background = "none"; el.style.borderColor = "transparent"; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

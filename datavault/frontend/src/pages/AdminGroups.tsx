import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { getGroups, createGroup, deleteGroup, getGroupMembers, addGroupMember, removeGroupMember } from "../api/groups";
import { getWorkspaces, getWorkspaceMembers } from "../api/workspaces";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import UserMenu from "../components/UserMenu";
import type { UserGroup } from "../types";

const GROUP_COLORS = [
  ["#6366F1","#818CF8"], ["#8B5CF6","#A78BFA"], ["#EC4899","#F472B6"],
  ["#F59E0B","#FCD34D"], ["#10B981","#34D399"], ["#0EA5E9","#38BDF8"],
  ["#EF4444","#F87171"], ["#0EA5E9","#34D399"],
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
      color: "#fff", fontWeight: 800, fontSize: size * 0.38, flexShrink: 0,
      boxShadow: `0 2px 8px ${from}44`,
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
      background: c + "18", border: `2px solid ${c}50`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: c, fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

const ROLE_META: Record<string, { bg: string; color: string; border: string; label: string }> = {
  admin:  { bg: "#EDE9FE", color: "#7C3AED", border: "#C4B5FD", label: "★ Admin" },
  editor: { bg: "#FEF3C7", color: "#D97706", border: "#FDE68A", label: "✎ Editor" },
  viewer: { bg: "#DCFCE7", color: "#16A34A", border: "#86EFAC", label: "◉ Viewer" },
  owner:  { bg: "#FFF1F2", color: "#E11D48", border: "#FECDD3", label: "♛ Owner" },
  member: { bg: "#F0F9FF", color: "#0369A1", border: "#BAE6FD", label: "● Member" },
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 9,
  border: "1.5px solid var(--color-border)", background: "var(--color-bg)",
  color: "var(--color-text)", fontSize: 13, boxSizing: "border-box", outline: "none",
  transition: "border-color 0.15s",
};

export default function AdminGroups() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { current } = useWorkspace();

  const [selectedGroup, setSelectedGroup] = useState<UserGroup | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [groupSearch, setGroupSearch] = useState("");

  // Member panel state
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberRoleFilter, setMemberRoleFilter] = useState("");
  const [memberWsFilter, setMemberWsFilter] = useState("");

  const { data: groups = [], isLoading } = useQuery({ queryKey: ["groups"], queryFn: getGroups });

  useEffect(() => {
    if (groups.length > 0 && !selectedGroup) setSelectedGroup(groups[0]);
  }, [groups, selectedGroup]);

  const { data: members = [] } = useQuery({
    queryKey: ["group-members", selectedGroup?.id],
    queryFn: () => getGroupMembers(selectedGroup!.id),
    enabled: !!selectedGroup,
  });
  const { data: workspaces = [] } = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces, staleTime: 60_000 });

  // Workspace donde el usuario tiene permisos de gestión (para filtrar usuarios)
  const managedWsId = useMemo(() => {
    if (isAdmin) return undefined;
    if (current?.my_role === "owner" || current?.my_role === "admin_ws") return current.id;
    return workspaces.find((w) => w.my_role === "owner" || w.my_role === "admin_ws")?.id;
  }, [isAdmin, current, workspaces]);

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users", isAdmin ? null : managedWsId],
    queryFn: () => {
      const url = isAdmin ? "/auth/users" : `/auth/users?workspace_id=${managedWsId}`;
      return api.get<{ id: string; email: string; username: string; role: string }[]>(url).then((r) => r.data);
    },
    enabled: isAdmin || !!managedWsId,
  });

  const wsMemberQueries = useQueries({
    queries: workspaces.map((ws) => ({
      queryKey: ["workspace-members", ws.id],
      queryFn: () => getWorkspaceMembers(ws.id),
      staleTime: 60_000,
    })),
  });

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

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groups;
    const q = groupSearch.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q));
  }, [groups, groupSearch]);

  const totalMembers = useMemo(() => groups.reduce((s, g) => s + (g.member_count ?? 0), 0), [groups]);

  const nonMembers = useMemo(() =>
    allUsers.filter((u) =>
      !members.find((m) => m.user_id === u.id) &&
      (u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
       u.username.toLowerCase().includes(userSearch.toLowerCase()))
    ), [allUsers, members, userSearch]);

  const filteredMembers = useMemo(() => {
    let list = members;
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase();
      list = list.filter((m) => m.username.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    }
    if (memberRoleFilter) list = list.filter((m) => m.role === memberRoleFilter);
    if (memberWsFilter) {
      list = list.filter((m) => (userWorkspacesMap.get(m.user_id) ?? []).some((w) => w.id === memberWsFilter));
    }
    return list;
  }, [members, memberSearch, memberRoleFilter, memberWsFilter, userWorkspacesMap]);

  const hasMemberFilters = memberSearch || memberRoleFilter || memberWsFilter;

  const createMut = useMutation({
    mutationFn: () => createGroup(newName.trim(), newDesc.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      toast("Grupo creado", "success");
      setShowCreateForm(false); setNewName(""); setNewDesc("");
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
      setSelectedUserId(""); setUserSearch("");
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

  const [from0] = selectedGroup ? groupColor(selectedGroup.name) : ["#9CA3AF", "#6B7280"];

  return (
    <>
      {/* ── Header ── */}
      <header className="app-header" style={{ gap: 4 }}>
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo app-header-logo--img"><img src="/opsgrid-logo.svg" alt="OpsGrid" /></div>
          <span className="app-header-name">Ops<em>Grid</em></span>
        </button>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" style={{ flexShrink: 0, margin: "0 2px" }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Grupos</span>
        <div style={{ width: 1, height: 22, background: "var(--color-border)", margin: "0 8px", flexShrink: 0 }} />
        <div className="app-header-spacer" />
        <nav style={{ display: "flex", gap: 2 }}>
          {[
            ...(isAdmin ? [{ title: "Workspaces", path: "/admin/workspaces", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> }] : []),
            { title: "Equipo",    path: "/admin/workspaces", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
            { title: "Usuarios",  path: managedWsId ? `/admin/users?workspace_id=${managedWsId}` : "/admin/users", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
            ...(isAdmin ? [{ title: "Auditoría", path: "/admin/audit", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> }] : []),
          ].map(({ title, path, icon }) => (
            <button key={path} onClick={() => navigate(path)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", height:34, borderRadius:7, background:"transparent", border:"1.5px solid transparent", cursor:"pointer", color:"var(--color-text-secondary)", fontSize:12.5, fontWeight:600, transition:"all 0.14s", whiteSpace:"nowrap" }}
              onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background="var(--color-border-light)"; el.style.borderColor="var(--color-border)"; el.style.color="var(--color-text)"; }}
              onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background="transparent"; el.style.borderColor="transparent"; el.style.color="var(--color-text-secondary)"; }}
            >{icon}<span>{title}</span></button>
          ))}
        </nav>
        <div style={{ width:1, height:22, background:"var(--color-border)", margin:"0 4px", flexShrink:0 }} />
        <UserMenu />
      </header>

      <div style={{ maxWidth:1200, margin:"0 auto", padding:"28px 24px 48px", display:"flex", gap:24, alignItems:"flex-start" }}>

        {/* ══ SIDEBAR ══ */}
        <div style={{ width:300, flexShrink:0, display:"flex", flexDirection:"column", gap:14 }}>

          {/* Stats strip */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[
              { label:"Grupos",   value: groups.length,   color:"#7C3AED", bg:"#F5F3FF", border:"#DDD6FE" },
              { label:"Miembros", value: totalMembers, color:"#0369A1", bg:"#F0F9FF", border:"#BAE6FD" },
            ].map((s) => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:10, padding:"10px 14px" }}>
                <div style={{ fontSize:20, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
                <div style={{ fontSize:10, color:s.color, opacity:0.75, fontWeight:600, marginTop:2, textTransform:"uppercase", letterSpacing:"0.05em" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Title + New button */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, fontWeight:700, color:"var(--color-text-muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Lista de grupos</span>
            <button className="btn btn-primary"
              style={{ fontSize:12, padding:"5px 12px", gap:5, display:"flex", alignItems:"center", height:30 }}
              onClick={() => setShowCreateForm((v) => !v)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Nuevo
            </button>
          </div>

          {/* Create form */}
          {showCreateForm && (
            <div style={{ background:"var(--color-surface)", border:"1.5px solid #7C3AED", borderRadius:12, padding:16, boxShadow:"0 4px 16px #7C3AED22" }}>
              <p style={{ margin:"0 0 12px", fontWeight:700, fontSize:13, color:"#7C3AED" }}>Nuevo grupo</p>
              <input autoFocus placeholder="Nombre del grupo *" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newName.trim() && createMut.mutate()}
                style={inputStyle} />
              <input placeholder="Descripción (opcional)" value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                style={{ ...inputStyle, marginTop:8 }} />
              <div style={{ display:"flex", gap:8, marginTop:12 }}>
                <button className="btn btn-primary" style={{ fontSize:12, flex:1 }}
                  disabled={!newName.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}>
                  {createMut.isPending ? "Creando…" : "Crear grupo"}
                </button>
                <button className="btn btn-ghost" style={{ fontSize:12 }}
                  onClick={() => { setShowCreateForm(false); setNewName(""); setNewDesc(""); }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Group search */}
          {groups.length > 3 && (
            <div style={{ position:"relative" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--color-text-muted)", pointerEvents:"none" }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Buscar grupos…"
                style={{ ...inputStyle, paddingLeft:32 }} />
            </div>
          )}

          {/* Group list */}
          {isLoading ? (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {[1,2,3].map((i) => (
                <div key={i} style={{ height:72, borderRadius:12, background:"var(--color-surface)", border:"1px solid var(--color-border)", opacity:0.4+i*0.1 }} />
              ))}
            </div>
          ) : filteredGroups.length === 0 ? (
            <div style={{ textAlign:"center", padding:"32px 0", color:"var(--color-text-muted)" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>👥</div>
              <p style={{ fontSize:13, margin:0 }}>{groupSearch ? "Sin coincidencias" : "No hay grupos aún"}</p>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {filteredGroups.map((g) => {
                const isActive = selectedGroup?.id === g.id;
                const [from] = groupColor(g.name);
                return (
                  <div key={g.id}
                    onClick={() => { setSelectedGroup(g); setMemberSearch(""); setMemberRoleFilter(""); setMemberWsFilter(""); }}
                    style={{
                      background:"var(--color-surface)",
                      border:`1.5px solid ${isActive ? from : "var(--color-border)"}`,
                      borderRadius:12, padding:"12px 14px", cursor:"pointer",
                      display:"flex", alignItems:"center", gap:12,
                      boxShadow: isActive ? `0 0 0 3px ${from}20, 0 2px 10px ${from}18` : "0 1px 3px rgba(0,0,0,0.04)",
                      transition:"all 0.15s",
                    }}>
                    <GroupAvatar name={g.name} size={36} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color: isActive ? from : "var(--color-text)" }}>
                        {g.name}
                      </div>
                      <div style={{ fontSize:11, color:"var(--color-text-muted)", marginTop:2, display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ display:"flex", alignItems:"center", gap:3 }}>
                          <span style={{ fontSize:9 }}>👤</span>
                          {g.member_count} {g.member_count === 1 ? "miembro" : "miembros"}
                        </span>
                        {g.description && (
                          <>
                            <span>·</span>
                            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.description}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      title="Eliminar grupo"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await confirm({
                          title: `Eliminar "${g.name}"`,
                          message:"Se eliminarán todos los permisos asociados. Los usuarios mantienen su rol global.",
                          confirmLabel:"Eliminar", variant:"danger",
                        });
                        if (ok) deleteMut.mutate(g.id);
                      }}
                      style={{ background:"none", border:"none", cursor:"pointer", padding:6, borderRadius:7, color:"var(--color-text-muted)", display:"flex", alignItems:"center", flexShrink:0, transition:"all 0.12s" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color="#EF4444"; (e.currentTarget as HTMLElement).style.background="#FEE2E2"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color="var(--color-text-muted)"; (e.currentTarget as HTMLElement).style.background="none"; }}
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

        {/* ══ PANEL DERECHO ══ */}
        <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:16 }}>
          {!selectedGroup ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"120px 0", color:"var(--color-text-muted)", textAlign:"center" }}>
              <div style={{ width:80, height:80, borderRadius:24, background:"var(--color-surface)", border:"1.5px dashed var(--color-border)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20, fontSize:36 }}>👥</div>
              <p style={{ fontSize:16, fontWeight:700, margin:"0 0 8px", color:"var(--color-text)" }}>Selecciona un grupo</p>
              <p style={{ fontSize:13, margin:0 }}>Elige un grupo para ver y gestionar sus miembros</p>
            </div>
          ) : (
            <>
              {/* ── Group hero ── */}
              <div style={{
                background:"var(--color-surface)", border:"1px solid var(--color-border)",
                borderRadius:16, overflow:"hidden",
                boxShadow:"0 1px 4px rgba(0,0,0,0.06)",
              }}>
                {/* Color strip */}
                <div style={{ height:6, background:`linear-gradient(90deg, ${from0}, ${from0}88)` }} />
                <div style={{ padding:"20px 24px", display:"flex", alignItems:"center", gap:18 }}>
                  <GroupAvatar name={selectedGroup.name} size={56} />
                  <div style={{ flex:1 }}>
                    <h2 style={{ margin:0, fontSize:21, fontWeight:800, letterSpacing:-0.5, color:"var(--color-text)" }}>{selectedGroup.name}</h2>
                    {selectedGroup.description && (
                      <p style={{ margin:"4px 0 0", fontSize:13, color:"var(--color-text-muted)" }}>{selectedGroup.description}</p>
                    )}
                  </div>
                  {/* Mini stats */}
                  <div style={{ display:"flex", gap:0, borderLeft:"1px solid var(--color-border)", marginLeft:8 }}>
                    {[
                      { icon:"👤", value: members.length, label: members.length === 1 ? "miembro" : "miembros" },
                      { icon:"⬡", value: new Set(members.flatMap(m => userWorkspacesMap.get(m.user_id) ?? []).map(w => w.id)).size, label:"workspaces" },
                    ].map((s, i) => (
                      <div key={s.label} style={{ paddingLeft: i===0 ? 24 : 20, paddingRight:20, textAlign:"center", borderRight: i===0 ? "1px solid var(--color-border)" : "none" }}>
                        <div style={{ fontSize:9, marginBottom:2 }}>{s.icon}</div>
                        <div style={{ fontSize:24, fontWeight:800, lineHeight:1, color:"var(--color-text)" }}>{s.value}</div>
                        <div style={{ fontSize:10, color:"var(--color-text-muted)", marginTop:2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Agregar miembro ── */}
              <div style={{ background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:14, padding:"18px 20px" }}>
                <p style={{ margin:"0 0 12px", fontWeight:700, fontSize:14, color:"var(--color-text)" }}>
                  Agregar miembro al grupo
                </p>
                <div style={{ display:"flex", gap:10 }}>
                  <div style={{ flex:1, position:"relative" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--color-text-muted)", pointerEvents:"none" }}>
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input
                      placeholder="Buscar usuario por nombre o email…"
                      value={userSearch}
                      onChange={(e) => { setUserSearch(e.target.value); setSelectedUserId(""); }}
                      style={{ ...inputStyle, paddingLeft:32 }}
                      onFocus={(e) => { e.currentTarget.style.borderColor="#7C3AED"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor="var(--color-border)"; }}
                    />
                    {userSearch.length >= 1 && !selectedUserId && (
                      <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:10, zIndex:30, maxHeight:200, overflowY:"auto", boxShadow:"0 8px 24px rgba(0,0,0,0.14)" }}>
                        {nonMembers.length === 0 ? (
                          <p style={{ padding:"12px 16px", fontSize:13, color:"var(--color-text-muted)", margin:0 }}>Sin resultados</p>
                        ) : nonMembers.slice(0, 8).map((u) => {
                          const rm = ROLE_META[u.role] ?? ROLE_META.viewer;
                          return (
                            <button key={u.id}
                              onClick={() => { setSelectedUserId(u.id); setUserSearch(`${u.username} (${u.email})`); }}
                              style={{ width:"100%", padding:"9px 14px", background:"none", border:"none", textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background="var(--color-border-light)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background="none"; }}>
                              <UserAvatar name={u.username} size={28} />
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:600, color:"var(--color-text)" }}>{u.username}</div>
                                <div style={{ fontSize:11, color:"var(--color-text-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.email}</div>
                              </div>
                              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:99, fontWeight:700, background:rm.bg, color:rm.color, border:`1px solid ${rm.border}`, flexShrink:0 }}>{rm.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button className="btn btn-primary" style={{ fontSize:13, whiteSpace:"nowrap", height:38, padding:"0 18px" }}
                    disabled={!selectedUserId || addMemberMut.isPending}
                    onClick={() => addMemberMut.mutate(selectedUserId)}>
                    {addMemberMut.isPending ? "Agregando…" : "+ Agregar"}
                  </button>
                </div>
              </div>

              {/* ── Member list ── */}
              <div style={{ background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:14, overflow:"hidden" }}>

                {/* Header + filters */}
                <div style={{ padding:"14px 20px", background:"var(--color-bg)", borderBottom:"1px solid var(--color-border)", display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontWeight:700, fontSize:14 }}>
                      Miembros
                      <span style={{ marginLeft:8, fontSize:12, fontWeight:500, color:"var(--color-text-muted)" }}>({members.length})</span>
                    </span>
                    {hasMemberFilters && (
                      <button onClick={() => { setMemberSearch(""); setMemberRoleFilter(""); setMemberWsFilter(""); }}
                        style={{ fontSize:11, color:"#DC2626", background:"#FEF2F2", border:"1px solid #FCA5A5", borderRadius:7, padding:"3px 10px", cursor:"pointer", fontWeight:600 }}>
                        ✕ Limpiar
                      </button>
                    )}
                  </div>

                  {members.length > 2 && (
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {/* Member search */}
                      <div style={{ position:"relative", flex:1, minWidth:160 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:"var(--color-text-muted)", pointerEvents:"none" }}>
                          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                        <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
                          placeholder="Buscar miembro…"
                          style={{ ...inputStyle, paddingLeft:28, padding:"6px 10px 6px 28px", fontSize:12 }}
                          onFocus={(e) => { e.currentTarget.style.borderColor="#7C3AED"; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor="var(--color-border)"; }}
                        />
                      </div>

                      {/* Role filter */}
                      <select value={memberRoleFilter} onChange={(e) => setMemberRoleFilter(e.target.value)}
                        style={{ height:34, padding:"0 10px", border:"1.5px solid var(--color-border)", borderRadius:9, fontSize:12, background: memberRoleFilter ? "#F5F3FF" : "var(--color-bg)", color: memberRoleFilter ? "#7C3AED" : "var(--color-text)", cursor:"pointer", outline:"none", fontWeight: memberRoleFilter ? 600 : 400 }}>
                        <option value="">Todos los roles</option>
                        {["admin","editor","viewer"].map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>

                      {/* Workspace filter */}
                      {workspaces.length > 0 && (
                        <select value={memberWsFilter} onChange={(e) => setMemberWsFilter(e.target.value)}
                          style={{ height:34, padding:"0 10px", border:"1.5px solid var(--color-border)", borderRadius:9, fontSize:12, background: memberWsFilter ? "#F0FDF4" : "var(--color-bg)", color: memberWsFilter ? "#15803D" : "var(--color-text)", cursor:"pointer", outline:"none", fontWeight: memberWsFilter ? 600 : 400 }}>
                          <option value="">Todos los workspaces</option>
                          {workspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Result count when filtering */}
                  {hasMemberFilters && (
                    <span style={{ fontSize:12, color:"var(--color-text-muted)" }}>
                      {filteredMembers.length} de {members.length} miembro{members.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Table header */}
                {members.length > 0 && (
                  <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1.4fr 80px", padding:"8px 20px", background:"var(--color-bg)", borderBottom:"1px solid var(--color-border)" }}>
                    {["Usuario","Rol","Workspaces",""].map((col) => (
                      <div key={col} style={{ fontSize:10, fontWeight:700, color:"var(--color-text-muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>{col}</div>
                    ))}
                  </div>
                )}

                {/* Member rows */}
                {members.length === 0 ? (
                  <div style={{ padding:"48px 0", textAlign:"center", color:"var(--color-text-muted)" }}>
                    <div style={{ fontSize:32, marginBottom:10 }}>👤</div>
                    <p style={{ fontSize:14, margin:"0 0 4px", fontWeight:600, color:"var(--color-text)" }}>Sin miembros</p>
                    <p style={{ fontSize:13, margin:0 }}>Agrega el primero usando el buscador de arriba</p>
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <div style={{ padding:"32px", textAlign:"center", color:"var(--color-text-muted)", fontSize:13 }}>
                    <div style={{ fontSize:24, marginBottom:8 }}>🔍</div>
                    No hay miembros que coincidan con los filtros
                  </div>
                ) : (
                  filteredMembers.map((m, idx) => {
                    const rm = ROLE_META[m.role] ?? ROLE_META.viewer;
                    const uws = userWorkspacesMap.get(m.user_id) ?? [];
                    return (
                      <div key={m.user_id}
                        style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1.4fr 80px", padding:"13px 20px", alignItems:"center", borderBottom: idx < filteredMembers.length-1 ? "1px solid var(--color-border-light)" : "none", transition:"background 0.1s" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background="var(--color-bg)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background="transparent"; }}>

                        {/* Usuario */}
                        <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
                          <UserAvatar name={m.username} size={36} />
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontWeight:600, fontSize:13.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.username}</div>
                            <div style={{ fontSize:11, color:"var(--color-text-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.email}</div>
                          </div>
                        </div>

                        {/* Rol */}
                        <div>
                          <span style={{ fontSize:11, padding:"3px 10px", borderRadius:99, fontWeight:700, background:rm.bg, color:rm.color, border:`1px solid ${rm.border}` }}>
                            {rm.label}
                          </span>
                        </div>

                        {/* Workspaces */}
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                          {uws.length === 0 ? (
                            <span style={{ fontSize:11, color:"var(--color-text-muted)", fontStyle:"italic" }}>—</span>
                          ) : uws.map((ws) => (
                            <button key={ws.id}
                              onClick={() => setMemberWsFilter(memberWsFilter === ws.id ? "" : ws.id)}
                              title={`Filtrar por ${ws.name}`}
                              style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background: memberWsFilter===ws.id ? "#DCFCE7" : "#F0FDF4", color:"#15803D", border:`1px solid ${memberWsFilter===ws.id ? "#4ADE80" : "#86EFAC"}`, cursor:"pointer", boxShadow: memberWsFilter===ws.id ? "0 0 0 2px #86EFAC" : "none", transition:"all 0.12s" }}>
                              ⬡ {ws.name}
                            </button>
                          ))}
                        </div>

                        {/* Acción */}
                        <div style={{ display:"flex", justifyContent:"flex-end" }}>
                          <button
                            onClick={() => removeMemberMut.mutate(m.user_id)}
                            title="Quitar del grupo"
                            style={{ height:30, width:30, background:"none", border:"1px solid transparent", borderRadius:8, cursor:"pointer", color:"var(--color-text-muted)", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}
                            onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.color="#EF4444"; el.style.background="#FEE2E2"; el.style.borderColor="#FECACA"; }}
                            onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.color="var(--color-text-muted)"; el.style.background="none"; el.style.borderColor="transparent"; }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                              <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        </div>
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

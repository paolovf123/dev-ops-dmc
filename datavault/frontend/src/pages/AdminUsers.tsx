import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import UserMenu from "../components/UserMenu";
import { useToast } from "../components/Toast";

interface UserRow {
  id: string;
  email: string;
  username: string;
  role: "admin" | "editor" | "viewer";
  is_active: boolean;
  created_at: string;
}

const ROLE_META = {
  admin:  { label: "Admin",  icon: "★", desc: "Acceso total" },
  editor: { label: "Editor", icon: "✎", desc: "Edita registros" },
  viewer: { label: "Viewer", icon: "◉", desc: "Solo lectura" },
} as const;

function Avatar({ name, role }: { name: string; role: string }) {
  const colors: Record<string, string> = {
    admin:  "linear-gradient(135deg,#7C3AED,#5B21B6)",
    editor: "linear-gradient(135deg,#009A44,#007A36)",
    viewer: "linear-gradient(135deg,#94A3B8,#64748B)",
  };
  return (
    <div className="au-avatar" style={{ background: colors[role] ?? colors.viewer }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function AdminUsers() {
  const { user: me, isAdmin } = useAuth();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const confirm   = useConfirm();
  const toast     = useToast();
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<string>("");

  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ["admin-users"],
    queryFn: () => api.get<UserRow[]>("/auth/users").then((r) => r.data),
    enabled: isAdmin,
  });

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

  if (!isAdmin) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh" }}>
        <div className="empty">
          <div className="empty-icon">🔒</div>
          <h3>Sin acceso</h3>
          <p>Solo los administradores pueden ver esta página.</p>
        </div>
      </div>
    );
  }

  const active   = users.filter((u) => u.is_active);
  const inactive = users.filter((u) => !u.is_active);

  return (
    <div style={{ minHeight:"100vh", background:"var(--color-bg)" }}>

      {/* ── Header ── */}
      <header className="app-header">
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo">T</div>
          <span className="app-header-name">Trans<em>Excel</em></span>
        </button>
        <div className="toolbar-sep" />
        <span style={{ fontSize:13, color:"var(--color-text-secondary)", fontWeight:500 }}>
          Gestión de usuarios
        </span>
        <div className="app-header-spacer" />
        <UserMenu />
      </header>

      {/* ── Hero ── */}
      <div className="ds-hero">
        <div className="ds-hero-inner">
          <div>
            <h1 className="ds-hero-title">Usuarios</h1>
            <p className="ds-hero-sub">Gestiona roles y acceso al sistema</p>
          </div>
        </div>

        {/* Stats inline */}
        <div className="ds-stats">
          {[
            { label:"Total",     value: users.length,                              color:"var(--color-text)" },
            { label:"Activos",   value: active.length,                             color:"var(--pm-green-600)" },
            { label:"Admins",    value: users.filter(u=>u.role==="admin").length,   color:"var(--pm-violet-600)" },
            { label:"Editores",  value: users.filter(u=>u.role==="editor").length,  color:"#2563EB" },
            { label:"Inactivos", value: inactive.length,                            color:"var(--color-text-muted)" },
          ].map((s, i, arr) => (
            <div key={s.label} style={{ display:"contents" }}>
              <div className="ds-stat">
                <span className="ds-stat-value" style={{ color:s.color }}>{s.value}</span>
                <span className="ds-stat-label">{s.label}</span>
              </div>
              {i < arr.length - 1 && <div className="ds-stat-divider" />}
            </div>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth:960, margin:"0 auto", padding:"28px 24px" }}>

        {/* Active users */}
        <div className="au-card">
          <div className="au-card-header">
            <span className="au-card-title">Usuarios activos</span>
            <span className="au-count">{active.length}</span>
          </div>

          {isLoading ? (
            <div style={{ padding:"48px 24px", textAlign:"center" }}>
              <div className="csv-loading-spinner" />
            </div>
          ) : active.length === 0 ? (
            <div className="empty"><p>No hay usuarios activos.</p></div>
          ) : (
            <div className="au-list">
              {active.map((user) => (
                <div key={user.id} className="au-row">

                  {/* Left: avatar + info */}
                  <div className="au-row-left">
                    <Avatar name={user.username} role={user.role} />
                    <div className="au-info">
                      <div className="au-name">
                        {user.username}
                        {user.id === me?.id && <span className="au-you">Tú</span>}
                      </div>
                      <div className="au-email">{user.email}</div>
                    </div>
                  </div>

                  {/* Center: role */}
                  <div className="au-role-cell">
                    {editingId === user.id ? (
                      <div className="au-role-edit">
                        <div className="au-role-options">
                          {(["admin","editor","viewer"] as const).map((r) => (
                            <button key={r}
                              className={`au-role-opt${pendingRole === r ? " active" : ""} au-role-opt--${r}`}
                              onClick={() => setPendingRole(r)}>
                              <span className="au-role-opt-icon">{ROLE_META[r].icon}</span>
                              <span>{ROLE_META[r].label}</span>
                            </button>
                          ))}
                        </div>
                        <div style={{ display:"flex", gap:6, marginTop:8 }}>
                          <button className="btn btn-primary" style={{ height:30, fontSize:12, padding:"0 14px" }}
                            onClick={() => saveRole(user)} disabled={roleM.isPending}>
                            Guardar
                          </button>
                          <button className="btn btn-ghost" style={{ height:30, fontSize:12 }}
                            onClick={() => setEditingId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className={`role-badge role-badge--${user.role}`}>
                        {ROLE_META[user.role].icon} {ROLE_META[user.role].label}
                      </span>
                    )}
                  </div>

                  {/* Right: date + actions */}
                  <div className="au-row-right">
                    <span className="au-date">
                      {new Date(user.created_at).toLocaleDateString("es-PE", {
                        day:"2-digit", month:"short", year:"numeric"
                      })}
                    </span>
                    {user.id !== me?.id && editingId === null && (
                      <div className="au-actions">
                        <button className="btn btn-ghost au-action-btn"
                          onClick={() => { setEditingId(user.id); setPendingRole(user.role); }}>
                          Cambiar rol
                        </button>
                        <button className="btn btn-ghost au-action-btn au-action-btn--danger"
                          onClick={() => deactivate(user)} disabled={deactivateM.isPending}>
                          Desactivar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inactive users */}
        {inactive.length > 0 && (
          <div className="au-card" style={{ marginTop:16, opacity:0.8 }}>
            <div className="au-card-header">
              <span className="au-card-title" style={{ color:"var(--color-text-muted)" }}>
                Cuentas desactivadas
              </span>
              <span className="au-count">{inactive.length}</span>
            </div>
            <div className="au-list">
              {inactive.map((user) => (
                <div key={user.id} className="au-row au-row--inactive">
                  <div className="au-row-left">
                    <Avatar name={user.username} role="viewer" />
                    <div className="au-info">
                      <div className="au-name" style={{ color:"var(--color-text-muted)" }}>{user.username}</div>
                      <div className="au-email">{user.email}</div>
                    </div>
                  </div>
                  <div className="au-role-cell">
                    <span style={{
                      fontSize:11, fontWeight:600, padding:"2px 10px", borderRadius:99,
                      background:"var(--color-border-light)", color:"var(--color-text-muted)",
                      border:"1px solid var(--color-border)",
                    }}>Inactivo</span>
                  </div>
                  <div className="au-row-right">
                    <span className="au-date">
                      {new Date(user.created_at).toLocaleDateString("es-PE", {
                        day:"2-digit", month:"short", year:"numeric"
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Role guide */}
        <div className="au-guide">
          <span className="au-guide-label">Permisos por rol</span>
          {(["admin","editor","viewer"] as const).map((r) => (
            <div key={r} className="au-guide-item">
              <span className={`role-badge role-badge--${r}`}>
                {ROLE_META[r].icon} {ROLE_META[r].label}
              </span>
              <span className="au-guide-desc">
                {r === "admin"  && "Datasets, columnas, registros y usuarios"}
                {r === "editor" && "Crear, editar y eliminar registros"}
                {r === "viewer" && "Solo puede ver datos"}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

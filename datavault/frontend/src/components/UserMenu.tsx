import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function UserMenu() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!user) return null;

  const ROLE_COLOR: Record<string, { bg: string; color: string; border: string }> = {
    admin:  { bg: "var(--pm-violet-50)",  color: "var(--pm-violet-600)", border: "#C4B5FD" },
    editor: { bg: "#EFF6FF",              color: "#2563EB",               border: "#BFDBFE" },
    viewer: { bg: "#F1F5F9",              color: "#64748B",               border: "#CBD5E1" },
  };
  const rc = ROLE_COLOR[user.role] ?? ROLE_COLOR.viewer;

  const AVATAR_GRAD: Record<string, string> = {
    admin:  "linear-gradient(135deg,#7C3AED,#5B21B6)",
    editor: "linear-gradient(135deg,#009A44,#007A36)",
    viewer: "linear-gradient(135deg,#94A3B8,#64748B)",
  };

  return (
    <div className="um-root" ref={ref}>
      {/* Trigger pill */}
      <button className={`um-trigger${open ? " um-trigger--open" : ""}`} onClick={() => setOpen((v) => !v)}>
        <div className="um-avatar" style={{ background: AVATAR_GRAD[user.role] }}>
          {user.username.charAt(0).toUpperCase()}
        </div>
        <div className="um-info">
          <span className="um-name">{user.username}</span>
          <span className="um-role" style={{ color: rc.color, background: rc.bg, borderColor: rc.border }}>
            {user.role === "admin" ? "★ Admin" : user.role === "editor" ? "✎ Editor" : "◉ Viewer"}
          </span>
        </div>
        <svg className="um-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="um-dropdown">
          {/* Header */}
          <div className="um-dropdown-header">
            <div className="um-dropdown-avatar" style={{ background: AVATAR_GRAD[user.role] }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="um-dropdown-name">{user.username}</div>
              <div className="um-dropdown-email">{user.email}</div>
            </div>
          </div>

          <div className="um-dropdown-divider" />

          {/* Items */}
          {isAdmin && (
            <>
              <button className="um-item" onClick={() => { setOpen(false); navigate("/admin/users"); }}>
                <span className="um-item-icon um-item-icon--violet">👥</span>
                <div>
                  <div className="um-item-label">Gestión de usuarios</div>
                  <div className="um-item-sub">Roles y acceso al sistema</div>
                </div>
              </button>
              <button className="um-item" onClick={() => { setOpen(false); navigate("/admin/audit"); }}>
                <span className="um-item-icon" style={{ background:"#EFF6FF" }}>📋</span>
                <div>
                  <div className="um-item-label">Registro de auditoría</div>
                  <div className="um-item-sub">Historial de todos los cambios</div>
                </div>
              </button>
            </>
          )}

          <div className="um-dropdown-divider" />

          <button className="um-item um-item--danger" onClick={() => { setOpen(false); logout(); }}>
            <span className="um-item-icon um-item-icon--danger">⎋</span>
            <div>
              <div className="um-item-label">Cerrar sesión</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

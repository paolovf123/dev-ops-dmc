import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { getWorkspaces } from "../api/workspaces";
import { IcUsers, IcList, IcSettings, IcCreditCard } from "./ui/icons";

export default function UserMenu() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Personas/Accesos también para owner/admin_ws (no solo admin global).
  const { data: workspaces = [] } = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });
  const isManager = isAdmin || workspaces.some((w) => w.my_role === "owner" || w.my_role === "admin_ws");

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
    editor: "linear-gradient(135deg,#0EA5E9,#0284C7)",
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

          {/* Personas y accesos — para admin global y owner/admin_ws */}
          {isManager && (
            <button className="um-item" onClick={() => { setOpen(false); navigate("/admin/personas"); }}>
              <span className="um-item-icon um-item-icon--violet" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pm-violet-600)" }}><IcUsers size={15} /></span>
              <div>
                <div className="um-item-label">Personas y accesos</div>
                <div className="um-item-sub">Usuarios, roles, miembros, grupos y permisos</div>
              </div>
            </button>
          )}
          {isManager && (
            <button className="um-item" onClick={() => { setOpen(false); navigate("/billing"); }}>
              <span className="um-item-icon" style={{ background:"#FFF3E8", display: "flex", alignItems: "center", justifyContent: "center", color: "#D96C10" }}><IcCreditCard size={15} /></span>
              <div>
                <div className="um-item-label">Planes y facturación</div>
                <div className="um-item-sub">Plan del workspace, uso y pagos</div>
              </div>
            </button>
          )}
          {isAdmin && (
            <button className="um-item" onClick={() => { setOpen(false); navigate("/admin/audit"); }}>
              <span className="um-item-icon" style={{ background:"#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563EB" }}><IcList size={15} /></span>
              <div>
                <div className="um-item-label">Registro de auditoría</div>
                <div className="um-item-sub">Historial de todos los cambios</div>
              </div>
            </button>
          )}

          <div className="um-dropdown-divider" />

          <button className="um-item" onClick={() => { setOpen(false); navigate("/settings"); }}>
            <span className="um-item-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)" }}><IcSettings size={15} /></span>
            <div>
              <div className="um-item-label">Integraciones</div>
              <div className="um-item-sub">API tokens y webhooks</div>
            </div>
          </button>

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

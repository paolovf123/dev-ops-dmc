import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, CreditCard, ScrollText, Settings, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getWorkspaces } from "../api/workspaces";
import { Avatar, Badge, type Tone } from "./ui/kit";

export default function UserMenu() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const tone: Tone = user.role === "admin" ? "violet" : user.role === "editor" ? "primary" : "neutral";
  const go = (to: string) => { setOpen(false); navigate(to); };

  const item = (icon: React.ReactNode, label: string, sub: string, onClick: () => void, danger = false) => (
    <button className="og-menu-item" onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--r-2)",
      cursor: "pointer", border: "none", background: "transparent", width: "100%", textAlign: "left",
      color: danger ? "var(--danger)" : "var(--text)",
    }}>
      <span style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8, flex: "none", color: danger ? "var(--danger)" : "var(--text-soft)", background: "var(--surface-alt)" }}>{icon}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", font: "600 13.5px/1.2 var(--font-sans)" }}>{label}</span>
        {sub && <span style={{ display: "block", font: "400 11.5px/1.3 var(--font-sans)", color: "var(--text-mute)" }}>{sub}</span>}
      </span>
    </button>
  );

  const divider = <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={{
        display: "flex", alignItems: "center", gap: 8, padding: "3px 10px 3px 3px",
        borderRadius: "var(--r-pill)", border: "1px solid var(--border)", background: "var(--surface)",
        cursor: "pointer", color: "var(--text)",
      }}>
        <Avatar name={user.username} size={28} />
        <span style={{ font: "600 13.5px/1 var(--font-sans)" }}>{user.username}</span>
        <Badge tone={tone}>{user.role}</Badge>
        <ChevronDown size={13} style={{ color: "var(--text-mute)", transform: open ? "rotate(180deg)" : "none", transition: "transform var(--t-mid)" }} />
      </button>

      {open && (
        <div className="og-pop" style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: 248, zIndex: 1000,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
          boxShadow: "var(--shadow-3)", padding: 6,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 12px" }}>
            <Avatar name={user.username} size={36} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", font: "600 14px/1.2 var(--font-sans)" }}>{user.username}</span>
              <span style={{ display: "block", font: "400 12px/1.2 var(--font-sans)", color: "var(--text-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
            </span>
          </div>
          {divider}
          {isManager && item(<Users size={15} />, "Personas y accesos", "Usuarios, roles, miembros, grupos y permisos", () => go("/admin/personas"))}
          {isManager && item(<CreditCard size={15} />, "Planes y facturación", "Plan del workspace, uso y pagos", () => go("/billing"))}
          {isAdmin && item(<ScrollText size={15} />, "Registro de auditoría", "Historial de todos los cambios", () => go("/admin/audit"))}
          {divider}
          {item(<Settings size={15} />, "Integraciones", "API tokens y webhooks", () => go("/settings"))}
          {divider}
          {item(<LogOut size={15} />, "Cerrar sesión", "", () => { setOpen(false); logout(); }, true)}
        </div>
      )}
    </div>
  );
}

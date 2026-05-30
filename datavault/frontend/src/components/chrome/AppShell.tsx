import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Database, FunctionSquare, Users, BarChart3, LayoutGrid,
  CreditCard, Bell, Settings, Sun, Moon, LogOut, Briefcase,
} from "lucide-react";
import AcquireModal from "../AcquireModal";
import { useAuth } from "../../auth/AuthContext";
import { useWorkspace } from "../../workspace/WorkspaceContext";
import { getWorkspaces } from "../../api/workspaces";
import { getWorkspaceBilling } from "../../api/billing";
import WorkspaceSwitcher from "../../workspace/WorkspaceSwitcher";
import UserMenu from "../UserMenu";
import GlobalSearch from "./GlobalSearch";

export type ShellSection =
  | "home" | "scripts" | "personas" | "workspaces" | "audit" | "billing" | "settings";

interface Props {
  active?: ShellSection;
  children: React.ReactNode;
}

/**
 * AppShell — chrome compartido OpsGrid (topbar + sidebar) para rutas autenticadas.
 * Renderiza el grid `.og.dv-app`: topbar (fila 1, ambas cols), sidebar (col 1) y
 * el contenido de la página como <main> (col 2, lo provee cada page).
 */
export default function AppShell({ active, children }: Props) {
  const navigate = useNavigate();
  const { isAdmin, logout } = useAuth();
  const [theme, setTheme] = useState<string>(
    () => document.documentElement.getAttribute("data-theme") || "light"
  );
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("opsgrid-theme", next); } catch { /* noop */ }
    setTheme(next);
  };
  const { data: workspaces = [] } = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });
  const isManager = isAdmin || workspaces.some((w) => w.my_role === "owner" || w.my_role === "admin_ws");
  const { current: workspace } = useWorkspace();
  // Para el card de upgrade: usar el workspace activo, o el primero disponible si no hay seleccionado
  // (admin sin workspace activo en context, pero igual queremos mostrar el card si tiene alguno Free).
  const billingWsId = workspace?.id ?? workspaces[0]?.id;
  const { data: billing } = useQuery({
    queryKey: ["billing", billingWsId],
    queryFn: () => getWorkspaceBilling(billingWsId!),
    enabled: !!billingWsId,
    staleTime: 60_000,
  });
  const showUpgrade = !!billingWsId && billing?.plan_key === "free";
  const [showAcquire, setShowAcquire] = useState(false);

  const link = (key: ShellSection, to: string, Icon: typeof Database, label: string, count?: number) => (
    <a
      href={to}
      className={`dv-side__link${active === key ? " is-active" : ""}`}
      onClick={(e) => { e.preventDefault(); navigate(to); }}
    >
      <Icon /> {label}
      {count != null && <span className="count">{count}</span>}
    </a>
  );

  return (
    <div className="og dv-app">
      {/* ─── Top bar ─── */}
      <header className="dv-topbar">
        <button
          className="dv-topbar__logo"
          onClick={() => navigate("/")}
          style={{ background: "none", border: 0, cursor: "pointer", fontSize: "var(--fs-15)" }}
        >
          <span className="dv-topbar__logo-mark" />
          OpsGrid
        </button>

        <nav className="dv-bcrumb">
          <WorkspaceSwitcher />
        </nav>

        <div className="dv-topbar__grow" />

        <GlobalSearch />

        <div className="dv-topbar__grow" />

        {isAdmin && (
          <button className="dv-topbar__icon-btn" title="Actividad reciente" onClick={() => navigate("/admin/audit")}>
            <Bell />
          </button>
        )}
        <button className="dv-topbar__icon-btn" title={theme === "dark" ? "Modo claro" : "Modo oscuro"} onClick={toggleTheme}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
        <button className="dv-topbar__icon-btn" title="Configuración" onClick={() => navigate("/settings")}><Settings /></button>
        <button
          className="dv-topbar__icon-btn"
          title="Cerrar sesión"
          onClick={async () => { await logout(); navigate("/login"); }}
          style={{ color: "var(--danger)" }}
        ><LogOut /></button>

        <div style={{ marginLeft: "var(--sp-1)" }}><UserMenu /></div>
      </header>

      {/* ─── Sidebar ─── */}
      <aside className="dv-side">
        {link("home", "/", Database, "Datasets")}
        {link("scripts", "/scripts", FunctionSquare, "Scripts")}
        {isManager && link("personas", "/admin/personas", Users, "Personas")}
        {isManager && link("workspaces", "/admin/workspaces", LayoutGrid, "Workspaces")}
        {isAdmin && link("audit", "/admin/audit", BarChart3, "Auditoría")}

        <div className="dv-side__sep" />

        {isManager && link("billing", "/billing", CreditCard, "Facturación")}

        {/* Bloque al fondo del sidebar: upgrade card (si plan Free) + logout */}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
          {showUpgrade && (
            <div className="dv-side__upgrade">
              <div className="label">Plan Free</div>
              <h5>Suscríbete a Pro</h5>
              <p>Más miembros, datasets, registros y scripts/API para tu equipo.</p>
              <button className="btn btn--primary btn--sm" onClick={() => navigate("/billing")}>Ver planes</button>
            </div>
          )}
          <a
            href="#"
            className="dv-side__link"
            onClick={(e) => { e.preventDefault(); setShowAcquire(true); }}
          >
            <Briefcase /> Adquiere OpsGrid
          </a>
          <a
            href="/login"
            className="dv-side__link"
            style={{ color: "var(--danger)" }}
            onClick={async (e) => { e.preventDefault(); await logout(); navigate("/login"); }}
          >
            <LogOut /> Cerrar sesión
          </a>
        </div>
      </aside>

      {/* ─── Main (lo provee la página) ─── */}
      {children}

      <AcquireModal open={showAcquire} onClose={() => setShowAcquire(false)} />
    </div>
  );
}

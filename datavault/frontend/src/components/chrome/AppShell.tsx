import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Database, FunctionSquare, Users, BarChart3, LayoutGrid,
  CreditCard, Bell, Settings, Sun, Moon, LogOut, Briefcase, Sparkles, Pin,
  type LucideIcon,
} from "lucide-react";
import AcquireModal from "../AcquireModal";
import { useAuth } from "../../auth/AuthContext";
import { useWorkspace } from "../../workspace/WorkspaceContext";
import { getWorkspaces } from "../../api/workspaces";
import { getWorkspaceBilling } from "../../api/billing";
import WorkspaceSwitcher from "../../workspace/WorkspaceSwitcher";
import UserMenu from "../UserMenu";
import GlobalSearch from "./GlobalSearch";
import { IconBtn, Btn } from "../ui/kit";
import { getTheme, toggleTheme as toggleThemeAttr, type Theme } from "../../utils/theme";

export type ShellSection =
  | "home" | "scripts" | "personas" | "workspaces" | "audit" | "billing" | "settings";

interface NavItem {
  key: ShellSection;
  to: string;
  Icon: LucideIcon;
  label: string;
  mgr?: boolean; // visible para managers (owner/admin_ws/admin)
  adm?: boolean; // visible solo admin global
}

const NAV: NavItem[] = [
  { key: "home", to: "/", Icon: Database, label: "Datasets" },
  { key: "scripts", to: "/scripts", Icon: FunctionSquare, label: "Scripts" },
  { key: "personas", to: "/admin/personas", Icon: Users, label: "Personas", mgr: true },
  { key: "workspaces", to: "/admin/workspaces", Icon: LayoutGrid, label: "Workspaces", mgr: true },
  { key: "audit", to: "/admin/audit", Icon: BarChart3, label: "Auditoría", adm: true },
  { key: "billing", to: "/billing", Icon: CreditCard, label: "Facturación", mgr: true },
];

const RAIL_PINNED_KEY = "opsgrid-rail-pinned";

interface Props {
  active?: ShellSection;
  children: React.ReactNode;
}

/**
 * AppShell — chrome compartido OpsGrid (topbar 58px + riel colapsable) para rutas
 * autenticadas. Renderiza el grid `.dv-app`: topbar (fila 1, ambas cols), riel (col 1),
 * y el contenido de la página como <main> (col 2, lo provee cada page).
 * El riel mide 66px (solo iconos); se expande a 236px al hover (overlay) o fijado con pin
 * (desplaza el contenido).
 */
export default function AppShell({ active, children }: Props) {
  const navigate = useNavigate();
  const { isAdmin, logout } = useAuth();
  const { current: workspace } = useWorkspace();

  const [theme, setTheme] = useState<Theme>(getTheme);
  const onToggleTheme = () => setTheme(toggleThemeAttr());

  const [pinned, setPinned] = useState<boolean>(() => {
    try { return localStorage.getItem(RAIL_PINNED_KEY) === "1"; } catch { return false; }
  });
  const [hover, setHover] = useState(false);
  const expanded = pinned || hover;
  const railCol = pinned ? 236 : 66;
  const togglePin = () => {
    setPinned((p) => {
      const next = !p;
      try { localStorage.setItem(RAIL_PINNED_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };

  const { data: workspaces = [] } = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });
  const isManager = isAdmin || workspaces.some((w) => w.my_role === "owner" || w.my_role === "admin_ws");

  const billingWsId = workspace?.id ?? workspaces[0]?.id;
  const { data: billing } = useQuery({
    queryKey: ["billing", billingWsId],
    queryFn: () => getWorkspaceBilling(billingWsId!),
    enabled: !!billingWsId,
    staleTime: 60_000,
  });
  const showUpgrade = !!billingWsId && billing?.plan_key === "free";
  const [showAcquire, setShowAcquire] = useState(false);

  const fade = (on: boolean): React.CSSProperties => ({
    opacity: on ? 1 : 0, transition: "opacity var(--t-mid)", whiteSpace: "nowrap",
  });

  const visibleNav = NAV.filter((n) => (n.adm ? isAdmin : n.mgr ? isManager : true));

  return (
    <div
      className="og dv-app"
      style={{ gridTemplateRows: "58px 1fr", gridTemplateColumns: `${railCol}px 1fr` }}
    >
      {/* ─── Top bar ─── */}
      <header className="dv-topbar" style={{ gap: 16 }}>
        <button
          className="dv-topbar__logo"
          onClick={() => navigate("/")}
          style={{ background: "none", border: 0, cursor: "pointer", gap: 9, padding: 0 }}
        >
          <span style={{
            width: 30, height: 30, borderRadius: 9,
            background: "linear-gradient(135deg, var(--accent-pri), var(--accent-calc))",
            display: "grid", placeItems: "center", color: "#fff",
            font: "800 15px/1 var(--font-sans)", boxShadow: "var(--shadow-1)",
          }}>O</span>
          <span style={{ font: "700 16px/1 var(--font-sans)", letterSpacing: "-0.01em" }}>OpsGrid</span>
        </button>

        <nav className="dv-bcrumb"><WorkspaceSwitcher /></nav>

        <GlobalSearch />

        <div className="dv-topbar__grow" />

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <IconBtn
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
            onClick={onToggleTheme}
          >{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</IconBtn>
          {isAdmin && (
            <IconBtn title="Actividad reciente" badge={undefined} onClick={() => navigate("/admin/audit")}>
              <Bell size={18} />
            </IconBtn>
          )}
          <IconBtn title="Integraciones" onClick={() => navigate("/settings")}><Settings size={18} /></IconBtn>
          <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 6px" }} />
          <UserMenu />
        </div>
      </header>

      {/* ─── Riel colapsable (col 1) ─── */}
      <aside
        className="og-rail"
        data-pinned={pinned ? "true" : "false"}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ gridColumn: 1, gridRow: 2, position: "relative" }}
      >
        <nav style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: expanded ? 236 : 66, zIndex: 40,
          background: "var(--surface)", borderRight: "1px solid var(--border)",
          display: "flex", flexDirection: "column", padding: "12px 10px", overflow: "hidden",
          transition: "width var(--t-mid), box-shadow var(--t-mid)",
          boxShadow: hover && !pinned ? "var(--shadow-3)" : "none",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {visibleNav.map((n) => {
              const isActive = active === n.key;
              const { Icon } = n;
              return (
                <button
                  key={n.key}
                  onClick={() => navigate(n.to)}
                  title={n.label}
                  className="og-navitem"
                  style={{
                    display: "flex", alignItems: "center", gap: 12, height: 42, padding: "0 11px",
                    borderRadius: "var(--r-2)", cursor: "pointer", border: "none", width: "100%",
                    background: isActive ? "var(--pri-soft)" : undefined,
                    color: isActive ? "var(--accent-pri)" : "var(--text-soft)",
                    transition: "background var(--t-fast)", position: "relative",
                  }}
                >
                  {isActive && <span style={{
                    position: "absolute", left: -10, top: 9, bottom: 9, width: 3,
                    borderRadius: 3, background: "var(--accent-pri)",
                  }} />}
                  <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} style={{ flex: "none" }} />
                  <span style={{
                    flex: 1, textAlign: "left",
                    font: `${isActive ? 600 : 500} 14px/1 var(--font-sans)`, ...fade(expanded),
                  }}>{n.label}</span>
                  {expanded && (n.mgr || n.adm) && (
                    <span style={{ font: "10px/1 var(--font-sans)", color: "var(--text-mute)" }}>
                      {n.adm ? "★★" : "★"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />

          {/* Tarjeta de upgrade (plan Free) */}
          {showUpgrade && (
            <div style={{
              ...fade(expanded), pointerEvents: expanded ? "auto" : "none",
              background: "linear-gradient(150deg, var(--pri-soft), var(--calc-soft))",
              border: "1px solid var(--border)", borderRadius: "var(--r-3)",
              padding: 13, marginBottom: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, font: "700 12.5px/1 var(--font-sans)", color: "var(--text)" }}>
                <Sparkles size={15} style={{ color: "var(--accent-pri)" }} /> Plan Free
              </div>
              <div style={{ font: "400 12px/1.4 var(--font-sans)", color: "var(--text-soft)", margin: "5px 0 10px" }}>
                Suscríbete a Pro para scripts, API y más límites.
              </div>
              <Btn variant="primary" size="sm" full onClick={() => navigate("/billing")}>Ver planes</Btn>
            </div>
          )}

          {/* Pie: adquirir · pin · cerrar sesión */}
          <button
            onClick={() => setShowAcquire(true)}
            title="Adquiere OpsGrid"
            className="og-navitem"
            style={{
              display: "flex", alignItems: "center", gap: 11, height: 38, padding: "0 11px",
              borderRadius: "var(--r-2)", border: "none", cursor: "pointer",
              background: undefined, color: "var(--text-soft)", marginBottom: 2,
            }}
          >
            <Briefcase size={18} style={{ flex: "none" }} />
            <span style={{ font: "500 13.5px/1 var(--font-sans)", ...fade(expanded) }}>Adquiere OpsGrid</span>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={togglePin}
              title={pinned ? "Soltar riel" : "Fijar riel"}
              className="og-iconbtn"
              style={{
                display: "grid", placeItems: "center", width: 40, height: 38, borderRadius: "var(--r-2)",
                border: "none", cursor: "pointer", flex: "none",
                background: pinned ? "var(--pri-soft)" : undefined,
                color: pinned ? "var(--accent-pri)" : "var(--text-mute)",
              }}
            ><Pin size={17} /></button>
            <button
              onClick={async () => { await logout(); navigate("/login"); }}
              title="Cerrar sesión"
              className="og-navitem"
              style={{
                display: "flex", alignItems: "center", gap: 11, flex: 1, height: 38, padding: "0 11px",
                borderRadius: "var(--r-2)", border: "none", cursor: "pointer",
                background: undefined, color: "var(--danger)",
              }}
            >
              <LogOut size={18} style={{ flex: "none" }} />
              <span style={{ font: "500 13.5px/1 var(--font-sans)", ...fade(expanded) }}>Cerrar sesión</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* ─── Main (lo provee la página, col 2) ─── */}
      {children}

      <AcquireModal open={showAcquire} onClose={() => setShowAcquire(false)} />
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, UserCheck, Layers, Shield, LayoutGrid, ChevronDown } from "lucide-react";
import { getWorkspaces } from "../api/workspaces";
import { useAuth } from "../auth/AuthContext";
import AdminUsers from "./AdminUsers";
import MembersManager from "../components/admin/MembersManager";
import WsTabGroups from "../components/admin/WsTabGroups";
import WsTabPermissions from "../components/admin/WsTabPermissions";
import AppShell from "../components/chrome/AppShell";
import { EmptyState } from "../components/ui";
import { Avatar } from "../components/ui/kit";

type Tab = "users" | "members" | "groups" | "accesos";

/**
 * Centro unificado de PERSONAS Y ACCESOS (role-aware). Una sola página con tabs:
 *  - Usuarios del sistema (solo admin global): roles globales, invitar, activar.
 *  - Miembros: agregar/quitar y rol de workspace.
 *  - Grupos: crear grupos y membresías.
 *  - Accesos: matriz editable dataset × grupo (otorgar/quitar acceso inline).
 * Reemplaza AdminUsers + AdminGroups + AdminPermissions + las tabs del hub.
 */
export default function AdminPeople({ initialTab }: { initialTab?: Tab } = {}) {
  const { isAdmin } = useAuth();

  const { data: allWorkspaces = [] } = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });
  const workspaces = isAdmin
    ? allWorkspaces
    : allWorkspaces.filter((w) => w.my_role === "owner" || w.my_role === "admin_ws");

  const canAccess = isAdmin || workspaces.length > 0;
  const [tab, setTab] = useState<Tab>(initialTab ?? (isAdmin ? "users" : "members"));
  const [wsId, setWsId] = useState("");

  // Preseleccionar el primer workspace para que las tabs no se vean vacías.
  const effectiveWsId = wsId || (workspaces[0]?.id ?? "");
  const selected = workspaces.find((w) => w.id === effectiveWsId);
  const canAssignOwner = isAdmin || selected?.my_role === "owner";

  type TabSpec = { key: Tab; label: string; icon: React.ReactNode };
  const tabs: TabSpec[] = [
    ...(isAdmin ? [{ key: "users" as const, label: "Usuarios del sistema", icon: <Users size={15} /> }] : []),
    { key: "members", label: "Miembros", icon: <UserCheck size={15} /> },
    { key: "groups",  label: "Grupos",   icon: <Layers size={15} /> },
    { key: "accesos", label: "Accesos a datasets", icon: <Shield size={15} /> },
  ];

  if (!canAccess) {
    return (
      <AppShell active="personas">
        <main className="home-main" style={{ overflowY: "auto", padding: 0 }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 32px 80px" }}>
            <EmptyState icon={<Users size={24} />} title="Sin acceso"
              subtitle="Necesitás ser owner o admin_ws de algún workspace (o admin global)." />
          </div>
        </main>
      </AppShell>
    );
  }

  const needsWs = tab === "members" || tab === "groups" || tab === "accesos";

  return (
    <AppShell active="personas">
      <main className="home-main" style={{ overflowY: "auto", padding: 0 }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 32px 80px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, font: "700 28px/1.1 var(--font-sans)", letterSpacing: "-.02em", color: "var(--text)", display: "flex", alignItems: "center", gap: 10 }}>
                <Users size={26} style={{ color: "var(--accent-pri)" }} /> Personas y accesos
              </h1>
              <p style={{ margin: "7px 0 0", font: "400 15px/1.4 var(--font-sans)", color: "var(--text-soft)", maxWidth: 540 }}>
                Gestiona quién entra al workspace, en qué grupo está, y exactamente qué puede hacer en cada dataset.
              </p>
            </div>

            {/* Selector de workspace */}
            {needsWs && workspaces.length > 1 && (
              <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                <span style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: "var(--r-2)",
                  border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", boxShadow: "var(--shadow-1)",
                }}>
                  <span style={{ font: "400 13px/1 var(--font-sans)", color: "var(--text-mute)" }}>Workspace</span>
                  <Avatar name={selected?.name ?? ""} size={22} square />
                  <span style={{ font: "600 14px/1 var(--font-sans)" }}>{selected?.name ?? "—"}</span>
                  <ChevronDown size={15} style={{ color: "var(--text-mute)" }} />
                </span>
                {/* select transparente encima para conservar el control nativo accesible */}
                <select
                  value={effectiveWsId}
                  onChange={(e) => setWsId(e.target.value)}
                  aria-label="Workspace"
                  style={{
                    position: "absolute", inset: 0, width: "100%", height: "100%",
                    opacity: 0, cursor: "pointer", border: "none", appearance: "none",
                  }}
                >
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginTop: 22, marginBottom: 22 }}>
            {tabs.map((t) => {
              const on = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  role="tab"
                  aria-selected={on}
                  style={{
                    font: `${on ? 600 : 500} 13.5px/1 var(--font-sans)`, padding: "11px 14px",
                    color: on ? "var(--text)" : "var(--text-soft)", background: "transparent", border: "none", cursor: "pointer",
                    borderBottom: on ? "2px solid var(--accent-pri)" : "2px solid transparent", marginBottom: -1,
                    display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                    transition: "color var(--t-fast)",
                  }}
                >
                  {t.icon} {t.label}
                </button>
              );
            })}
          </div>

          {tab === "users" && isAdmin && <AdminUsers embedded />}

          {needsWs && (
            selected ? (
              tab === "members" ? (
                <MembersManager workspaceId={selected.id} workspaceName={selected.name} canAssignOwner={canAssignOwner} />
              ) : tab === "groups" ? (
                <WsTabGroups workspaceId={selected.id} workspaceName={selected.name} />
              ) : (
                <WsTabPermissions workspaceId={selected.id} workspaceName={selected.name} editable />
              )
            ) : (
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "var(--r-3)", boxShadow: "var(--shadow-1)", padding: 24,
              }}>
                <EmptyState icon={<LayoutGrid size={22} />} title="Elegí un workspace"
                  subtitle="Seleccioná un workspace para gestionar sus miembros, grupos o accesos." />
              </div>
            )
          )}
        </div>
      </main>
    </AppShell>
  );
}

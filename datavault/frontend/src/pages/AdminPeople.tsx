import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, UserCheck, Layers, Shield, LayoutGrid } from "lucide-react";
import { getWorkspaces } from "../api/workspaces";
import { useAuth } from "../auth/AuthContext";
import AdminUsers from "./AdminUsers";
import MembersManager from "../components/admin/MembersManager";
import WsTabGroups from "../components/admin/WsTabGroups";
import WsTabPermissions from "../components/admin/WsTabPermissions";
import AppShell from "../components/chrome/AppShell";
import { Select, EmptyState } from "../components/ui";
import { IcUsers, IcGrid } from "../components/ui/icons";

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
    ...(isAdmin ? [{ key: "users" as const, label: "Usuarios del sistema", icon: <Users /> }] : []),
    { key: "members", label: "Miembros", icon: <UserCheck /> },
    { key: "groups",  label: "Grupos",   icon: <Layers /> },
    { key: "accesos", label: "Accesos a datasets", icon: <Shield /> },
  ];

  if (!canAccess) {
    return (
      <AppShell active="personas">
        <main className="page-main" style={{ width: "100%" }}>
          <EmptyState icon={<IcUsers size={24} />} title="Sin acceso"
            subtitle="Necesitás ser owner o admin_ws de algún workspace (o admin global)." />
        </main>
      </AppShell>
    );
  }

  const needsWs = tab === "members" || tab === "groups" || tab === "accesos";

  return (
    <AppShell active="personas">
      <main className="page-main" style={{ width: "100%" }}>
        <div className="page-header">
          <div>
            <h1>Personas y accesos</h1>
            <p>
              Gestiona quién entra al workspace, en qué grupo está, y exactamente
              qué puede hacer en cada dataset.
            </p>
          </div>
        </div>

        <div className="page-tabs-row">
          <div className="tabs" style={{ borderBottom: 0 }}>
            {tabs.map((t) => (
              <span
                key={t.key}
                className={`tab${tab === t.key ? " is-active" : ""}`}
                onClick={() => setTab(t.key)}
                role="tab"
                aria-selected={tab === t.key}
              >
                {t.icon} {t.label}
              </span>
            ))}
          </div>
        </div>

        {tab === "users" && isAdmin && <AdminUsers embedded />}

        {needsWs && (
          <>
            {workspaces.length > 1 && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  marginBottom: "var(--sp-4)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <IcGrid size={15} /> Workspace
                </span>
                <Select value={effectiveWsId} onChange={setWsId} aria-label="Workspace" style={{ maxWidth: 420 }}>
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
            )}

            {selected ? (
              tab === "members" ? (
                <MembersManager workspaceId={selected.id} workspaceName={selected.name} canAssignOwner={canAssignOwner} />
              ) : tab === "groups" ? (
                <WsTabGroups workspaceId={selected.id} workspaceName={selected.name} />
              ) : (
                <WsTabPermissions workspaceId={selected.id} workspaceName={selected.name} editable />
              )
            ) : (
              <div className="matrix-wrap" style={{ padding: 24 }}>
                <EmptyState icon={<LayoutGrid size={22} />} title="Elegí un workspace"
                  subtitle="Seleccioná un workspace para gestionar sus miembros, grupos o accesos." />
              </div>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}

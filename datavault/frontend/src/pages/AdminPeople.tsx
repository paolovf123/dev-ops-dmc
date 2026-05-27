import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getWorkspaces } from "../api/workspaces";
import { useAuth } from "../auth/AuthContext";
import UserMenu from "../components/UserMenu";
import AdminUsers from "./AdminUsers";
import MembersManager from "../components/admin/MembersManager";
import WsTabGroups from "../components/admin/WsTabGroups";
import WsTabPermissions from "../components/admin/WsTabPermissions";
import { PageHeader, Tabs, Toolbar, Select, EmptyState, type TabDef } from "../components/ui";
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
  const navigate = useNavigate();
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

  const tabs: TabDef<Tab>[] = [
    ...(isAdmin ? [{ key: "users" as const, label: "Usuarios del sistema", icon: <span style={{ fontSize: 15 }}>🌐</span> }] : []),
    { key: "members", label: "Miembros", icon: <span style={{ fontSize: 15 }}>👥</span> },
    { key: "groups",  label: "Grupos",   icon: <span style={{ fontSize: 15 }}>🔗</span> },
    { key: "accesos", label: "Accesos",  icon: <span style={{ fontSize: 15 }}>🔑</span> },
  ];

  if (!canAccess) {
    return (
      <>
        <Header navigate={navigate} isAdmin={isAdmin} />
        <div className="dk-page">
          <EmptyState icon={<IcUsers size={24} />} title="Sin acceso"
            subtitle="Necesitás ser owner o admin_ws de algún workspace (o admin global)." />
        </div>
      </>
    );
  }

  const needsWs = tab === "members" || tab === "groups" || tab === "accesos";

  return (
    <>
      <Header navigate={navigate} isAdmin={isAdmin} />
      <div className="dk-page">
        <PageHeader
          icon={<span style={{ fontSize: 20, lineHeight: 1 }}>👥</span>}
          title="Personas y accesos"
          subtitle="Usuarios, roles, miembros, grupos y permisos sobre datasets — todo en un solo lugar."
        />

        <Tabs<Tab> active={tab} onChange={setTab} tabs={tabs} />

        {tab === "users" && isAdmin && <AdminUsers embedded />}

        {needsWs && (
          <>
            <Toolbar style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <IcGrid size={15} /> Workspace
              </span>
              <Select value={effectiveWsId} onChange={setWsId} aria-label="Workspace" style={{ flex: 1, maxWidth: 420 }}>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Toolbar>

            {selected ? (
              tab === "members" ? (
                <MembersManager workspaceId={selected.id} workspaceName={selected.name} canAssignOwner={canAssignOwner} />
              ) : tab === "groups" ? (
                <WsTabGroups workspaceId={selected.id} workspaceName={selected.name} />
              ) : (
                <WsTabPermissions workspaceId={selected.id} workspaceName={selected.name} editable />
              )
            ) : (
              <div className="dk-card">
                <EmptyState icon={<IcGrid size={22} />} title="Elegí un workspace"
                  subtitle="Seleccioná un workspace para gestionar sus miembros, grupos o accesos." />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Header({ navigate, isAdmin }: { navigate: (p: string) => void; isAdmin: boolean }) {
  return (
    <header className="app-header">
      <button className="app-brand-btn" onClick={() => navigate("/")}>
        <div className="app-header-logo app-header-logo--img"><img src="/opsgrid-logo.svg" alt="OpsGrid" /></div>
        <span className="app-header-name">Ops<em>Grid</em></span>
      </button>
      <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
      <span style={{ fontWeight: 600, fontSize: 15 }}>Personas y accesos</span>
      <div className="app-header-spacer" />
      <nav style={{ display: "flex", gap: 4 }}>
        <button className="btn btn-ghost" style={{ fontSize: 13, gap: 6 }} onClick={() => navigate("/admin/workspaces")}>
          <IcGrid size={15} /> Workspaces
        </button>
        {isAdmin && (
          <button className="btn btn-ghost" style={{ fontSize: 13, gap: 6 }} onClick={() => navigate("/admin/audit")}>
            📋 Auditoría
          </button>
        )}
      </nav>
      <UserMenu />
    </header>
  );
}

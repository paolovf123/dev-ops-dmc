import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace } from "../api/workspaces";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import UserMenu from "../components/UserMenu";
import WsTabDatasets from "../components/admin/WsTabDatasets";
import WsTabConfig from "../components/admin/WsTabConfig";
import { Tabs, EmptyState } from "../components/ui";
import { IcUsers, IcBuilding, IcExternalLink } from "../components/ui/icons";
import type { Workspace } from "../workspace/WorkspaceContext";

// Hub de WORKSPACES: crear/configurar equipos y ver sus datasets.
// La gestión de personas vive en /admin/personas y la de accesos en /admin/accesos.
type WsTab = "datasets" | "config";

const WS_COLORS = [
  ["#6366F1", "#818CF8"], ["#8B5CF6", "#A78BFA"], ["#EC4899", "#F472B6"],
  ["#F59E0B", "#FCD34D"], ["#10B981", "#34D399"], ["#0EA5E9", "#38BDF8"],
  ["#EF4444", "#F87171"], ["#14B8A6", "#2DD4BF"],
];

function wsColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % WS_COLORS.length;
  return WS_COLORS[h];
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const [from, to] = wsColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: `linear-gradient(135deg, ${from}, ${to})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 700, fontSize: size * 0.42, flexShrink: 0, letterSpacing: -0.5,
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function AdminWorkspaces() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const { isAdmin } = useAuth();

  const [selected, setSelected] = useState<Workspace | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [currentTab, setCurrentTab] = useState<WsTab>("datasets");
  const [newIsSandbox, setNewIsSandbox] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["admin-workspaces"],
    queryFn: getWorkspaces,
  });

  // Preseleccionar el primer workspace al cargar para que el panel no quede vacío.
  useEffect(() => {
    if (!selected && workspaces.length > 0) setSelected(workspaces[0]);
  }, [workspaces, selected]);

  const createMut = useMutation({
    mutationFn: () => createWorkspace({ name: newName.trim(), description: newDesc.trim() || null, is_sandbox: newIsSandbox }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-workspaces"] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      toast(newIsSandbox ? "Workspace demo creado con plantillas de ejemplo" : "Workspace creado", "success");
      setShowCreate(false); setNewName(""); setNewDesc(""); setNewIsSandbox(false);
    },
    onError: () => toast("Error al crear workspace", "error"),
  });

  const updateMut = useMutation({
    mutationFn: (id: string) => updateWorkspace(id, { name: editName.trim(), description: editDesc.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-workspaces"] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      toast("Workspace actualizado", "success");
      setEditingId(null);
    },
    onError: () => toast("Error al actualizar", "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteWorkspace(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-workspaces"] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      toast("Workspace eliminado", "success");
      if (selected) setSelected(null);
    },
    onError: () => toast("Error al eliminar workspace", "error"),
  });

  const handleDelete = async (ws: Workspace) => {
    const ok = await confirm({
      title: `Eliminar "${ws.name}"`,
      message: "Se eliminarán el workspace y todos sus datasets permanentemente. Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar workspace",
      variant: "danger",
    });
    if (ok) deleteMut.mutate(ws.id);
  };

  return (
    <>
      <header className="app-header">
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo app-header-logo--img"><img src="/opsgrid-logo.svg" alt="OpsGrid" /></div>
          <span className="app-header-name">Ops<em>Grid</em></span>
        </button>
        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Workspaces</span>
        <div className="app-header-spacer" />
        <nav style={{ display: "flex", gap: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 13, gap: 6 }} onClick={() => navigate("/admin/personas")}
            title="Usuarios, miembros, grupos y accesos">
            <IcUsers size={15} /> Personas y accesos
          </button>
        </nav>
        <UserMenu />
      </header>

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 24px 48px", display: "flex", gap: 24, alignItems: "flex-start" }}>

        {/* ── Sidebar: lista + crear/editar workspaces ── */}
        <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: -0.3 }}>Workspaces</h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                {workspaces.length} equipo{workspaces.length !== 1 ? "s" : ""}
              </p>
            </div>
            {isAdmin && (
              <button className="btn btn-primary"
                style={{ fontSize: 12, padding: "6px 12px", gap: 5, display: "flex", alignItems: "center" }}
                onClick={() => { setShowCreate(true); setEditingId(null); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                Nuevo
              </button>
            )}
          </div>

          {/* Crear */}
          {showCreate && (
            <div style={{
              background: "var(--color-surface)", border: "1.5px solid var(--color-primary)",
              borderRadius: 12, padding: 16, boxShadow: "var(--shadow-md)",
            }}>
              <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 13, color: "var(--color-primary)" }}>Nuevo workspace</p>
              <input autoFocus placeholder="Nombre del equipo *" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newName.trim() && createMut.mutate()}
                style={inputStyle} />
              <input placeholder="Descripción (opcional)" value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)} style={{ ...inputStyle, marginTop: 8 }} />
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" checked={newIsSandbox} onChange={(e) => setNewIsSandbox(e.target.checked)} style={{ marginTop: 2 }} />
                <span>
                  <strong>Workspace demo / sandbox</strong>
                  <span style={{ display: "block", color: "var(--color-text-muted)", marginTop: 2 }}>
                    Pre-pobla con las 4 plantillas (Inventario, CRM, Tickets, Tareas) y filas de ejemplo
                  </span>
                </span>
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" style={{ fontSize: 12, flex: 1 }}
                  disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
                  {createMut.isPending ? "Creando…" : "Crear workspace"}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowCreate(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Lista */}
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ height: 64, borderRadius: 12, background: "var(--color-surface)", border: "1px solid var(--color-border)", opacity: 0.5 }} />
              ))}
            </div>
          ) : workspaces.length === 0 ? (
            <EmptyState icon={<IcBuilding size={22} />} title="No hay workspaces aún"
              subtitle={isAdmin ? "Creá el primer equipo con el botón Nuevo." : "Aún no perteneces a ningún workspace."} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {workspaces.map((ws) => {
                const isActive = selected?.id === ws.id;
                const [from] = wsColor(ws.name);
                return (
                  <div key={ws.id}
                    onClick={() => { setSelected(ws); setEditingId(null); setCurrentTab("datasets"); }}
                    style={{
                      background: "var(--color-surface)",
                      border: `1.5px solid ${isActive ? from : "var(--color-border)"}`,
                      borderRadius: 12, padding: "11px 12px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 10,
                      boxShadow: isActive ? `0 0 0 3px ${from}22, 0 2px 8px ${from}14` : "none",
                      transition: "all 0.15s",
                    }}>
                    <Avatar name={ws.name} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingId === ws.id ? (
                        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...inputStyle, fontSize: 12, padding: "4px 7px" }} />
                          <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Descripción" style={{ ...inputStyle, fontSize: 11, padding: "3px 7px" }} />
                          <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
                            <button className="btn btn-primary" style={{ fontSize: 11, padding: "3px 8px" }} disabled={updateMut.isPending} onClick={() => updateMut.mutate(ws.id)}>Guardar</button>
                            <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setEditingId(null)}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ws.name}</p>
                          {ws.description && (
                            <p style={{ margin: "1px 0 0", fontSize: 11, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ws.description}</p>
                          )}
                        </>
                      )}
                    </div>
                    {editingId !== ws.id && isAdmin && (
                      <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        <button title="Editar" style={iconBtnStyle}
                          onClick={() => { setEditingId(ws.id); setEditName(ws.name); setEditDesc(ws.description ?? ""); setSelected(ws); }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button title="Eliminar" onClick={() => handleDelete(ws)} style={{ ...iconBtnStyle, color: "#EF4444" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Panel derecho: datasets + config del workspace ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selected ? (
            <div className="dk-card" style={{ marginTop: 4 }}>
              <EmptyState icon={<IcBuilding size={24} />} title="Seleccioná un workspace"
                subtitle="Elegí un equipo de la lista para ver sus datasets y su configuración. Para personas y accesos, usá Personas / Accesos." />
            </div>
          ) : (
            <>
              <div style={{
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 16, padding: "20px 24px", marginBottom: 20,
                display: "flex", alignItems: "center", gap: 16,
              }}>
                <Avatar name={selected.name} size={52} />
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.4 }}>{selected.name}</h2>
                  {selected.description && (
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>{selected.description}</p>
                  )}
                </div>
                <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5, display: "flex", alignItems: "center" }}
                  onClick={() => navigate(`/ws/${selected.id}`)}>
                  <IcExternalLink size={13} /> Abrir
                </button>
              </div>

              <Tabs<WsTab>
                active={currentTab}
                onChange={setCurrentTab}
                tabs={[
                  { key: "datasets", label: "Datasets",      icon: <span style={{ fontSize: 15 }}>📊</span> },
                  { key: "config",   label: "Configuración", icon: <span style={{ fontSize: 15 }}>⚙️</span> },
                ]}
              />

              {currentTab === "datasets" && (
                <WsTabDatasets workspaceId={selected.id} workspaceName={selected.name} />
              )}
              {currentTab === "config" && (
                <WsTabConfig
                  workspace={{ id: selected.id, name: selected.name, description: selected.description ?? null }}
                  isAdminGlobal={isAdmin}
                  onUpdated={() => { /* la query de workspaces se invalida desde el sub-componente */ }}
                  onDeleted={() => setSelected(null)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 11px", borderRadius: 8,
  border: "1px solid var(--color-border)", background: "var(--color-bg)",
  color: "var(--color-text)", fontSize: 13, boxSizing: "border-box", outline: "none",
};

const iconBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: "5px 5px",
  borderRadius: 6, color: "var(--color-text-muted)", display: "flex",
  alignItems: "center", transition: "all 0.12s",
};

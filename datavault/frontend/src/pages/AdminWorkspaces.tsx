import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace } from "../api/workspaces";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import WsTabDatasets from "../components/admin/WsTabDatasets";
import WsTabConfig from "../components/admin/WsTabConfig";
import AppShell from "../components/chrome/AppShell";
import { Avatar, Btn } from "../components/ui/kit";
import {
  LayoutGrid, Users, ExternalLink, Plus, Pencil, Trash2, Table2, Settings2,
} from "lucide-react";
import type { Workspace } from "../workspace/WorkspaceContext";

// Hub de WORKSPACES: crear/configurar equipos y ver sus datasets.
// La gestión de personas vive en /admin/personas y la de accesos en /admin/accesos.
type WsTab = "datasets" | "config";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 11px", borderRadius: "var(--r-2)",
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", font: "400 13px/1.3 var(--font-sans)", boxSizing: "border-box", outline: "none",
};

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

  const tabs: [WsTab, string, React.ReactNode][] = [
    ["datasets", "Datasets", <Table2 size={15} />],
    ["config", "Configuración", <Settings2 size={15} />],
  ];

  return (
    <AppShell active="workspaces">
      <main className="home-main" style={{ overflowY: "auto", padding: 0 }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 32px 80px" }}>

          {/* ── Cabecera ── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 22 }}>
            <div>
              <h1 style={{ margin: 0, font: "700 28px/1.1 var(--font-sans)", letterSpacing: "-.02em", display: "flex", alignItems: "center", gap: 10, color: "var(--text)" }}>
                <LayoutGrid size={25} style={{ color: "var(--accent-pri)" }} /> Workspaces
              </h1>
              <p style={{ margin: "7px 0 0", font: "400 15px/1.4 var(--font-sans)", color: "var(--text-soft)" }}>
                Crea y configura los equipos y sus datasets.
              </p>
            </div>
            <Btn variant="ghost" icon={<Users size={16} />} onClick={() => navigate("/admin/personas")}
              title="Usuarios, miembros, grupos y accesos">
              Personas y accesos
            </Btn>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 18, alignItems: "start" }}>

            {/* ── Sidebar: lista + crear/editar workspaces ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Crear */}
              {showCreate && (
                <div className="og-rise" style={{
                  background: "var(--surface)", border: "1.5px solid var(--accent-pri)",
                  borderRadius: "var(--r-3)", padding: 16, boxShadow: "var(--shadow-2)",
                }}>
                  <p style={{ margin: "0 0 12px", font: "600 13px/1 var(--font-sans)", color: "var(--accent-pri)" }}>Nuevo workspace</p>
                  <input autoFocus placeholder="Nombre del equipo *" value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && newName.trim() && createMut.mutate()}
                    style={inputStyle} />
                  <input placeholder="Descripción (opcional)" value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)} style={{ ...inputStyle, marginTop: 8 }} />
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, cursor: "pointer", font: "400 12px/1.4 var(--font-sans)", color: "var(--text)" }}>
                    <input type="checkbox" checked={newIsSandbox} onChange={(e) => setNewIsSandbox(e.target.checked)} style={{ marginTop: 2, accentColor: "var(--accent-pri)" }} />
                    <span>
                      <strong>Workspace demo / sandbox</strong>
                      <span style={{ display: "block", color: "var(--text-mute)", marginTop: 2 }}>
                        Pre-pobla con las 4 plantillas (Inventario, CRM, Tickets, Tareas) y filas de ejemplo
                      </span>
                    </span>
                  </label>
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <Btn variant="primary" size="sm" full
                      disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
                      {createMut.isPending ? "Creando…" : "Crear workspace"}
                    </Btn>
                    <Btn variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancelar</Btn>
                  </div>
                </div>
              )}

              {/* Lista */}
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "var(--r-3)", boxShadow: "var(--shadow-1)", overflow: "hidden",
              }}>
                {isLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="og-shimmer" style={{ height: 52, borderRadius: "var(--r-2)" }} />
                    ))}
                  </div>
                ) : workspaces.length === 0 ? (
                  <div style={{ padding: "32px 20px", textAlign: "center" }}>
                    <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, margin: "0 auto 12px", borderRadius: "var(--r-3)", background: "var(--pri-soft)", color: "var(--accent-pri)" }}>
                      <LayoutGrid size={22} />
                    </span>
                    <p style={{ margin: 0, font: "600 13.5px/1 var(--font-sans)", color: "var(--text)" }}>No hay workspaces aún</p>
                    <p style={{ margin: "6px 0 0", font: "400 12px/1.4 var(--font-sans)", color: "var(--text-mute)" }}>
                      {isAdmin ? "Creá el primer equipo con el botón Nuevo." : "Aún no perteneces a ningún workspace."}
                    </p>
                  </div>
                ) : (
                  <>
                    {workspaces.map((ws, i) => {
                      const isActive = selected?.id === ws.id;
                      const isEditing = editingId === ws.id;
                      return (
                        <div key={ws.id} className="og-gridrow"
                          onClick={() => { if (!isEditing) { setSelected(ws); setEditingId(null); setCurrentTab("datasets"); } }}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, width: "100%",
                            padding: "11px 13px", cursor: isEditing ? "default" : "pointer", textAlign: "left",
                            borderBottom: i < workspaces.length - 1 ? "1px solid var(--border)" : "none",
                            background: isActive ? "var(--pri-soft)" : undefined,
                            borderLeft: isActive ? "3px solid var(--accent-pri)" : "3px solid transparent",
                            transition: "background var(--t-fast)",
                          }}>
                          <Avatar name={ws.name} size={32} square />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {isEditing ? (
                              <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...inputStyle, font: "400 12px/1.3 var(--font-sans)", padding: "5px 8px" }} />
                                <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Descripción" style={{ ...inputStyle, font: "400 11px/1.3 var(--font-sans)", padding: "4px 8px" }} />
                                <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
                                  <Btn variant="primary" size="sm" disabled={updateMut.isPending} onClick={() => updateMut.mutate(ws.id)} style={{ padding: "4px 9px", fontSize: 11 }}>Guardar</Btn>
                                  <Btn variant="ghost" size="sm" onClick={() => setEditingId(null)} style={{ padding: "4px 9px", fontSize: 11 }}>Cancelar</Btn>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span style={{ display: "block", font: "600 13.5px/1.2 var(--font-sans)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ws.name}</span>
                                <span style={{ display: "block", font: "400 11.5px/1.3 var(--font-sans)", color: "var(--text-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {ws.description || "—"}
                                </span>
                              </>
                            )}
                          </div>
                          {!isEditing && isAdmin && (
                            <div className="og-rowact" style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                              <button title="Editar" className="og-iconbtn"
                                onClick={() => { setEditingId(ws.id); setEditName(ws.name); setEditDesc(ws.description ?? ""); setSelected(ws); }}
                                style={{ width: 28, height: 28, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-mute)" }}>
                                <Pencil size={14} />
                              </button>
                              <button title="Eliminar" className="og-iconbtn" onClick={() => handleDelete(ws)}
                                style={{ width: 28, height: 28, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--danger)" }}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {isAdmin && (
                      <button onClick={() => { setShowCreate(true); setEditingId(null); }}
                        className="og-navitem"
                        style={{
                          display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "12px 14px",
                          border: "none", borderTop: "1px solid var(--border)", background: "transparent",
                          cursor: "pointer", color: "var(--accent-pri)", font: "600 13.5px/1 var(--font-sans)",
                        }}>
                        <Plus size={16} /> Nuevo workspace
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── Panel derecho: datasets + config del workspace ── */}
            <div style={{ minWidth: 0 }}>
              {!selected ? (
                <div style={{
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
                  padding: "48px 32px", textAlign: "center", boxShadow: "var(--shadow-1)",
                }}>
                  <span style={{ display: "grid", placeItems: "center", width: 52, height: 52, margin: "0 auto 14px", borderRadius: "var(--r-3)", background: "var(--pri-soft)", color: "var(--accent-pri)" }}>
                    <LayoutGrid size={26} />
                  </span>
                  <p style={{ margin: 0, font: "600 16px/1 var(--font-sans)", color: "var(--text)" }}>Seleccioná un workspace</p>
                  <p style={{ margin: "8px auto 0", maxWidth: 380, font: "400 13px/1.5 var(--font-sans)", color: "var(--text-mute)" }}>
                    Elegí un equipo de la lista para ver sus datasets y su configuración. Para personas y accesos, usá Personas / Accesos.
                  </p>
                </div>
              ) : (
                <>
                  {/* Encabezado del workspace seleccionado */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                    <Avatar name={selected.name} size={46} square />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "700 20px/1.2 var(--font-sans)", letterSpacing: "-.01em", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.name}</div>
                      {selected.description && (
                        <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.description}</div>
                      )}
                    </div>
                    <Btn variant="soft" size="sm" icon={<ExternalLink size={15} />} onClick={() => navigate(`/ws/${selected.id}`)}>Abrir</Btn>
                  </div>

                  {/* Tabs Datasets / Configuración */}
                  <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: 18 }}>
                    {tabs.map(([k, label, icon]) => {
                      const on = currentTab === k;
                      return (
                        <button key={k} onClick={() => setCurrentTab(k)} style={{
                          display: "inline-flex", alignItems: "center", gap: 7,
                          font: `${on ? 600 : 500} 13.5px/1 var(--font-sans)`, padding: "10px 14px",
                          border: "none", background: "transparent", cursor: "pointer",
                          color: on ? "var(--text)" : "var(--text-soft)",
                          borderBottom: on ? "2px solid var(--accent-pri)" : "2px solid transparent",
                          marginBottom: -1,
                        }}>{icon}{label}</button>
                      );
                    })}
                  </div>

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
        </div>
      </main>
    </AppShell>
  );
}

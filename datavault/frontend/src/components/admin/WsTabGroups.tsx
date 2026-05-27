import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getGroups, createGroup, deleteGroup, getGroupMembers } from "../../api/groups";
import { useToast } from "../Toast";
import { useConfirm } from "../ConfirmDialog";
import DatasetAccessModal from "../DatasetAccessModal";
import { EmptyState } from "../ui";
import { IcUsers, IcLock, IcPlus, IcTrash } from "../ui/icons";

interface Props {
  workspaceId: string;
  workspaceName: string;
}

const GROUP_COLORS = [
  "#6366F1", "#8B5CF6", "#EC4899", "#F59E0B",
  "#10B981", "#0EA5E9", "#EF4444", "#14B8A6", "#7C3AED",
];
function groupColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % GROUP_COLORS.length;
  return GROUP_COLORS[h];
}

export default function WsTabGroups({ workspaceId, workspaceName }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [accessFor, setAccessFor] = useState<{ id: string; name: string } | null>(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["groups", workspaceId],
    queryFn: () => getGroups(workspaceId),
  });

  // Members count por grupo (parallel queries)
  const memberCountQueries = useQuery({
    queryKey: ["group-member-counts", workspaceId, groups.map((g) => g.id).join(",")],
    queryFn: async () => {
      const result: Record<string, number> = {};
      await Promise.all(
        groups.map(async (g) => {
          const members = await getGroupMembers(g.id);
          result[g.id] = members.length;
        }),
      );
      return result;
    },
    enabled: groups.length > 0,
  });

  const createMut = useMutation({
    mutationFn: () => createGroup({ name: newName.trim(), description: newDesc.trim() || null, workspace_id: workspaceId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      toast("Grupo creado", "success");
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
    },
    onError: (e: Error) => toast(e.message ?? "Error al crear grupo", "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      toast("Grupo eliminado", "success");
    },
    onError: (e: Error) => toast(e.message ?? "Error", "error"),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toolbar */}
      <div className="dk-card dk-card-pad" style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
            Grupos de {workspaceName}
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "var(--color-text-muted)" }}>
              ({groups.length})
            </span>
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
            Los grupos agrupan miembros del workspace y se les asigna acceso a datasets.
          </p>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: "6px 13px", gap: 5 }}
          onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancelar" : <><IcPlus size={13} /> Nuevo grupo</>}
        </button>
      </div>

      {/* Form crear */}
      {showCreate && (
        <div style={{
          background: "var(--color-primary-bg)", border: "1.5px solid var(--color-primary)",
          borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8,
        }}>
          <input
            autoFocus
            placeholder="Nombre del grupo *"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ fontSize: 13, padding: "7px 11px", border: "1px solid var(--color-border)", borderRadius: 6 }}
          />
          <input
            placeholder="Descripción (opcional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            style={{ fontSize: 13, padding: "7px 11px", border: "1px solid var(--color-border)", borderRadius: 6 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ fontSize: 12 }}
              disabled={!newName.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}>
              {createMut.isPending ? "Creando…" : "Crear grupo"}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }}
              onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de grupos */}
      {isLoading ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>
          Cargando grupos…
        </div>
      ) : groups.length === 0 ? (
        <div className="dk-card">
          <EmptyState icon={<IcUsers size={22} />} title="Sin grupos en este workspace"
            subtitle="Creá uno arriba para empezar a organizar accesos por equipo." />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {groups.map((g) => {
            const color = groupColor(g.name);
            const memberCount = memberCountQueries.data?.[g.id] ?? null;
            return (
              <div key={g.id} style={{
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 12, padding: "14px 16px",
                display: "flex", flexDirection: "column", gap: 10,
                transition: "border-color 0.12s, box-shadow 0.12s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 2px 8px ${color}20`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "none"; }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: color + "20", color, display: "flex",
                    alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14,
                  }}>{g.name.slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.name}
                    </p>
                    <p style={{ margin: "1px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>
                      {memberCount === null ? "…" : `${memberCount} miembro${memberCount !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                </div>
                {g.description && (
                  <p style={{
                    margin: 0, fontSize: 12, color: "var(--color-text-secondary)",
                    overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                    WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>
                    {g.description}
                  </p>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                  <button className="dk-row-action" style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => setAccessFor({ id: g.id, name: g.name })}>
                    <IcLock /> Acceso a datasets
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Eliminar grupo",
                        message: `¿Eliminar el grupo "${g.name}"? Se quitarán todos sus permisos.`,
                        variant: "danger",
                      });
                      if (ok) deleteMut.mutate(g.id);
                    }}
                    title="Eliminar grupo"
                    className="dk-row-action"
                    style={{ color: "#DC2626", padding: "5px 9px" }}>
                    <IcTrash />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {accessFor && (
        <DatasetAccessModal
          open={!!accessFor}
          onClose={() => setAccessFor(null)}
          subject={{ kind: "group", id: accessFor.id, name: accessFor.name }}
          workspaceId={workspaceId}
        />
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateWorkspace, deleteWorkspace } from "../../api/workspaces";
import { useToast } from "../Toast";
import { useConfirm } from "../ConfirmDialog";
import { IcTrash } from "../ui/icons";

interface Props {
  workspace: { id: string; name: string; description: string | null };
  isAdminGlobal: boolean;
  onUpdated: () => void;
  onDeleted: () => void;
}

export default function WsTabConfig({ workspace, isAdminGlobal, onUpdated, onDeleted }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description ?? "");

  useEffect(() => {
    setName(workspace.name);
    setDescription(workspace.description ?? "");
  }, [workspace.id]);

  const updateMut = useMutation({
    mutationFn: () => updateWorkspace(workspace.id, { name: name.trim(), description: description.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      toast("Workspace actualizado", "success");
      onUpdated();
    },
    onError: (e: Error) => toast(e.message ?? "Error al actualizar", "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteWorkspace(workspace.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      toast("Workspace eliminado", "success");
      onDeleted();
      navigate("/admin/workspaces");
    },
    onError: (e: Error) => toast(e.message ?? "Error", "error"),
  });

  const noChanges = name.trim() === workspace.name && description.trim() === (workspace.description ?? "").trim();
  const disabled = !name.trim() || noChanges;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      {/* Editar nombre y descripción */}
      <div className="dk-card" style={{ padding: "18px 20px" }}>
        <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>Información general</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Nombre del workspace
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: "100%", fontSize: 14, padding: "8px 12px", marginTop: 4,
                border: "1px solid var(--color-border)", borderRadius: 6,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Para qué se usa este workspace…"
              style={{
                width: "100%", fontSize: 13, padding: "8px 12px", marginTop: 4,
                border: "1px solid var(--color-border)", borderRadius: 6, resize: "vertical", minHeight: 70,
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary"
              disabled={disabled || updateMut.isPending}
              onClick={() => updateMut.mutate()}
              style={{ fontSize: 13 }}>
              {updateMut.isPending ? "Guardando…" : "Guardar cambios"}
            </button>
            {!noChanges && (
              <button className="btn btn-ghost" style={{ fontSize: 12 }}
                onClick={() => { setName(workspace.name); setDescription(workspace.description ?? ""); }}>
                Descartar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Zona peligrosa: eliminar workspace (solo admin global) */}
      {isAdminGlobal && (
        <div style={{
          background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 12,
          padding: "18px 20px",
        }}>
          <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 14, color: "#991B1B" }}>Zona peligrosa</p>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#7F1D1D" }}>
            Eliminar este workspace borrará <strong>todos sus datasets, registros, grupos y permisos</strong>.
            Esta acción no se puede deshacer.
          </p>
          <button
            disabled={deleteMut.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: "Eliminar workspace",
                message: `¿Eliminar el workspace "${workspace.name}" y todos sus datos? Esta acción es IRREVERSIBLE.`,
                confirmLabel: "Eliminar workspace",
                variant: "danger",
              });
              if (ok) deleteMut.mutate();
            }}
            style={{
              fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 6,
              background: "#DC2626", color: "#fff", border: "none", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
            <IcTrash size={14} /> Eliminar workspace
          </button>
        </div>
      )}
    </div>
  );
}

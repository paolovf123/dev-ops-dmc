import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateDataset } from "../api/datasets";
import { useToast } from "./Toast";

interface Props {
  open: boolean;
  onClose: () => void;
  dataset: { id: string; name: string; description?: string | null } | null;
}

export default function EditDatasetModal({ open, onClose, dataset }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open && dataset) {
      setName(dataset.name);
      setDescription(dataset.description ?? "");
    }
  }, [open, dataset]);

  const mut = useMutation({
    mutationFn: () => {
      if (!dataset) throw new Error("no dataset");
      return updateDataset(dataset.id, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasets"] });
      qc.invalidateQueries({ queryKey: ["dataset", dataset?.id] });
      toast("Dataset actualizado", "success");
      onClose();
    },
    onError: (e: Error) => toast(e.message ?? "Error al actualizar", "error"),
  });

  if (!open || !dataset) return null;

  const trimmed = name.trim();
  const disabled = !trimmed || (trimmed === dataset.name && description.trim() === (dataset.description ?? "").trim());

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "var(--color-surface)", borderRadius: 14, padding: "24px 28px",
        width: "min(520px, 95vw)", display: "flex", flexDirection: "column", gap: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 22 }}>✏️</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Editar dataset</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
              Cambia el nombre o la descripción
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}
            style={{ marginLeft: "auto", padding: "4px 8px", fontSize: 18 }}>×</button>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Nombre</label>
          <input value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !disabled && !mut.isPending) mut.mutate(); }}
            placeholder="Nombre del dataset"
            style={{ fontSize: 14 }} />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Descripción</label>
          <textarea value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opcional"
            rows={3}
            style={{ fontSize: 13, resize: "vertical", minHeight: 70 }} />
        </div>

        {mut.isError && (
          <p style={{ margin: 0, color: "var(--pm-red-500)", fontSize: 13 }}>
            ⚠ {(mut.error as Error)?.message ?? "Error al actualizar"}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end",
          paddingTop: 12, borderTop: "1px solid var(--color-border-light)" }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={disabled || mut.isPending}
            onClick={() => mut.mutate()}>
            {mut.isPending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

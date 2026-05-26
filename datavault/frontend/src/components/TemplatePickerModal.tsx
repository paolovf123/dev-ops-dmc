import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listDatasetTemplates, createDatasetFromTemplate } from "../api/datasets";
import type { DatasetTemplate } from "../api/datasets";
import { useToast } from "./Toast";
import { useEscapeKey } from "../utils/useEscapeKey";

interface Props {
  open: boolean;
  onClose: () => void;
  workspaceId?: string;
  onCreated?: (datasetId: string) => void;
}

export default function TemplatePickerModal({ open, onClose, workspaceId, onCreated }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [selected, setSelected] = useState<DatasetTemplate | null>(null);
  const [customName, setCustomName] = useState("");
  const [includeSample, setIncludeSample] = useState(true);
  useEscapeKey(onClose, open);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates-catalog"],
    queryFn: listDatasetTemplates,
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("no template");
      return createDatasetFromTemplate(selected.id, {
        workspace_id: workspaceId,
        name: customName.trim() || undefined,
        include_sample: includeSample,
      });
    },
    onSuccess: (data) => {
      toast(`Plantilla '${selected?.name}' creada`, "success");
      onClose();
      setSelected(null);
      setCustomName("");
      if (onCreated) onCreated(data.id);
      else navigate(`/datasets/${data.id}`);
    },
    onError: (e: Error) => toast(e.message ?? "Error al crear", "error"),
  });

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "var(--color-surface)", borderRadius: 14, padding: "24px 28px",
        width: "min(820px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 22 }}>🧩</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Plantillas</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
              Comienza con un dataset pre-armado y datos de ejemplo
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}
            style={{ marginLeft: "auto", padding: "4px 8px", fontSize: 18 }}>×</button>
        </div>

        {isLoading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>
            Cargando plantillas…
          </div>
        ) : !selected ? (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12, overflowY: "auto", padding: 4,
          }}>
            {templates.map((t) => (
              <button key={t.id}
                onClick={() => { setSelected(t); setCustomName(t.name); }}
                style={{
                  textAlign: "left", padding: 14, borderRadius: 10,
                  border: "1.5px solid var(--color-border)", background: "var(--color-surface)",
                  cursor: "pointer", display: "flex", flexDirection: "column", gap: 6,
                  transition: "all 0.14s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.background = t.color + "0a"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-surface)"; }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: t.color + "20", color: t.color,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                  }}>{t.icon}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                      {t.columns_count} columnas · {t.sample_rows_count} ejemplos
                    </div>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{t.description}</p>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12,
              background: selected.color + "0a", border: `1.5px solid ${selected.color}40`, borderRadius: 10 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 8,
                background: selected.color + "20", color: selected.color,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
              }}>{selected.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{selected.description}</div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 12 }}
                onClick={() => setSelected(null)}>← Otras</button>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre del dataset</label>
              <input value={customName} autoFocus
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && customName.trim() && !createMut.isPending) createMut.mutate(); }}
                style={{ fontSize: 14 }} />
            </div>

            <label className="checkbox-row-v2">
              <input type="checkbox" checked={includeSample}
                onChange={(e) => setIncludeSample(e.target.checked)} />
              <span className="checkbox-row-v2-text">
                Incluir {selected.sample_rows_count} filas de ejemplo
                <span>Te ayudan a ver cómo se usa la plantilla. Las puedes eliminar después.</span>
              </span>
            </label>

            {createMut.isError && (
              <p style={{ margin: 0, color: "var(--pm-red-500)", fontSize: 13 }}>
                ⚠ {(createMut.error as Error)?.message ?? "Error al crear"}
              </p>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end",
              paddingTop: 12, borderTop: "1px solid var(--color-border-light)" }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary"
                disabled={!customName.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}>
                {createMut.isPending ? "Creando…" : "Crear desde plantilla"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

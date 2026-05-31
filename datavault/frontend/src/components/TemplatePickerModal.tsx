import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Sparkles, X, ArrowLeft, AlertTriangle } from "lucide-react";
import { listDatasetTemplates, createDatasetFromTemplate } from "../api/datasets";
import type { DatasetTemplate } from "../api/datasets";
import { useToast } from "./Toast";
import { useEscapeKey } from "../utils/useEscapeKey";
import { Btn, Toggle } from "./ui/kit";

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

  // ── Modal frame (handoff: overlay + card + header con icon tile / X) ───────────
  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "var(--overlay)", backdropFilter: "blur(5px)",
        display: "grid", placeItems: "center", padding: 24,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 680, maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-4)", boxShadow: "var(--shadow-4)",
          animation: "ogPop var(--t-slow)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "18px 20px", borderBottom: "1px solid var(--border)",
        }}>
          <span style={{
            display: "grid", placeItems: "center", width: 38, height: 38,
            borderRadius: "var(--r-2)", background: "var(--pri-soft)",
            color: "var(--accent-pri)", flex: "none",
          }}>
            <Sparkles size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>
              Galería de plantillas
            </div>
            <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3 }}>
              Empieza con columnas y datos de ejemplo
            </div>
          </div>
          <button
            onClick={onClose}
            className="og-iconbtn"
            style={{
              width: 32, height: 32, display: "grid", placeItems: "center",
              border: "none", background: "transparent", borderRadius: 8,
              cursor: "pointer", color: "var(--text-mute)", flex: "none",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflow: "auto" }}>
          {isLoading ? (
            <div style={{
              padding: 32, textAlign: "center",
              font: "400 13.5px/1 var(--font-sans)", color: "var(--text-mute)",
            }}>
              Cargando plantillas…
            </div>
          ) : !selected ? (
            // ── Galería: grid de cards (emoji + nombre + descripción + conteos) ──
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}>
              {templates.map((t) => (
                <button
                  key={t.id}
                  className="og-card"
                  onClick={() => { setSelected(t); setCustomName(t.name); }}
                  style={{
                    textAlign: "left", display: "flex", flexDirection: "column", gap: 8,
                    padding: 15, borderRadius: "var(--r-3)",
                    border: "1px solid var(--border)", background: "var(--surface)",
                    cursor: "pointer", boxShadow: "var(--shadow-1)",
                  }}
                >
                  <span style={{
                    display: "grid", placeItems: "center", width: 42, height: 42,
                    borderRadius: "var(--r-2)", background: "var(--pri-soft)",
                    fontSize: 24, lineHeight: 1,
                  }}>
                    {t.icon}
                  </span>
                  <span style={{ font: "600 14px/1.2 var(--font-sans)", color: "var(--text)" }}>
                    {t.name}
                  </span>
                  <span style={{ font: "400 12px/1.4 var(--font-sans)", color: "var(--text-mute)" }}>
                    {t.description}
                  </span>
                  <span className="mono" style={{
                    font: "500 11px/1 var(--font-mono)", color: "var(--accent-pri)", marginTop: 2,
                  }}>
                    {t.columns_count} columnas · {t.sample_rows_count} ejemplos
                  </span>
                </button>
              ))}
            </div>
          ) : (
            // ── Detalle: cabecera de plantilla + nombre editable + toggle ejemplo ──
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 12, padding: 12,
                background: "var(--pri-soft)",
                border: "1px solid color-mix(in srgb, var(--accent-pri) 30%, transparent)",
                borderRadius: "var(--r-3)",
              }}>
                <span style={{
                  display: "grid", placeItems: "center", width: 44, height: 44,
                  borderRadius: "var(--r-2)", background: "var(--surface)",
                  border: "1px solid var(--border)", fontSize: 24, lineHeight: 1, flex: "none",
                }}>
                  {selected.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "700 15px/1.2 var(--font-sans)", color: "var(--text)" }}>
                    {selected.name}
                  </div>
                  <div style={{ font: "400 12.5px/1.4 var(--font-sans)", color: "var(--text-soft)" }}>
                    {selected.description}
                  </div>
                </div>
                <Btn variant="ghost" size="sm" icon={<ArrowLeft size={15} />}
                  onClick={() => setSelected(null)}>
                  Otras
                </Btn>
              </div>

              <label style={{ display: "block" }}>
                <div style={{
                  font: "500 12.5px/1 var(--font-sans)", color: "var(--text-soft)", marginBottom: 6,
                }}>
                  Nombre del dataset
                </div>
                <input
                  value={customName}
                  autoFocus
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customName.trim() && !createMut.isPending) createMut.mutate();
                  }}
                  style={{
                    width: "100%", height: 38, padding: "0 11px", borderRadius: "var(--r-2)",
                    border: "1px solid var(--border)", background: "var(--surface)",
                    color: "var(--text)", font: "400 13.5px var(--font-sans)", outline: "none",
                  }}
                />
              </label>

              <div style={{
                display: "flex", alignItems: "flex-start", gap: 12, padding: 12,
                borderRadius: "var(--r-3)", background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "600 13.5px/1.3 var(--font-sans)", color: "var(--text)" }}>
                    Incluir {selected.sample_rows_count} filas de ejemplo
                  </div>
                  <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--text-mute)", marginTop: 3 }}>
                    Te ayudan a ver cómo se usa la plantilla. Las puedes eliminar después.
                  </div>
                </div>
                <div style={{ flex: "none", paddingTop: 1 }}>
                  <Toggle on={includeSample} onChange={setIncludeSample} />
                </div>
              </div>

              {createMut.isError && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                  borderRadius: "var(--r-2)", background: "var(--danger-soft)",
                  color: "var(--danger)", font: "500 13px/1.3 var(--font-sans)",
                }}>
                  <AlertTriangle size={16} style={{ flex: "none" }} />
                  {(createMut.error as Error)?.message ?? "Error al crear"}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer (solo en detalle) */}
        {selected && !isLoading && (
          <div style={{
            display: "flex", justifyContent: "flex-end", gap: 10,
            padding: "14px 20px", borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}>
            <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
            <Btn
              variant="primary"
              icon={<Sparkles size={15} />}
              disabled={!customName.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "Creando…" : "Crear desde plantilla"}
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

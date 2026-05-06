import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDatasets, getRecords, deleteDataset, computeDataset, createDataset } from "../api/datasets";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { useAuth } from "../auth/AuthContext";
import UserMenu from "../components/UserMenu";
import type { Dataset } from "../types";

function timeAgo(iso: string | null) {
  if (!iso) return "Nunca ejecutado";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Hace un momento";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  return `Hace ${Math.floor(hrs / 24)} días`;
}

export default function ScriptsHub() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const { isAdmin } = useAuth();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);

  const { data: allDatasets = [], isLoading } = useQuery({
    queryKey: ["datasets"],
    queryFn: getDatasets,
  });

  const scripts = allDatasets.filter((d) => d.is_computed);

  // Fetch record count for each script
  const recQueries = useQueries({
    queries: scripts.map((ds) => ({
      queryKey: ["records", ds.id, "count"],
      queryFn: () => getRecords(ds.id, {}).then((r) => r.total),
      staleTime: 30_000,
    })),
  });

  const createMut = useMutation({
    mutationFn: () => createDataset(newName.trim(), newDesc.trim() || undefined, {
      is_computed: true,
      source_code: "",
      source_dataset_ids: [],
    }),
    onSuccess: (ds) => {
      qc.invalidateQueries({ queryKey: ["datasets"] });
      toast("Script creado", "success");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      navigate(`/datasets/${ds.id}/computed`);
    },
    onError: () => toast("Error creando script", "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDataset(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasets"] });
      toast("Script eliminado", "success");
    },
    onError: () => toast("Error eliminando script", "error"),
  });

  async function runScript(ds: Dataset) {
    if (!ds.source_code?.trim()) {
      toast("Este script no tiene código. Ábrelo para editarlo.", "error");
      return;
    }
    setRunningId(ds.id);
    try {
      const result = await computeDataset(ds.id);
      qc.invalidateQueries({ queryKey: ["datasets"] });
      qc.invalidateQueries({ queryKey: ["records", ds.id] });
      toast(`"${ds.name}" ejecutado: ${result.records_created} registros, ${result.columns_created} columnas`, "success");
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      if (detail && typeof detail === "object" && "error" in detail) {
        toast(`Error: ${(detail as { error: string }).error}`, "error");
      } else {
        toast(`Error ejecutando "${ds.name}"`, "error");
      }
    } finally {
      setRunningId(null);
    }
  }

  const sourceDatasets = allDatasets.filter((d) => !d.is_computed);

  function sourceNames(ids: string[]) {
    return ids
      .map((id) => sourceDatasets.find((d) => d.id === id)?.name ?? id.slice(0, 8))
      .join(", ");
  }

  return (
    <>
      <header className="app-header">
        <button className="btn btn-ghost" onClick={() => navigate("/")} style={{ padding: "5px 8px", fontSize: 18 }}>←</button>
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo" style={{ width: 28, height: 28, fontSize: 13, borderRadius: "var(--radius-xs)" }}>T</div>
          <span className="app-header-name">Trans<em>Excel</em></span>
        </button>
        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Scripts Python</span>
        <span style={{
          fontSize: 11, padding: "2px 10px", borderRadius: 99, marginLeft: 8,
          background: "#7C3AED18", color: "#7C3AED", border: "1px solid #7C3AED40", fontWeight: 700,
        }}>⚡ Lambda</span>
        <div className="app-header-spacer" />
        <UserMenu />
      </header>

      <main className="page" style={{ paddingTop: 28, maxWidth: 860 }}>

        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0 }}>Scripts calculados</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
              Cada script produce su propio dataset independiente. Re-ejecutar un script solo reemplaza sus propios resultados.
            </p>
          </div>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + Nuevo script
            </button>
          )}
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 15 }}>Nuevo script</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 16px" }}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input
                  placeholder="Ej. Ventas por mes"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <input
                  placeholder="Opcional"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button className="btn btn-primary" disabled={!newName.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}>
                {createMut.isPending ? "Creando..." : "Crear y abrir editor"}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Scripts list */}
        {isLoading ? (
          <p style={{ color: "var(--color-text-muted)" }}>Cargando...</p>
        ) : scripts.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            border: "2px dashed var(--color-border-light)", borderRadius: 12,
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
            <h3 style={{ margin: "0 0 8px" }}>Sin scripts todavía</h3>
            <p style={{ color: "var(--color-text-muted)", margin: "0 0 20px" }}>
              Crea tu primer script para transformar y calcular datos con Python.
            </p>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                + Nuevo script
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {scripts.map((ds, i) => {
              const recCount = recQueries[i]?.data ?? null;
              const isRunning = runningId === ds.id;
              const hasCode = !!ds.source_code?.trim();
              const hasSources = ds.source_dataset_ids.length > 0;

              return (
                <div key={ds.id} className="card" style={{
                  padding: "16px 20px",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                  opacity: isRunning ? 0.8 : 1,
                }}>
                  <div style={{ minWidth: 0 }}>
                    {/* Name + status badges */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>⚡ {ds.name}</span>
                      {!hasCode && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                          background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A",
                        }}>Sin código</span>
                      )}
                      {!hasSources && hasCode && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                          background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A",
                        }}>Sin fuentes</span>
                      )}
                    </div>

                    {ds.description && (
                      <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--color-text-muted)" }}>{ds.description}</p>
                    )}

                    {/* Metadata row */}
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      {hasSources && (
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                          📥 <strong>Fuentes:</strong> {sourceNames(ds.source_dataset_ids)}
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                        🕒 {timeAgo(ds.last_computed_at)}
                      </span>
                      {recCount !== null && ds.last_computed_at && (
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                          📄 {recCount.toLocaleString()} registro{recCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {/* Run */}
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: 12, padding: "6px 14px", minWidth: 90 }}
                      disabled={isRunning || !hasCode || !hasSources}
                      title={!hasCode ? "Agrega código primero" : !hasSources ? "Selecciona datasets fuente" : `Ejecutar "${ds.name}"`}
                      onClick={() => runScript(ds)}
                    >
                      {isRunning ? "⏳ Ejecutando..." : "▶ Ejecutar"}
                    </button>

                    {/* Edit code */}
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: "6px 12px" }}
                      onClick={() => navigate(`/datasets/${ds.id}/computed`)}
                      title="Editar código y fuentes"
                    >
                      ✏️ Editar
                    </button>

                    {/* View results */}
                    {ds.last_computed_at && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: "6px 12px" }}
                        onClick={() => navigate(`/datasets/${ds.id}`)}
                        title="Ver resultados"
                      >
                        👁 Ver
                      </button>
                    )}

                    {/* Delete */}
                    {isAdmin && (
                      <button
                        className="btn btn-danger-ghost"
                        style={{ fontSize: 13, padding: "6px 10px" }}
                        title="Eliminar script y sus datos"
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Eliminar script "${ds.name}"`,
                            message: "Se eliminarán el script y todos sus resultados. Los datasets fuente no se modifican.",
                            confirmLabel: "Eliminar",
                            variant: "danger",
                          });
                          if (ok) deleteMut.mutate(ds.id);
                        }}
                      >×</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {scripts.length > 0 && (
          <p style={{ marginTop: 20, fontSize: 12, color: "var(--color-text-muted)", textAlign: "center" }}>
            Cada script es independiente — ejecutar uno no afecta los resultados de los demás.
          </p>
        )}
      </main>
    </>
  );
}

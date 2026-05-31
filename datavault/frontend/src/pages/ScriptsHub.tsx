import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDatasets, getRecords, deleteDataset, computeDataset, createDataset } from "../api/datasets";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { useAuth } from "../auth/AuthContext";
import AppShell from "../components/chrome/AppShell";
import { Badge, Btn, Chip, IconBtn } from "../components/ui/kit";
import {
  Zap, Plus, Play, Pencil, Trash2, ArrowRight, Loader2,
} from "lucide-react";
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

const GRID = "1.6fr 1.4fr 1fr 1fr 168px";

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
    queryFn: () => getDatasets(),
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

  function sourceName(id: string) {
    return sourceDatasets.find((d) => d.id === id)?.name ?? id.slice(0, 8);
  }

  async function onDelete(ds: Dataset) {
    const ok = await confirm({
      title: `Eliminar script "${ds.name}"`,
      message: "Se eliminarán el script y todos sus resultados. Los datasets fuente no se modifican.",
      confirmLabel: "Eliminar",
      variant: "danger",
    });
    if (ok) deleteMut.mutate(ds.id);
  }

  const inputStyle: React.CSSProperties = {
    height: 38, padding: "0 12px", borderRadius: "var(--r-2)",
    border: "1px solid var(--border)", background: "var(--surface)",
    color: "var(--text)", font: "400 14px/1 var(--font-sans)", outline: "none", width: "100%",
  };
  const labelStyle: React.CSSProperties = {
    font: "500 13px/1 var(--font-sans)", color: "var(--text-soft)", marginBottom: 6, display: "block",
  };

  return (
    <AppShell active="scripts">
      <main style={{ overflowY: "auto", width: "100%" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 80px" }}>

          {/* Page header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 22 }}>
            <div>
              <h1 style={{ margin: 0, font: "700 28px/1.1 var(--font-sans)", letterSpacing: "-.02em", display: "flex", alignItems: "center", gap: 10, color: "var(--text)" }}>
                <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "var(--r-2)", background: "var(--calc-soft)", color: "var(--accent-calc)", font: "700 16px var(--font-mono)" }}>ƒ</span>
                Scripts calculados
              </h1>
              <p style={{ margin: "7px 0 0", font: "400 15px/1.4 var(--font-sans)", color: "var(--text-soft)", maxWidth: 560 }}>
                Cada script produce su propio dataset independiente. Re-ejecutar un
                script solo reemplaza sus propios resultados; no afecta a los demás.
              </p>
            </div>
            {isAdmin && (
              <div style={{ display: "flex", gap: 10 }}>
                <Btn variant="primary" icon={<Plus size={16} />} onClick={() => setShowCreate(true)}>Nuevo script</Btn>
              </div>
            )}
          </div>

          {/* Create form */}
          {showCreate && (
            <div className="og-rise" style={{
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
              padding: 20, marginBottom: 20, boxShadow: "var(--shadow-1)",
            }}>
              <p style={{ margin: "0 0 14px", font: "700 15px/1 var(--font-sans)", color: "var(--text)" }}>Nuevo script</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 16px" }}>
                <div>
                  <label style={labelStyle}>Nombre *</label>
                  <input
                    placeholder="Ej. Ventas por mes"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Descripción</label>
                  <input
                    placeholder="Opcional"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <Btn variant="primary" disabled={!newName.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}>
                  {createMut.isPending ? "Creando..." : "Crear y abrir editor"}
                </Btn>
                <Btn variant="soft" onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); }}>
                  Cancelar
                </Btn>
              </div>
            </div>
          )}

          {/* Scripts list */}
          {isLoading ? (
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: i < 2 ? "1px solid var(--border)" : "none" }}>
                  <div className="og-shimmer" style={{ width: 30, height: 30, borderRadius: 8 }} />
                  <div className="og-shimmer" style={{ width: "30%", height: 14, borderRadius: 5 }} />
                  <div style={{ flex: 1 }} />
                  <div className="og-shimmer" style={{ width: 90, height: 14, borderRadius: 5 }} />
                </div>
              ))}
            </div>
          ) : scripts.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              textAlign: "center", padding: "64px 24px", borderRadius: "var(--r-3)",
              border: "1.5px dashed var(--border-strong)", background: "var(--surface)",
            }}>
              <span style={{ display: "grid", placeItems: "center", width: 56, height: 56, borderRadius: "var(--r-3)", background: "var(--calc-soft)", color: "var(--accent-calc)", marginBottom: 16 }}>
                <Zap size={26} />
              </span>
              <h4 style={{ margin: 0, font: "700 18px/1.2 var(--font-sans)", color: "var(--text)" }}>Sin scripts todavía</h4>
              <p style={{ margin: "8px 0 0", font: "400 14px/1.4 var(--font-sans)", color: "var(--text-soft)", maxWidth: 360 }}>
                Crea tu primer script para transformar y calcular datos con Python.
              </p>
              {isAdmin && (
                <div style={{ marginTop: 20 }}>
                  <Btn variant="primary" icon={<Plus size={16} />} onClick={() => setShowCreate(true)}>Nuevo script</Btn>
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
                {/* head */}
                <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "11px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", font: "600 12px var(--font-sans)", color: "var(--text-mute)" }}>
                  <span>Script</span>
                  <span>Fuentes</span>
                  <span>Programación</span>
                  <span>Última corrida</span>
                  <span style={{ textAlign: "right" }}>Acciones</span>
                </div>

                {scripts.map((ds, i) => {
                  const recCount = recQueries[i]?.data ?? null;
                  const isRunning = runningId === ds.id;
                  const hasCode = !!ds.source_code?.trim();
                  const hasSources = ds.source_dataset_ids.length > 0;
                  const ran = !!ds.last_computed_at;

                  return (
                    <div
                      key={ds.id}
                      className="og-gridrow"
                      style={{
                        display: "grid", gridTemplateColumns: GRID, alignItems: "center",
                        padding: "13px 16px", cursor: "pointer",
                        borderBottom: i < scripts.length - 1 ? "1px solid var(--border)" : "none",
                        opacity: isRunning ? 0.6 : 1, transition: "opacity var(--t-fast)",
                      }}
                      onClick={() => navigate(`/datasets/${ds.id}/computed`)}
                    >
                      {/* Script name + state badges */}
                      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, flex: "none", borderRadius: 8, background: "var(--calc-soft)", color: "var(--accent-calc)", font: "700 14px var(--font-mono)" }}>ƒ</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", font: "600 14px/1.2 var(--font-sans)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.name}</span>
                          {!hasCode ? (
                            <span style={{ display: "flex", gap: 5, marginTop: 5 }}>
                              <Badge tone="warn">sin código</Badge>
                            </span>
                          ) : !hasSources ? (
                            <span style={{ display: "flex", gap: 5, marginTop: 5 }}>
                              <Badge tone="danger">sin fuentes</Badge>
                            </span>
                          ) : ds.description ? (
                            <span style={{ display: "block", marginTop: 3, font: "400 12px/1.3 var(--font-sans)", color: "var(--text-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.description}</span>
                          ) : null}
                        </span>
                      </span>

                      {/* Fuentes */}
                      <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {hasSources
                          ? ds.source_dataset_ids.map((id) => (
                              <Chip key={id} tone="rel">{sourceName(id)}</Chip>
                            ))
                          : <span style={{ color: "var(--text-mute)", font: "400 13px var(--font-sans)" }}>—</span>}
                      </span>

                      {/* Programación */}
                      <span style={{ font: "400 13px var(--font-sans)", color: "var(--text-soft)" }}>manual</span>

                      {/* Última corrida */}
                      <span className="mono" style={{ font: "400 13px var(--font-mono)", color: "var(--text-soft)" }}>
                        {isRunning
                          ? "ejecutando…"
                          : ran
                            ? <>{timeAgo(ds.last_computed_at)}{recCount !== null && <span style={{ color: "var(--text-mute)" }}> · {recCount.toLocaleString()} reg.</span>}</>
                            : "—"}
                      </span>

                      {/* Acciones */}
                      <span className="og-rowact" style={{ display: "flex", gap: 2, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                        <IconBtn
                          title={!hasCode ? "Agrega código primero" : !hasSources ? "Selecciona datasets fuente" : `Ejecutar "${ds.name}"`}
                          style={{ width: 30, height: 30, color: "var(--success)", opacity: isRunning || !hasCode || !hasSources ? 0.4 : 1, cursor: isRunning || !hasCode || !hasSources ? "not-allowed" : "pointer" }}
                          onClick={() => { if (!isRunning && hasCode && hasSources) runScript(ds); }}
                        >
                          {isRunning ? <Loader2 size={16} style={{ animation: "spin 0.7s linear infinite" }} /> : <Play size={16} />}
                        </IconBtn>
                        <IconBtn
                          title="Editar código y fuentes"
                          style={{ width: 30, height: 30 }}
                          onClick={() => navigate(`/datasets/${ds.id}/computed`)}
                        >
                          <Pencil size={16} />
                        </IconBtn>
                        {ran && (
                          <IconBtn
                            title="Ver resultados"
                            style={{ width: 30, height: 30 }}
                            onClick={() => navigate(`/datasets/${ds.id}`)}
                          >
                            <ArrowRight size={16} />
                          </IconBtn>
                        )}
                        {isAdmin && (
                          <IconBtn
                            title="Eliminar script y sus datos"
                            style={{ width: 30, height: 30 }}
                            onClick={() => onDelete(ds)}
                          >
                            <Trash2 size={16} />
                          </IconBtn>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 12, font: "400 12.5px var(--font-sans)", color: "var(--text-mute)" }}>
                Ejecutar requiere plan <strong style={{ color: "var(--text-soft)" }}>Pro o superior</strong>.
              </div>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

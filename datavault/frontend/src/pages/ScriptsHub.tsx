import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDatasets, getRecords, deleteDataset, computeDataset, createDataset } from "../api/datasets";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { useAuth } from "../auth/AuthContext";
import AppShell from "../components/chrome/AppShell";
import {
  FunctionSquare, Zap, Plus, Play, Pencil, Trash2, ExternalLink, Hand, Loader2,
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

  return (
    <AppShell active="scripts">
      <main className="page" style={{ paddingTop: 28, maxWidth: 1080, overflowY: "auto", width: "100%" }}>

        {/* Page header */}
        <div className="page-header">
          <div>
            <h1>Scripts calculados</h1>
            <p>
              Cada script produce su propio dataset independiente. Re-ejecutar un
              script solo reemplaza sus propios resultados; no afecta a los demás.
            </p>
          </div>
          {isAdmin && (
            <div className="page-header__actions">
              <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
                <Plus /> Nuevo script
              </button>
            </div>
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
              <button className="btn btn--primary" disabled={!newName.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}>
                {createMut.isPending ? "Creando..." : "Crear y abrir editor"}
              </button>
              <button className="btn btn--secondary" onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Scripts list */}
        {isLoading ? (
          <p style={{ color: "var(--text-soft)" }}>Cargando...</p>
        ) : scripts.length === 0 ? (
          <div className="empty">
            <div className="empty__art"><Zap size={28} /></div>
            <h4>Sin scripts todavía</h4>
            <p>Crea tu primer script para transformar y calcular datos con Python.</p>
            {isAdmin && (
              <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
                <Plus /> Nuevo script
              </button>
            )}
          </div>
        ) : (
          <div className="scripts-list">
            <div className="scripts-head">
              <span></span>
              <span>Script</span>
              <span>Fuentes</span>
              <span>Programación</span>
              <span style={{ textAlign: "right" }}>Última corrida</span>
              <span></span>
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
                  className="script-row"
                  style={{ opacity: isRunning ? 0.7 : 1 }}
                  onClick={() => navigate(`/datasets/${ds.id}/computed`)}
                >
                  <span className="script-row__icon">
                    {hasCode ? <FunctionSquare /> : <Zap />}
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <div className="script-row__name">
                      {ds.name}
                      {!hasCode && (
                        <span className="badge badge--danger" style={{ marginLeft: 6 }}>SIN CÓDIGO</span>
                      )}
                      {hasCode && !hasSources && (
                        <span className="badge badge--danger" style={{ marginLeft: 6 }}>SIN FUENTES</span>
                      )}
                    </div>
                    {ds.description && (
                      <div className="script-row__desc">{ds.description}</div>
                    )}
                  </div>

                  <div className="script-row__sources">
                    {hasSources
                      ? ds.source_dataset_ids.map((id) => (
                          <span key={id} className="script-row__src">{sourceName(id)}</span>
                        ))
                      : <span style={{ fontSize: 11, color: "var(--text-mute)" }}>—</span>}
                  </div>

                  <div className="script-row__schedule">
                    <Hand style={{ width: 11, height: 11, verticalAlign: -1 }} /> Manual
                  </div>

                  <div className="script-row__meta" style={{ textAlign: "right" }}>
                    {ran ? (
                      <>
                        <b>{timeAgo(ds.last_computed_at)}</b>
                        {recCount !== null && (
                          <> · {recCount.toLocaleString()} reg.</>
                        )}
                      </>
                    ) : (
                      "Nunca"
                    )}
                  </div>

                  <div className="script-row__actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      title={!hasCode ? "Agrega código primero" : !hasSources ? "Selecciona datasets fuente" : `Ejecutar "${ds.name}"`}
                      disabled={isRunning || !hasCode || !hasSources}
                      onClick={() => runScript(ds)}
                    >
                      {isRunning ? <Loader2 style={{ animation: "spin 0.7s linear infinite" }} /> : <Play />}
                    </button>
                    <button
                      title="Editar código y fuentes"
                      onClick={() => navigate(`/datasets/${ds.id}/computed`)}
                    >
                      <Pencil />
                    </button>
                    {ran && (
                      <button
                        title="Ver resultados"
                        onClick={() => navigate(`/datasets/${ds.id}`)}
                      >
                        <ExternalLink />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        title="Eliminar script y sus datos"
                        onClick={() => onDelete(ds)}
                      >
                        <Trash2 />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </AppShell>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Clock, MoreHorizontal } from "lucide-react";
import { getWorkspaces, createWorkspace } from "../api/workspaces";
import { getDatasets, getColumns, getRecords } from "../api/datasets";
import type { Workspace } from "../workspace/WorkspaceContext";

// ── Variantes de color por workspace (hash del nombre) ───────────────────────
const WS_ICON_VARIANTS = ["", "is-rel", "is-mint", "is-violet", "is-orange"] as const;

function wsVariant(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffffff;
  return WS_ICON_VARIANTS[h % WS_ICON_VARIANTS.length];
}

function fmtCount(n: number) {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
}

// ── Workspace card ─────────────────────────────────────────────────────────────
function WorkspaceCard({ ws, onOpen }: { ws: Workspace; onOpen: () => void }) {
  const variant = wsVariant(ws.name);
  const initial = ws.name.trim().charAt(0).toUpperCase() || "W";

  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", ws.id],
    queryFn: () => getDatasets({ workspace_id: ws.id }),
    staleTime: 60_000,
  });

  const colQueries = useQueries({
    queries: datasets.map((ds) => ({
      queryKey: ["columns", ds.id],
      queryFn: () => getColumns(ds.id),
      staleTime: 120_000,
    })),
  });

  const recQueries = useQueries({
    queries: datasets.map((ds) => ({
      queryKey: ["records", ds.id, "count"],
      queryFn: () => getRecords(ds.id, {}).then((r) => r.total),
      staleTime: 60_000,
    })),
  });

  const totalRecords = recQueries.reduce((s, q) => s + (typeof q.data === "number" ? q.data : 0), 0);
  const totalCols = colQueries.reduce((s, q) => s + (q.data?.length ?? 0), 0);

  const code = ws.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <div className="ws-card" onClick={onOpen} style={{ cursor: "pointer" }}>
      <div className="ws-card__head">
        <span className={`ws-card__icon ${variant}`}>{initial}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ws-card__title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ws.name}
          </div>
          <div className="ws-card__sub">{code}.opsgrid.app</div>
        </div>
        <button
          className="dv-topbar__icon-btn"
          title="Más opciones"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </button>
      </div>

      {ws.description && (
        <p style={{ margin: 0, fontSize: "var(--fs-13)", color: "var(--text-soft)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {ws.description}
        </p>
      )}

      <div className="ws-card__stats">
        <div className="ws-card__stat"><span className="label">Datasets</span><span className="val">{datasets.length}</span></div>
        <div className="ws-card__stat"><span className="label">Registros</span><span className="val">{fmtCount(totalRecords)}</span></div>
        <div className="ws-card__stat"><span className="label">Columnas</span><span className="val">{totalCols}</span></div>
        <div className="ws-card__stat"><span className="label">Mi rol</span><span className="val" style={{ color: "var(--accent-pri)" }}>{ws.my_role ?? "—"}</span></div>
      </div>

      <div className="ws-card__foot">
        <span style={{ fontSize: "var(--fs-11)", color: "var(--text-mute)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Clock style={{ width: 11, height: 11 }} /> Activo
        </span>
        <span style={{ fontSize: "var(--fs-13)", color: "var(--accent-pri)", fontWeight: 600 }}>
          Abrir workspace →
        </span>
      </div>
    </div>
  );
}

// ── Main AdminDashboard ────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["admin-workspaces"],
    queryFn: getWorkspaces,
    staleTime: 30_000,
  });

  const handleOpen = (ws: Workspace) => navigate(`/ws/${ws.id}`);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const ws = await createWorkspace({ name: newName.trim(), description: newDesc.trim() || null });
      await qc.invalidateQueries({ queryKey: ["admin-workspaces"] });
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      setCreating(false);
      setNewName("");
      setNewDesc("");
      navigate(`/ws/${ws.id}`);
    } finally {
      setSaving(false);
    }
  };

  const totalDatasets = useQueries({
    queries: workspaces.map((ws) => ({
      queryKey: ["datasets", ws.id],
      queryFn: () => getDatasets({ workspace_id: ws.id }),
      staleTime: 60_000,
    })),
  }).reduce((s, q) => s + (q.data?.length ?? 0), 0);

  if (isLoading) return (
    <div style={{ padding: "80px", textAlign: "center", color: "var(--text-mute)" }}>
      Cargando workspaces…
    </div>
  );

  return (
    <div>
      {/* Resumen global — 2 tarjetas simples */}
      <div style={{ display: "flex", gap: "var(--sp-4)", marginBottom: "var(--sp-6)", flexWrap: "wrap" }}>
        {[
          { label: "Workspaces", value: workspaces.length, color: "var(--accent-pri)" },
          { label: "Datasets totales", value: totalDatasets, color: "var(--accent-calc)" },
        ].map((s, i) => (
          <div key={i} style={{
            flex: "1 1 160px", background: "var(--surface)",
            border: "1px solid var(--border-soft)", borderRadius: "var(--r-3)",
            padding: "var(--sp-4) var(--sp-5)",
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: "var(--font-mono)" }}>{s.value}</div>
            <div style={{ fontSize: "var(--fs-12)", color: "var(--text-mute)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Título sección */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-4)" }}>
        <h2 style={{ margin: 0, fontSize: "var(--fs-17)", fontWeight: 700 }}>Todos los workspaces</h2>
        <span style={{ fontSize: "var(--fs-12)", color: "var(--text-mute)" }}>
          Haz clic en un workspace para abrirlo
        </span>
      </div>

      {/* Grid de tarjetas de workspace */}
      <div className="ws-grid">
        {workspaces.map((ws) => (
          <WorkspaceCard key={ws.id} ws={ws} onOpen={() => handleOpen(ws)} />
        ))}

        {/* Tarjeta "Nuevo workspace" */}
        {!creating ? (
          <button
            type="button"
            className="ws-card"
            onClick={() => setCreating(true)}
            style={{
              border: "1px dashed var(--border)",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              cursor: "pointer",
              background: "var(--surface)",
              color: "var(--text-soft)",
              minHeight: 200,
            }}
          >
            <span className="ws-card__icon" style={{ background: "var(--accent-pri-soft)", color: "var(--accent-pri)" }}>
              <Building2 style={{ width: 20, height: 20 }} />
            </span>
            <div className="ws-card__title" style={{ color: "var(--text)" }}>Crear workspace</div>
            <p style={{ margin: 0, fontSize: "var(--fs-12)", color: "var(--text-soft)", lineHeight: 1.45, maxWidth: 280 }}>
              Cada cliente nuevo arranca con su workspace aislado y plan asignado.
            </p>
          </button>
        ) : (
          <div className="ws-card" style={{ border: "1px solid var(--accent-pri)" }}>
            <div className="ws-card__head">
              <span className="ws-card__icon" style={{ background: "var(--accent-pri-soft)", color: "var(--accent-pri)" }}>
                <Building2 style={{ width: 20, height: 20 }} />
              </span>
              <div style={{ flex: 1 }}>
                <div className="ws-card__title">Nuevo workspace</div>
                <div className="ws-card__sub">Completa los datos del equipo</div>
              </div>
            </div>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-mute)", display: "block", marginBottom: 4 }}>
                  Nombre del equipo *
                </label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ej. Ventas, Operaciones, RRHH…"
                  style={{
                    width: "100%", padding: "8px 10px", boxSizing: "border-box",
                    background: "var(--surface-alt)", border: "1px solid var(--border-soft)",
                    borderRadius: "var(--r-2)", color: "var(--text)", fontSize: "var(--fs-13)",
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-mute)", display: "block", marginBottom: 4 }}>
                  Descripción
                </label>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Descripción opcional"
                  style={{
                    width: "100%", padding: "8px 10px", boxSizing: "border-box",
                    background: "var(--surface-alt)", border: "1px solid var(--border-soft)",
                    borderRadius: "var(--r-2)", color: "var(--text)", fontSize: "var(--fs-13)",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: 4 }}>
                <button
                  type="submit"
                  className="btn btn--primary btn--sm"
                  disabled={saving || !newName.trim()}
                  style={{ flex: 1 }}
                >
                  {saving ? "Creando…" : "Crear workspace"}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

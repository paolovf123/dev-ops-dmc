import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWorkspaces, createWorkspace } from "../api/workspaces";
import { getDatasets, getColumns, getRecords } from "../api/datasets";
import type { Workspace } from "../workspace/WorkspaceContext";
import type { ColumnDefinition } from "../types";
import type { UseQueryResult } from "@tanstack/react-query";

// ── Mini schema preview (same logic as DatasetList's SchemaPreview) ───────────
const BOX_COLORS = [
  "#0EA5E9","#3B82F6","#F5821F","#8B5CF6","#0EA5E9",
  "#EC4899","#14B8A6","#F59E0B","#6366F1","#10B981",
];
function normKw(s: string) { return s.toLowerCase().replace(/\s+/g, "_"); }
function kw(s: string) { const p = normKw(s).split("_"); return p[p.length - 1]; }

interface MiniDataset { id: string; name: string }

function MiniSchema({
  datasets,
  colQueries,
}: {
  datasets: MiniDataset[];
  colQueries: UseQueryResult<ColumnDefinition[]>[];
}) {
  const W = 110, H = 38, GAP_X = 70, GAP_Y = 14, MARGIN = 16;
  const COLS = 3;
  const edges: { fi: number; ti: number }[] = [];
  datasets.forEach((_ds, fi) => {
    const cols = colQueries[fi]?.data ?? [];
    cols.filter((c) => c.field_key.startsWith("id_")).forEach((c) => {
      const refKw = c.field_key.slice(3);
      const ti = datasets.findIndex((d, j) =>
        j !== fi && (kw(d.name) === refKw || normKw(d.name) === refKw ||
          normKw(d.name).endsWith(`_${refKw}`) || normKw(d.name).startsWith(`${refKw}_`))
      );
      if (ti !== -1 && !edges.find((e) => e.fi === fi && e.ti === ti))
        edges.push({ fi, ti });
    });
  });

  const rows = Math.ceil(datasets.length / COLS);
  const svgW = MARGIN * 2 + COLS * W + (COLS - 1) * GAP_X;
  const svgH = MARGIN * 2 + rows * H + (rows - 1) * GAP_Y;
  const pos = datasets.map((_, i) => ({
    x: MARGIN + (i % COLS) * (W + GAP_X),
    y: MARGIN + Math.floor(i / COLS) * (H + GAP_Y),
  }));

  if (datasets.length === 0) return (
    <div style={{ padding: "20px", textAlign: "center", fontSize: 12, color: "var(--color-text-muted)" }}>
      Sin datasets
    </div>
  );

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto", display: "block" }} xmlns="http://www.w3.org/2000/svg">
      <rect width={svgW} height={svgH} fill="#F4F6F9" />
      <defs>
        <pattern id="d2" width={16} height={16} patternUnits="userSpaceOnUse">
          <circle cx={8} cy={8} r={0.7} fill="#CBD5E0" opacity={0.4} />
        </pattern>
        <marker id="ma2" markerWidth={6} markerHeight={6} refX={4} refY={3} orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#94A3B8" />
        </marker>
      </defs>
      <rect width={svgW} height={svgH} fill="url(#d2)" />
      {edges.map((e, i) => {
        const fp = pos[e.fi], tp = pos[e.ti];
        if (!fp || !tp) return null;
        const x1 = fp.x + W, y1 = fp.y + H / 2;
        const x2 = tp.x + W, y2 = tp.y + H / 2;
        const mx = (x1 + x2) / 2;
        return <path key={i} d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
          fill="none" stroke="#94A3B8" strokeWidth={1.2} opacity={0.6} markerEnd="url(#ma2)" />;
      })}
      {datasets.map((ds, i) => {
        const { x, y } = pos[i];
        const color = BOX_COLORS[i % BOX_COLORS.length];
        return (
          <g key={ds.id}>
            <rect x={x + 2} y={y + 2} width={W} height={H} rx={6} fill="rgba(0,0,0,0.05)" />
            <rect x={x} y={y} width={W} height={H} rx={6} fill="white" stroke={color} strokeWidth={1.8} />
            <rect x={x} y={y} width={W} height={20} rx={6} fill={color} />
            <rect x={x} y={y + 13} width={W} height={7} fill={color} />
            <text x={x + W / 2} y={y + 14} textAnchor="middle" fill="white" fontSize={10} fontWeight={700} fontFamily="Inter,system-ui,sans-serif">
              {ds.name.length > 15 ? ds.name.slice(0, 14) + "…" : ds.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Workspace card ─────────────────────────────────────────────────────────────
const WS_COLORS = [
  { from: "#6366F1", to: "#4F46E5", light: "#EEF2FF" },
  { from: "#0EA5E9", to: "#0284C7", light: "#F0F9FF" },
  { from: "#10B981", to: "#059669", light: "#ECFDF5" },
  { from: "#F59E0B", to: "#D97706", light: "#FFFBEB" },
  { from: "#EC4899", to: "#DB2777", light: "#FFF0F6" },
  { from: "#8B5CF6", to: "#7C3AED", light: "#F5F3FF" },
];

function wsColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffffff;
  return WS_COLORS[h % WS_COLORS.length];
}

function WorkspaceCard({ ws, onOpen }: { ws: Workspace; onOpen: () => void }) {
  const color = wsColor(ws.name);

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

  return (
    <div
      onClick={onOpen}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        transition: "box-shadow 0.15s, transform 0.15s",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLDivElement).style.transform = ""; }}
    >
      {/* Header con gradiente */}
      <div style={{ background: `linear-gradient(135deg, ${color.from}, ${color.to})`, padding: "18px 20px 14px", position: "relative" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "rgba(255,255,255,0.25)", position: "absolute", right: 16, top: 10, lineHeight: 1 }}>
          {ws.name.charAt(0).toUpperCase()}
        </div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "white" }}>{ws.name}</h3>
        {ws.description && (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ws.description}
          </p>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--color-border)" }}>
        {[
          { label: "datasets", value: datasets.length },
          { label: "registros", value: totalRecords.toLocaleString() },
          { label: "columnas", value: totalCols },
        ].map((stat, i) => (
          <div key={i} style={{
            flex: 1, padding: "10px 0", textAlign: "center",
            borderRight: i < 2 ? "1px solid var(--color-border)" : "none",
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: color.from }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Mini schema */}
      <div style={{ padding: "10px 10px 6px" }}>
        <p style={{ margin: "0 0 6px 4px", fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.5px" }}>
          MAPA DE RELACIONES
        </p>
        <MiniSchema datasets={datasets} colQueries={colQueries} />
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 16px 12px", display: "flex", justifyContent: "flex-end" }}>
        <span style={{ fontSize: 12, color: color.from, fontWeight: 600 }}>
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
    <div style={{ padding: "80px", textAlign: "center", color: "var(--color-text-muted)" }}>
      Cargando workspaces…
    </div>
  );

  return (
    <div>
      {/* Resumen global */}
      <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
        {[
          { icon: "", label: "Workspaces", value: workspaces.length, color: "#6366F1" },
          { icon: "", label: "Datasets totales", value: totalDatasets, color: "#0EA5E9" },
        ].map((s, i) => (
          <div key={i} style={{
            flex: "1 1 160px", background: "var(--color-surface)",
            border: "1px solid var(--color-border)", borderRadius: 12,
            padding: "16px 20px", display: "flex", alignItems: "center", gap: 14,
          }}>
            <span style={{ fontSize: 28 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Título sección */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Todos los workspaces</h2>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Haz clic en un workspace para abrirlo
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
        {workspaces.map((ws) => (
          <WorkspaceCard key={ws.id} ws={ws} onOpen={() => handleOpen(ws)} />
        ))}

        {/* Card "Nuevo workspace" */}
        {!creating ? (
          <div
            onClick={() => setCreating(true)}
            style={{
              background: "var(--color-surface)",
              border: "2px dashed var(--color-border)",
              borderRadius: 14,
              overflow: "hidden",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              minHeight: 200,
              transition: "border-color 0.15s, box-shadow 0.15s",
              color: "var(--color-text-muted)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "#6366F1";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(99,102,241,0.12)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "var(--color-border)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: "linear-gradient(135deg, #6366F1, #4F46E5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, color: "white", fontWeight: 700,
            }}>＋</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text)" }}>Nuevo workspace</div>
              <div style={{ fontSize: 12, marginTop: 2 }}>Crea un equipo con sus propios datasets</div>
            </div>
          </div>
        ) : (
          <div style={{
            background: "var(--color-surface)",
            border: "2px solid #6366F1",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 4px 16px rgba(99,102,241,0.12)",
          }}>
            {/* Header igual que WorkspaceCard */}
            <div style={{ background: "linear-gradient(135deg, #6366F1, #4F46E5)", padding: "18px 20px 14px" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "rgba(255,255,255,0.25)", position: "absolute", right: 16, top: 10, lineHeight: 1 }}>＋</div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "white" }}>Nuevo workspace</h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>Completa los datos del equipo</p>
            </div>

            <form onSubmit={handleCreate} style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>
                  NOMBRE DEL EQUIPO *
                </label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ej. Ventas, Operaciones, RRHH…"
                  style={{
                    width: "100%", padding: "8px 10px", boxSizing: "border-box",
                    background: "var(--color-bg)", border: "1px solid var(--color-border)",
                    borderRadius: 6, color: "var(--color-text)", fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>
                  DESCRIPCIÓN
                </label>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Descripción opcional"
                  style={{
                    width: "100%", padding: "8px 10px", boxSizing: "border-box",
                    background: "var(--color-bg)", border: "1px solid var(--color-border)",
                    borderRadius: 6, color: "var(--color-text)", fontSize: 13,
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  type="submit"
                  disabled={saving || !newName.trim()}
                  style={{
                    flex: 1, padding: "8px", background: "#6366F1", border: "none",
                    borderRadius: 6, color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  }}
                >
                  {saving ? "Creando…" : "Crear workspace"}
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}
                  style={{
                    padding: "8px 12px", background: "transparent",
                    border: "1px solid var(--color-border)", borderRadius: 6,
                    color: "var(--color-text-muted)", cursor: "pointer", fontSize: 13,
                  }}
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

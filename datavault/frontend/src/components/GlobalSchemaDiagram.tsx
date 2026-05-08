import { useRef } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition } from "../types";

interface Props { onClose: () => void; workspaceId?: string; workspaceName?: string }

// ── FK helpers ────────────────────────────────────────────────────────────────
function normalize(s: string) { return s.toLowerCase().replace(/\s+/g, "_"); }
function keyword(s: string) {
  const parts = normalize(s).split("_");
  return parts[parts.length - 1];
}

// ── Layout constants ──────────────────────────────────────────────────────────
const BOX_W    = 220;
const HEADER_H = 36;
const ROW_H    = 20;
const BOX_PAD  = 10;
const COL_GAP  = 110;
const ROW_GAP  = 28;
const MARGIN   = 44;
const MAX_COLS = 8;

const TYPE_COLOR: Record<string, string> = {
  text: "#718096", number: "#3182ce", date: "#805ad5", enum: "#d69e2e",
};

const BOX_PALETTE = [
  "#009A44","#3B82F6","#F5821F","#8B5CF6","#0EA5E9",
  "#EC4899","#14B8A6","#F59E0B","#6366F1","#10B981",
];

function boxH(cols: ColumnDefinition[]) {
  const rows = Math.min(cols.length, MAX_COLS);
  return HEADER_H + rows * ROW_H + BOX_PAD + (cols.length > MAX_COLS ? ROW_H : 0);
}

// ── Topological layering ──────────────────────────────────────────────────────
// Returns layerIndex[] in same order as `ids`
function assignLayers(
  ids: string[],
  edges: { from: string; to: string }[],
): number[] {
  // Build in-degree and adjacency
  const inDeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const { from, to } of edges) {
    if (inDeg.has(from) && inDeg.has(to)) {
      adj.get(from)!.push(to);
      inDeg.set(to, (inDeg.get(to) ?? 0) + 1);
    }
  }
  // BFS topological-level assignment
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  const queue: string[] = [];
  inDeg.forEach((d, id) => { if (d === 0) queue.push(id); });
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    for (const nxt of (adj.get(cur) ?? [])) {
      const newL = (layer.get(cur) ?? 0) + 1;
      if (newL > (layer.get(nxt) ?? 0)) layer.set(nxt, newL);
      inDeg.set(nxt, (inDeg.get(nxt) ?? 0) - 1);
      if (inDeg.get(nxt) === 0) queue.push(nxt);
    }
  }
  return ids.map((id) => layer.get(id) ?? 0);
}

// ── SVG table box ─────────────────────────────────────────────────────────────
function TableBox({
  x, y, name, columns, accent,
}: {
  x: number; y: number; name: string;
  columns: ColumnDefinition[]; accent: string;
}) {
  const h = boxH(columns);
  const colLimit = Math.min(columns.length, MAX_COLS);

  return (
    <g>
      <rect x={x + 3} y={y + 3} width={BOX_W} height={h} rx={7} fill="rgba(0,0,0,0.07)" />
      <rect x={x} y={y} width={BOX_W} height={h} rx={7} fill="white"
        stroke={accent} strokeWidth={1.8} />
      {/* Header */}
      <rect x={x} y={y} width={BOX_W} height={HEADER_H} rx={7} fill={accent} />
      <rect x={x} y={y + HEADER_H - 7} width={BOX_W} height={7} fill={accent} />
      <text x={x + BOX_W / 2} y={y + HEADER_H / 2 + 5}
        textAnchor="middle" fill="white" fontSize={12} fontWeight={700}
        fontFamily="Inter,system-ui,sans-serif">
        {name.length > 22 ? name.slice(0, 21) + "…" : name}
      </text>

      {/* Column rows */}
      {columns.slice(0, colLimit).map((col, i) => {
        const cy = y + HEADER_H + i * ROW_H + ROW_H / 2 + 4;
        const isFk = col.field_key.startsWith("id_");
        return (
          <g key={col.id}>
            {i % 2 === 1 && (
              <rect x={x + 1} y={y + HEADER_H + i * ROW_H + 1}
                width={BOX_W - 2} height={ROW_H} fill="#F9FAFB" />
            )}
            <text x={x + (isFk ? 26 : 12)} y={cy} fontSize={11}
              fill={isFk ? "#9A3412" : "#374151"}
              fontFamily="Inter,system-ui,sans-serif">
              {col.field_key.length > 20 ? col.field_key.slice(0, 19) + "…" : col.field_key}
            </text>
            {isFk && (
              <text x={x + 13} y={cy} fontSize={9} fill="#F5821F" fontWeight={700}>FK</text>
            )}
            <text x={x + BOX_W - 10} y={cy} textAnchor="end" fontSize={10}
              fill={TYPE_COLOR[col.data_type] ?? "#9CA3AF"} fontWeight={600}
              fontFamily="Inter,system-ui,sans-serif">
              {col.data_type}
            </text>
          </g>
        );
      })}
      {columns.length > MAX_COLS && (
        <text x={x + BOX_W / 2} y={y + HEADER_H + colLimit * ROW_H + 7}
          textAnchor="middle" fontSize={10} fill="#9CA3AF"
          fontFamily="Inter,system-ui,sans-serif">
          +{columns.length - MAX_COLS} más
        </text>
      )}
    </g>
  );
}

// ── Bezier arrow between two boxes ────────────────────────────────────────────
function Arrow({
  x1, y1, x2, y2, label, color,
}: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; color: string;
}) {
  const dx = x2 - x1;
  const mx = x1 + dx * 0.5;
  const d = `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
  const lx = (x1 + x2) / 2;
  const ly = (y1 + y2) / 2;

  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={1.7} opacity={0.65}
        markerEnd={`url(#arr-${color.replace("#", "")})`} />
      {/* mid label */}
      <rect x={lx - 34} y={ly - 10} width={68} height={17}
        rx={8} fill="white" stroke={color} strokeWidth={1} opacity={0.9} />
      <text x={lx} y={ly + 4} textAnchor="middle" fontSize={9.5}
        fill={color} fontWeight={600} fontFamily="Inter,system-ui,sans-serif">
        {label.length > 13 ? label.slice(0, 12) + "…" : label}
      </text>
    </g>
  );
}

// ── Download PNG ──────────────────────────────────────────────────────────────
function downloadPng(svgEl: SVGSVGElement, name: string) {
  const { width, height } = svgEl.viewBox.baseVal;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale; canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#F4F6F9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);

  const src = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement("a");
    a.download = `${name}-schema.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };
  img.src = url;
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function GlobalSchemaDiagram({ onClose, workspaceId, workspaceName }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const { data: datasets = [], isLoading: loadingDs } = useQuery({
    queryKey: ["datasets", workspaceId ?? "all"],
    queryFn: () => getDatasets(workspaceId ? { workspace_id: workspaceId } : undefined),
  });

  const colQueries = useQueries({
    queries: datasets.map((ds) => ({
      queryKey: ["columns", ds.id],
      queryFn: () => getColumns(ds.id),
      staleTime: 60_000,
    })),
  });

  const allLoaded = !loadingDs && colQueries.every((q) => !q.isLoading);

  // Build columns map
  const colsMap = new Map<string, ColumnDefinition[]>(
    datasets.map((ds, i) => [ds.id, colQueries[i]?.data ?? []])
  );

  // Detect FK edges: child-ds → parent-ds (child has id_<kw> that matches parent keyword)
  const edges: { from: string; to: string; fkKey: string; color: string }[] = [];
  datasets.forEach((ds) => {
    const cols = colsMap.get(ds.id) ?? [];
    cols.filter((c) => c.field_key.startsWith("id_")).forEach((c) => {
      const refKw = c.field_key.slice(3);
      const parent = datasets.find((d) =>
        d.id !== ds.id && (
          keyword(d.name) === refKw ||
          normalize(d.name) === refKw ||
          normalize(d.name).endsWith(`_${refKw}`) ||
          normalize(d.name).startsWith(`${refKw}_`)
        )
      );
      if (parent && !edges.find((e) => e.from === ds.id && e.to === parent.id)) {
        edges.push({ from: ds.id, to: parent.id, fkKey: c.field_key, color: "#888" });
      }
    });
  });

  // Assign colors per dataset
  const accentMap = new Map<string, string>(
    datasets.map((ds, i) => [ds.id, BOX_PALETTE[i % BOX_PALETTE.length]])
  );
  edges.forEach((e) => { e.color = accentMap.get(e.from) ?? "#888"; });

  // Topological layer assignment (parents at layer 0, children deeper)
  // We reverse edge direction for layer calc: parent → child means parent is layer 0
  const reverseEdges = edges.map((e) => ({ from: e.to, to: e.from }));
  const layers = assignLayers(datasets.map((d) => d.id), reverseEdges);
  const maxLayer = Math.max(0, ...layers);

  // Group by layer
  const byLayer: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  datasets.forEach((ds, i) => byLayer[layers[i]].push(ds.id));

  // Compute per-box (x, y) positions
  // x = layer * (BOX_W + COL_GAP) + MARGIN
  // y = MARGIN + sum of previous box heights in same layer
  const posMap = new Map<string, { x: number; y: number }>();
  byLayer.forEach((layerIds, layerIdx) => {
    let curY = MARGIN;
    layerIds.forEach((id) => {
      posMap.set(id, {
        x: MARGIN + layerIdx * (BOX_W + COL_GAP),
        y: curY,
      });
      curY += boxH(colsMap.get(id) ?? []) + ROW_GAP;
    });
  });

  // SVG canvas size
  const svgW = MARGIN * 2 + (maxLayer + 1) * (BOX_W + COL_GAP) - COL_GAP;
  const maxH = byLayer.reduce((m, ids) => {
    const h = ids.reduce((s, id) => s + boxH(colsMap.get(id) ?? []) + ROW_GAP, MARGIN * 2);
    return Math.max(m, h);
  }, 400);

  // Unique arrow colors for defs
  const arrowColors = [...new Set(edges.map((e) => e.color))];

  return (
    <div className="schema-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="schema-modal" style={{ maxWidth: 1280 }}>
        {/* Header */}
        <div className="schema-header">
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              Diagrama de relaciones
              {workspaceName && (
                <span style={{
                  marginLeft: 10, fontSize: 12, fontWeight: 600,
                  background: "#3B82F620", color: "#3B82F6",
                  padding: "2px 10px", borderRadius: 99, border: "1px solid #3B82F640",
                }}>
                  {workspaceName}
                </span>
              )}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
              {datasets.length} tabla{datasets.length !== 1 ? "s" : ""}
              {edges.length > 0 && ` · ${edges.length} relación${edges.length !== 1 ? "es" : ""} detectada${edges.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 13 }}
              onClick={() => svgRef.current && downloadPng(svgRef.current, "global")}>
              ⬇ Descargar PNG
            </button>
            <button className="btn btn-ghost" onClick={onClose}
              style={{ fontSize: 20, padding: "2px 8px", lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Legend */}
        <div className="schema-legend">
          {datasets.map((ds, i) => (
            <span key={ds.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span className="schema-legend-dot"
                style={{ background: BOX_PALETTE[i % BOX_PALETTE.length] }} />
              {ds.name}
            </span>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)" }}>
            Las flechas indican dirección de la FK (hijo → padre)
          </span>
        </div>

        {/* Diagram */}
        <div className="schema-body">
          {!allLoaded ? (
            <div style={{ padding: "64px", textAlign: "center", color: "var(--color-text-muted)" }}>
              Cargando diagrama…
            </div>
          ) : datasets.length === 0 ? (
            <div style={{ padding: "64px", textAlign: "center", color: "var(--color-text-muted)" }}>
              No hay datasets todavía.
            </div>
          ) : (
            <svg ref={svgRef} viewBox={`0 0 ${svgW} ${maxH}`}
              style={{ width: "100%", height: "auto", minHeight: Math.min(maxH, 580), display: "block" }}
              xmlns="http://www.w3.org/2000/svg">

              {/* Background */}
              <rect width={svgW} height={maxH} fill="#F4F6F9" />
              <defs>
                <pattern id="gdots" width={24} height={24} patternUnits="userSpaceOnUse">
                  <circle cx={12} cy={12} r={1} fill="#CBD5E0" opacity={0.5} />
                </pattern>
                {/* Arrow markers per color */}
                {arrowColors.map((c) => (
                  <marker key={c} id={`arr-${c.replace("#", "")}`}
                    markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill={c} opacity={0.8} />
                  </marker>
                ))}
              </defs>
              <rect width={svgW} height={maxH} fill="url(#gdots)" />

              {/* Layer label columns */}
              {byLayer.map((_, li) => (
                <text key={li}
                  x={MARGIN + li * (BOX_W + COL_GAP) + BOX_W / 2}
                  y={22}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#9CA3AF"
                  fontWeight={600}
                  fontFamily="Inter,system-ui,sans-serif"
                  letterSpacing={1}>
                  {li === 0 ? "MASTER" : li === maxLayer ? "DETALLE" : `NIVEL ${li}`}
                </text>
              ))}

              {/* Arrows (draw under boxes) */}
              {edges.map((edge, ei) => {
                const fp = posMap.get(edge.from);
                const tp = posMap.get(edge.to);
                if (!fp || !tp) return null;
                const fh = boxH(colsMap.get(edge.from) ?? []);
                const th = boxH(colsMap.get(edge.to) ?? []);
                const x1 = fp.x + BOX_W;
                const y1 = fp.y + fh / 2;
                const x2 = tp.x;
                const y2 = tp.y + th / 2;
                return (
                  <Arrow key={ei}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    label={edge.fkKey} color={edge.color} />
                );
              })}

              {/* Boxes */}
              {datasets.map((ds, i) => {
                const pos = posMap.get(ds.id);
                if (!pos) return null;
                return (
                  <TableBox key={ds.id}
                    x={pos.x} y={pos.y}
                    name={ds.name}
                    columns={colsMap.get(ds.id) ?? []}
                    accent={BOX_PALETTE[i % BOX_PALETTE.length]} />
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

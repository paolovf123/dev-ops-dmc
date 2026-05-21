import { useRef } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition } from "../types";

interface Props { onClose: () => void; workspaceId?: string; workspaceName?: string }

function normalize(s: string) { return s.toLowerCase().replace(/\s+/g, "_"); }
function keyword(s: string) {
  const parts = normalize(s).split("_");
  return parts[parts.length - 1];
}

// ── Layout ────────────────────────────────────────────────────────────────────
const BOX_W   = 252;
const HDR_H   = 42;
const ROW_H   = 24;
const BOX_PAD = 12;
const COL_GAP = 160;
const ROW_GAP = 44;
const MARGIN  = 52;
const MAX_R   = 8;

// ── Type styling ──────────────────────────────────────────────────────────────
const TYPE_SHORT: Record<string, string> = {
  text:"txt", long_text:"↕txt", url:"url", email:"mail", phone:"tel",
  number:"num", currency:"$", percent:"%", rating:"★",
  enum:"list", multiselect:"list+", boolean:"bool", date:"date", relation:"→",
};
const TYPE_FG: Record<string, string> = {
  text:"#64748B", long_text:"#475569", url:"#0891B2", email:"#0284C7", phone:"#0369A1",
  number:"#2563EB", currency:"#16A34A", percent:"#7C3AED", rating:"#D97706",
  enum:"#B45309", multiselect:"#C2410C", boolean:"#059669", date:"#7C3AED", relation:"#DB2777",
};
const TYPE_BG: Record<string, string> = {
  text:"#F1F5F9", long_text:"#F1F5F9", url:"#E0F2FE", email:"#E0F2FE", phone:"#DBEAFE",
  number:"#DBEAFE", currency:"#DCFCE7", percent:"#EDE9FE", rating:"#FEF3C7",
  enum:"#FEF9C3", multiselect:"#FEE2E2", boolean:"#DCFCE7", date:"#EDE9FE", relation:"#FCE7F3",
};

const PALETTE = [
  "#009A44","#3B82F6","#F5821F","#8B5CF6","#0EA5E9",
  "#EC4899","#14B8A6","#F59E0B","#6366F1","#10B981",
  "#EF4444","#06B6D4","#84CC16","#A855F7","#F97316",
];

function boxH(cols: ColumnDefinition[]) {
  return HDR_H + Math.min(cols.length, MAX_R) * ROW_H + BOX_PAD
    + (cols.length > MAX_R ? ROW_H : 0);
}

// ── Topological layering ──────────────────────────────────────────────────────
function assignLayers(ids: string[], edges: { from: string; to: string }[]) {
  const inDeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const adj   = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const { from, to } of edges) {
    if (inDeg.has(from) && inDeg.has(to)) {
      adj.get(from)!.push(to);
      inDeg.set(to, (inDeg.get(to) ?? 0) + 1);
    }
  }
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  const queue: string[] = [];
  inDeg.forEach((d, id) => { if (d === 0) queue.push(id); });
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    for (const nxt of (adj.get(cur) ?? [])) {
      const nL = (layer.get(cur) ?? 0) + 1;
      if (nL > (layer.get(nxt) ?? 0)) layer.set(nxt, nL);
      inDeg.set(nxt, (inDeg.get(nxt) ?? 0) - 1);
      if (inDeg.get(nxt) === 0) queue.push(nxt);
    }
  }
  return ids.map((id) => layer.get(id) ?? 0);
}

// ── Table box ─────────────────────────────────────────────────────────────────
function TableBox({ x, y, name, columns, accent }: {
  x: number; y: number; name: string;
  columns: ColumnDefinition[]; accent: string;
}) {
  const h = boxH(columns);
  const shown = Math.min(columns.length, MAX_R);
  const STRIPE = 5;

  return (
    <g>
      <rect x={x + 3} y={y + 3} width={BOX_W} height={h} rx={10}
        fill="rgba(0,0,0,0.07)" />
      <rect x={x} y={y} width={BOX_W} height={h} rx={10}
        fill="white" stroke="#E2E8F0" strokeWidth={1} />
      {/* left stripe */}
      <rect x={x} y={y} width={STRIPE} height={h} rx={10} fill={accent} />
      <rect x={x} y={y + 8} width={STRIPE} height={h - 16} fill={accent} />
      {/* header divider */}
      <line x1={x + STRIPE} y1={y + HDR_H} x2={x + BOX_W} y2={y + HDR_H}
        stroke="#E2E8F0" strokeWidth={1} />
      {/* table name */}
      <text x={x + STRIPE + 11} y={y + HDR_H / 2 + 5}
        fill={accent} fontSize={12.5} fontWeight={700}
        fontFamily="Inter,system-ui,sans-serif">
        {name.length > 23 ? name.slice(0, 22) + "…" : name}
      </text>
      {/* col count */}
      <rect x={x + BOX_W - 40} y={y + 12} width={32} height={17} rx={8}
        fill={accent + "22"} />
      <text x={x + BOX_W - 24} y={y + 24} textAnchor="middle"
        fontSize={9.5} fill={accent} fontWeight={700}
        fontFamily="Inter,system-ui,sans-serif">
        {columns.length}c
      </text>

      {/* column rows */}
      {columns.slice(0, shown).map((col, i) => {
        const ry = y + HDR_H + i * ROW_H;
        const cy = ry + ROW_H / 2 + 4;
        const isFk = col.field_key.startsWith("id_");
        const tShort = TYPE_SHORT[col.data_type] ?? col.data_type.slice(0, 4);
        const tFg = TYPE_FG[col.data_type] ?? "#64748B";
        const tBg = TYPE_BG[col.data_type] ?? "#F1F5F9";
        const bw = Math.max(tShort.length * 6.8 + 10, 28);

        return (
          <g key={col.id}>
            {i % 2 === 0 && (
              <rect x={x + STRIPE + 1} y={ry + 1} width={BOX_W - STRIPE - 2}
                height={ROW_H - 1} fill="#FAFBFC" />
            )}
            {isFk && (
              <rect x={x + STRIPE + 5} y={ry + 6} width={17} height={13}
                rx={3} fill="#FEF3C7" />
            )}
            {isFk && (
              <text x={x + STRIPE + 13.5} y={cy} textAnchor="middle"
                fontSize={8.5} fill="#D97706" fontWeight={700}
                fontFamily="Inter,system-ui,sans-serif">FK</text>
            )}
            <text x={x + STRIPE + (isFk ? 28 : 10)} y={cy}
              fontSize={11} fill={isFk ? "#92400E" : "#374151"}
              fontFamily="Inter,system-ui,sans-serif" fontWeight={isFk ? 600 : 400}>
              {col.field_key.length > 20
                ? col.field_key.slice(0, 19) + "…"
                : col.field_key}
            </text>
            <rect x={x + BOX_W - bw - 7} y={ry + 5}
              width={bw} height={ROW_H - 10} rx={4} fill={tBg} />
            <text x={x + BOX_W - bw / 2 - 7} y={cy}
              textAnchor="middle" fontSize={9}
              fill={tFg} fontWeight={700}
              fontFamily="Inter,system-ui,sans-serif">
              {tShort}
            </text>
          </g>
        );
      })}
      {columns.length > MAX_R && (
        <text x={x + BOX_W / 2} y={y + HDR_H + MAX_R * ROW_H + BOX_PAD - 2}
          textAnchor="middle" fontSize={10} fill="#94A3B8"
          fontFamily="Inter,system-ui,sans-serif">
          +{columns.length - MAX_R} más
        </text>
      )}
    </g>
  );
}

// ── Arrow with label near source ──────────────────────────────────────────────
function Arrow({ x1, y1, x2, y2, label, color, markerId }: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; color: string; markerId: string;
}) {
  const mx = x1 + (x2 - x1) * 0.5;
  const d = `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;

  // Label at ~22% of path — near source, safely in the gap
  const lx = 0.703 * x1 + 0.297 * x2;
  const ly = 0.844 * y1 + 0.156 * y2 - 16;
  const text = label.length > 15 ? label.slice(0, 14) + "…" : label;
  const pw = text.length * 6.5 + 14;

  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} opacity={0.6}
        markerEnd={`url(#${markerId})`} />
      <rect x={lx - pw / 2} y={ly - 10} width={pw} height={18}
        rx={9} fill="white" stroke={color} strokeWidth={1} opacity={0.93} />
      <text x={lx} y={ly + 3.5} textAnchor="middle"
        fontSize={9.5} fill={color} fontWeight={700}
        fontFamily="Inter,system-ui,sans-serif">
        {text}
      </text>
    </g>
  );
}

// ── PNG export ────────────────────────────────────────────────────────────────
function downloadPng(svgEl: SVGSVGElement, name: string) {
  const { width: W, height: H } = svgEl.viewBox.baseVal;
  const scale = 2;

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(W));
  clone.setAttribute("height", String(H));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#EFF2F7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);

  const src = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, W, H);
    URL.revokeObjectURL(url);
    const a = document.createElement("a");
    a.download = `${name}-schema.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };
  img.onerror = () => URL.revokeObjectURL(url);
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
  const colsMap = new Map<string, ColumnDefinition[]>(
    datasets.map((ds, i) => [ds.id, colQueries[i]?.data ?? []])
  );
  const accentMap = new Map<string, string>(
    datasets.map((ds, i) => [ds.id, PALETTE[i % PALETTE.length]])
  );

  // FK edges
  const edges: { from: string; to: string; fkKey: string; color: string }[] = [];
  datasets.forEach((ds) => {
    const cols = colsMap.get(ds.id) ?? [];
    cols.filter((c) => c.field_key.startsWith("id_")).forEach((c) => {
      const refKw = c.field_key.slice(3);
      const parent = datasets.find((d) =>
        d.id !== ds.id && (
          keyword(d.name) === refKw || normalize(d.name) === refKw ||
          normalize(d.name).endsWith(`_${refKw}`) || normalize(d.name).startsWith(`${refKw}_`)
        )
      );
      if (parent && !edges.find((e) => e.from === ds.id && e.to === parent.id)) {
        edges.push({ from: ds.id, to: parent.id, fkKey: c.field_key, color: accentMap.get(ds.id) ?? "#888" });
      }
    });
  });

  // Layer assignment
  const reverseEdges = edges.map((e) => ({ from: e.to, to: e.from }));
  const layers = assignLayers(datasets.map((d) => d.id), reverseEdges);
  const maxLayer = Math.max(0, ...layers);
  const byLayer: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  datasets.forEach((ds, i) => byLayer[layers[i]].push(ds.id));

  // Compute layer heights for vertical centering
  const layerContentH = byLayer.map((ids) =>
    ids.reduce((s, id) => s + boxH(colsMap.get(id) ?? []) + ROW_GAP, -ROW_GAP)
  );
  const maxLayerH = Math.max(300, ...layerContentH);
  const svgH = maxLayerH + MARGIN * 2 + 30; // +30 for column headers

  // Box positions — vertically centered per layer
  const posMap = new Map<string, { x: number; y: number }>();
  byLayer.forEach((ids, li) => {
    const totalH = layerContentH[li];
    let curY = MARGIN + 30 + Math.max(0, (maxLayerH - totalH) / 2);
    ids.forEach((id) => {
      posMap.set(id, { x: MARGIN + li * (BOX_W + COL_GAP), y: curY });
      curY += boxH(colsMap.get(id) ?? []) + ROW_GAP;
    });
  });

  const svgW = MARGIN * 2 + (maxLayer + 1) * (BOX_W + COL_GAP) - COL_GAP;

  // Unique arrow colors for defs
  const arrowColors = [...new Set(edges.map((e) => e.color))];

  const LAYER_LABELS = ["MASTER", "NIVEL 1", "NIVEL 2", "NIVEL 3", "DETALLE"];

  return (
    <div className="schema-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="schema-modal" style={{ maxWidth: 1300 }}>
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
              {edges.length > 0 && ` · ${edges.length} relación${edges.length !== 1 ? "es" : ""}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 13 }}
              onClick={() => svgRef.current && downloadPng(svgRef.current, workspaceName ?? "schema")}>
              ⬇ Descargar PNG
            </button>
            <button className="btn btn-ghost" onClick={onClose}
              style={{ fontSize: 20, padding: "2px 8px", lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Legend */}
        <div className="schema-legend" style={{ flexWrap: "wrap", gap: "6px 14px" }}>
          {datasets.map((ds, i) => (
            <span key={ds.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span className="schema-legend-dot"
                style={{ background: PALETTE[i % PALETTE.length] }} />
              <span style={{ fontSize: 12 }}>{ds.name}</span>
            </span>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)", flexShrink: 0 }}>
            Flechas: hijo → padre (FK)
          </span>
        </div>

        {/* Diagram */}
        <div className="schema-body">
          {!allLoaded ? (
            <div style={{ padding: 64, textAlign: "center", color: "var(--color-text-muted)" }}>
              Cargando diagrama…
            </div>
          ) : datasets.length === 0 ? (
            <div style={{ padding: 64, textAlign: "center", color: "var(--color-text-muted)" }}>
              No hay datasets todavía.
            </div>
          ) : (
            <svg ref={svgRef} viewBox={`0 0 ${svgW} ${svgH}`}
              style={{ width: "100%", height: "auto", minHeight: Math.min(svgH, 600), display: "block" }}
              xmlns="http://www.w3.org/2000/svg">

              <defs>
                <pattern id="gdots" width={28} height={28} patternUnits="userSpaceOnUse">
                  <circle cx={14} cy={14} r={1.2} fill="#C4CDD6" opacity={0.5} />
                </pattern>
                {arrowColors.map((c) => (
                  <marker key={c} id={`garr-${c.replace("#", "")}`}
                    markerWidth={9} markerHeight={9} refX={7} refY={4} orient="auto">
                    <path d="M0,0 L0,8 L9,4 z" fill={c} opacity={0.85} />
                  </marker>
                ))}
              </defs>

              <rect width={svgW} height={svgH} fill="#EFF2F7" />
              <rect width={svgW} height={svgH} fill="url(#gdots)" />

              {/* Layer column headers */}
              {byLayer.map((_, li) => {
                const lx = MARGIN + li * (BOX_W + COL_GAP) + BOX_W / 2;
                const label = li < LAYER_LABELS.length
                  ? LAYER_LABELS[li]
                  : li === maxLayer ? "DETALLE" : `NIVEL ${li}`;
                return (
                  <g key={li}>
                    <rect x={lx - 46} y={12} width={92} height={22} rx={11}
                      fill="rgba(255,255,255,0.7)" stroke="#CBD5E0" strokeWidth={1} />
                    <text x={lx} y={27} textAnchor="middle"
                      fontSize={10} fill="#64748B" fontWeight={700}
                      fontFamily="Inter,system-ui,sans-serif" letterSpacing={0.8}>
                      {label}
                    </text>
                  </g>
                );
              })}

              {/* Arrows (under boxes) */}
              {edges.map((edge, ei) => {
                const fp = posMap.get(edge.from);
                const tp = posMap.get(edge.to);
                if (!fp || !tp) return null;
                const fh = boxH(colsMap.get(edge.from) ?? []);
                const th = boxH(colsMap.get(edge.to) ?? []);
                // Count parallel edges between same source/dest layer to offset Y
                const sameLayerEdges = edges.filter((e) => {
                  const ep = posMap.get(e.from);
                  const etp = posMap.get(e.to);
                  return ep && etp && Math.abs(ep.x - fp.x) < 1 && Math.abs(etp.x - tp.x) < 1;
                });
                const edgeIdx = sameLayerEdges.indexOf(edge);
                const yOffset = (edgeIdx - (sameLayerEdges.length - 1) / 2) * 22;
                return (
                  <Arrow key={ei}
                    x1={fp.x + BOX_W} y1={fp.y + fh / 2 + yOffset}
                    x2={tp.x} y2={tp.y + th / 2 + yOffset}
                    label={edge.fkKey} color={edge.color}
                    markerId={`garr-${edge.color.replace("#", "")}`} />
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
                    accent={PALETTE[i % PALETTE.length]} />
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

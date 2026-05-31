import { useEffect, useRef, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition, Dataset } from "../types";
import RelationScanModal from "./RelationScanModal";
import { datasetMatchesRef } from "../utils/relations";
import { typeStyle, PALETTE, makeBoxH, downloadPng } from "../utils/diagram";

interface Props { onClose: () => void; workspaceId?: string; workspaceName?: string }

// ── Layout ────────────────────────────────────────────────────────────────────
const BOX_W   = 252;
const HDR_H   = 42;
const ROW_H   = 24;
const BOX_PAD = 12;
const COL_GAP = 160;
const ROW_GAP = 44;
const MARGIN  = 52;
const MAX_R   = 8;

const boxH = makeBoxH({ HDR_H, ROW_H, BOX_PAD, MAX_ROWS: MAX_R });

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
        const { short: tShort, fg: tFg, bg: tBg } = typeStyle(col.data_type);
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
function Arrow({ x1, y1, x2, y2, label, color, markerId, leftCard = "1", rightCard = "N", dashed = false }: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; color: string; markerId: string;
  leftCard?: string; rightCard?: string; dashed?: boolean;
}) {
  // (x1,y1) = lado padre. (x2,y2) = lado hija. Cardinalidad por defecto: 1:N.
  // Para N:N (vía bridge oculto) pasamos leftCard="N" rightCard="N" + dashed=true.
  const mx = x1 + (x2 - x1) * 0.5;
  const d = `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;

  const lx = 0.30 * x1 + 0.70 * x2;
  const ly = 0.30 * y1 + 0.70 * y2 - 14;
  const text = label.length > 18 ? label.slice(0, 17) + "…" : label;
  const pw = text.length * 6.5 + 14;

  const dirX = x2 >= x1 ? 1 : -1;
  const leftX = x1 + dirX * 22;
  const leftY = y1 - 12;
  const rightX = x2 - dirX * 22;
  const rightY = y2 - 12;

  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} opacity={0.65}
        strokeDasharray={dashed ? "6 4" : undefined}
        markerEnd={`url(#${markerId})`} />

      {/* Cardinalidad lado izquierdo */}
      <circle cx={leftX} cy={leftY + 4} r={9}
        fill={leftCard === "N" ? color : "white"}
        stroke={color} strokeWidth={1.4} />
      <text x={leftX} y={leftY + 7.5} textAnchor="middle"
        fontSize={10} fill={leftCard === "N" ? "white" : color} fontWeight={800}
        fontFamily="Inter,system-ui,sans-serif">{leftCard}</text>

      {/* Cardinalidad lado derecho */}
      <circle cx={rightX} cy={rightY + 4} r={9}
        fill={rightCard === "N" ? color : "white"}
        stroke={color} strokeWidth={1.4} />
      <text x={rightX} y={rightY + 7.5} textAnchor="middle"
        fontSize={10} fill={rightCard === "N" ? "white" : color} fontWeight={800}
        fontFamily="Inter,system-ui,sans-serif">{rightCard}</text>

      {/* Pill con nombre del campo FK */}
      <rect x={lx - pw / 2} y={ly - 10} width={pw} height={18}
        rx={9} fill="white" stroke={color} strokeWidth={1} opacity={0.95} />
      <text x={lx} y={ly + 3.5} textAnchor="middle"
        fontSize={9.5} fill={color} fontWeight={700}
        fontFamily="Inter,system-ui,sans-serif">
        {text}
      </text>
    </g>
  );
}

// ── Construcción de aristas (FK directas + N:N virtuales vía bridge) ──────────
type DiagramEdge = { from: string; to: string; fkKey: string; color: string; bridge?: string };

function buildEdges(
  datasets: Dataset[],
  allDatasets: Dataset[],
  colsMap: Map<string, ColumnDefinition[]>,
  bridgeIds: Set<string>,
  showBridges: boolean,
  accentMap: Map<string, string>,
): DiagramEdge[] {
  // Fuentes: (1) columnas relation con related_dataset_id; (2) columnas id_* cuyo
  // sufijo coincide con el nombre de otro dataset (auto-detectadas).
  const datasetById = new Map(datasets.map((d) => [d.id, d]));
  const edges: DiagramEdge[] = [];
  const seen = new Set<string>(); // dedupe por from+fkKey
  datasets.forEach((ds) => {
    for (const c of colsMap.get(ds.id) ?? []) {
      let parentId: string | undefined;
      if (c.data_type === "relation" && c.rules?.related_dataset_id) {
        if (datasetById.has(c.rules.related_dataset_id)) parentId = c.rules.related_dataset_id;
      } else if (c.field_key.startsWith("id_")) {
        const refKw = c.field_key.slice(3);
        parentId = datasets.find((d) => d.id !== ds.id && datasetMatchesRef(d.name, refKw))?.id;
      }
      if (parentId && parentId !== ds.id) {
        const key = `${ds.id}:${c.field_key}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ from: ds.id, to: parentId, fkKey: c.field_key, color: accentMap.get(ds.id) ?? "#888" });
        }
      }
    }
  });

  // Relaciones N:N virtuales: con bridge OCULTO, flecha directa entre los 2 datasets que conectaba.
  if (!showBridges) {
    const allById = new Map(allDatasets.map((d) => [d.id, d]));
    for (const bridge of allDatasets) {
      if (!bridge.is_bridge) continue;
      const relTargets: string[] = [];
      for (const c of colsMap.get(bridge.id) ?? []) {
        if (c.data_type === "relation" && c.rules?.related_dataset_id) {
          const tgt = c.rules.related_dataset_id;
          if (allById.get(tgt) && !bridgeIds.has(tgt) && !relTargets.includes(tgt)) relTargets.push(tgt);
        }
      }
      for (let i = 0; i < relTargets.length; i++) {
        for (let j = i + 1; j < relTargets.length; j++) {
          const a = relTargets[i], b = relTargets[j];
          if (!datasetById.has(a) || !datasetById.has(b)) continue;
          const key = `nn:${a}:${b}:${bridge.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push({ from: a, to: b, fkKey: `vía ${bridge.name}`, color: "#7C3AED", bridge: bridge.id });
        }
      }
    }
  }
  return edges;
}

// ── Posicionamiento de cajas (grid sin relaciones / capas + banda de aislados) ──
interface DiagramLayout {
  posMap: Map<string, { x: number; y: number }>;
  svgW: number;
  svgH: number;
  isolatedBandY: number | null; // Y del separador de la banda de aislados (o null)
}

function computeLayout(
  datasets: Dataset[],
  colsMap: Map<string, ColumnDefinition[]>,
  isolatedDs: Dataset[],
  byLayer: string[][],
  maxLayer: number,
  noRelations: boolean,
): DiagramLayout {
  const posMap = new Map<string, { x: number; y: number }>();
  let svgW: number;
  let svgH: number;
  let isolatedBandY: number | null = null;

  if (noRelations && datasets.length > 0) {
    // Grid layout: evita una columna vertical larguísima cuando no hay FKs.
    const gridCols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(datasets.length))));
    const numRows = Math.ceil(datasets.length / gridCols);
    const rowHeights: number[] = [];
    for (let r = 0; r < numRows; r++) {
      let maxH = 0;
      for (let c = 0; c < gridCols; c++) {
        const idx = r * gridCols + c;
        if (idx >= datasets.length) break;
        const h = boxH(colsMap.get(datasets[idx].id) ?? []);
        if (h > maxH) maxH = h;
      }
      rowHeights.push(maxH);
    }
    const rowYs: number[] = [];
    let curY = MARGIN;
    for (const rh of rowHeights) {
      rowYs.push(curY);
      curY += rh + ROW_GAP;
    }
    datasets.forEach((ds, i) => {
      posMap.set(ds.id, {
        x: MARGIN + (i % gridCols) * (BOX_W + COL_GAP),
        y: rowYs[Math.floor(i / gridCols)],
      });
    });
    svgW = MARGIN * 2 + gridCols * (BOX_W + COL_GAP) - COL_GAP;
    svgH = curY - ROW_GAP + MARGIN;
    return { posMap, svgW, svgH, isolatedBandY };
  }

  // Layer layout: columnas por nivel (MASTER → DETALLE) solo con conectados
  const layerContentH = byLayer.map((ids) =>
    ids.reduce((s, id) => s + boxH(colsMap.get(id) ?? []) + ROW_GAP, -ROW_GAP)
  );
  const maxLayerH = Math.max(300, ...layerContentH);
  const layeredH = maxLayerH + MARGIN + 30;

  byLayer.forEach((ids, li) => {
    let curY = MARGIN + 30 + Math.max(0, (maxLayerH - layerContentH[li]) / 2);
    ids.forEach((id) => {
      posMap.set(id, { x: MARGIN + li * (BOX_W + COL_GAP), y: curY });
      curY += boxH(colsMap.get(id) ?? []) + ROW_GAP;
    });
  });

  const layeredW = MARGIN * 2 + (maxLayer + 1) * (BOX_W + COL_GAP) - COL_GAP;

  // Datasets aislados → grilla en banda inferior, separados visualmente
  let isolatedH = 0;
  if (isolatedDs.length > 0) {
    const isoCols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(isolatedDs.length))));
    const isoRows = Math.ceil(isolatedDs.length / isoCols);
    const rowMaxH: number[] = [];
    for (let r = 0; r < isoRows; r++) {
      let mh = 0;
      for (let c = 0; c < isoCols; c++) {
        const idx = r * isoCols + c;
        if (idx >= isolatedDs.length) break;
        const h = boxH(colsMap.get(isolatedDs[idx].id) ?? []);
        if (h > mh) mh = h;
      }
      rowMaxH.push(mh);
    }
    const ISOLATED_BAND_GAP = 80; // separación entre el grafo y la banda
    const yStart = layeredH + ISOLATED_BAND_GAP;
    isolatedBandY = layeredH + ISOLATED_BAND_GAP / 2;
    const isoBandW = isoCols * (BOX_W + COL_GAP) - COL_GAP;
    const xOffset = Math.max(MARGIN, MARGIN + (layeredW - MARGIN * 2 - isoBandW) / 2);
    isolatedDs.forEach((ds, i) => {
      const row = Math.floor(i / isoCols);
      const rowY = yStart + rowMaxH.slice(0, row).reduce((s, h) => s + h + ROW_GAP, 0);
      posMap.set(ds.id, { x: xOffset + (i % isoCols) * (BOX_W + COL_GAP), y: rowY });
    });
    isolatedH = ISOLATED_BAND_GAP + rowMaxH.reduce((s, h) => s + h + ROW_GAP, 0) - ROW_GAP;
    svgW = Math.max(layeredW, MARGIN * 2 + isoBandW);
  } else {
    svgW = layeredW;
  }
  svgH = layeredH + isolatedH + MARGIN;
  return { posMap, svgW, svgH, isolatedBandY };
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function GlobalSchemaDiagram({ onClose, workspaceId, workspaceName }: Props) {
  const [showRelationScan, setShowRelationScan] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const { data: allDatasets = [], isLoading: loadingDs } = useQuery({
    queryKey: ["datasets", workspaceId ?? "all"],
    queryFn: () => getDatasets(workspaceId ? { workspace_id: workspaceId } : undefined),
  });

  // Toggle persistente para mostrar tablas intermedias en el diagrama
  const [showBridges, setShowBridges] = useState(() => localStorage.getItem("dv_show_bridges") === "1");
  useEffect(() => { localStorage.setItem("dv_show_bridges", showBridges ? "1" : "0"); }, [showBridges]);
  const bridgeIds = new Set(allDatasets.filter((d) => d.is_bridge).map((d) => d.id));
  const datasets = showBridges ? allDatasets : allDatasets.filter((d) => !d.is_bridge);

  // Cargamos columnas de TODOS los datasets (incluso bridges ocultos) para poder
  // computar las relaciones N:N virtuales cuando el toggle está apagado.
  const colQueries = useQueries({
    queries: allDatasets.map((ds) => ({
      queryKey: ["columns", ds.id],
      queryFn: () => getColumns(ds.id),
      staleTime: 60_000,
    })),
  });

  const allLoaded = !loadingDs && colQueries.every((q) => !q.isLoading);
  const colsMap = new Map<string, ColumnDefinition[]>(
    allDatasets.map((ds, i) => [ds.id, colQueries[i]?.data ?? []])
  );
  const accentMap = new Map<string, string>(
    datasets.map((ds, i) => [ds.id, PALETTE[i % PALETTE.length]])
  );

  // Aristas (FK directas + N:N virtuales vía bridge oculto) — lógica pura extraída.
  const edges = buildEdges(datasets, allDatasets, colsMap, bridgeIds, showBridges, accentMap);

  // Separar datasets conectados (participan en algún edge) vs aislados
  const connectedIds = new Set<string>();
  edges.forEach((e) => { connectedIds.add(e.from); connectedIds.add(e.to); });
  const connectedDs = datasets.filter((d) => connectedIds.has(d.id));
  const isolatedDs  = datasets.filter((d) => !connectedIds.has(d.id));

  // Layer assignment solo para los conectados
  const noRelations = edges.length === 0;
  const reverseEdges = edges.map((e) => ({ from: e.to, to: e.from }));
  const layersConn = assignLayers(connectedDs.map((d) => d.id), reverseEdges);
  const maxLayer = Math.max(0, ...layersConn);
  const byLayer: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  connectedDs.forEach((ds, i) => byLayer[layersConn[i]].push(ds.id));

  // Posicionamiento de cajas — lógica pura extraída.
  const { posMap, svgW, svgH, isolatedBandY } = computeLayout(
    datasets, colsMap, isolatedDs, byLayer, maxLayer, noRelations,
  );

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
            {allDatasets.some((d) => d.is_bridge) && (
              <label style={{
                display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                padding: "5px 10px", borderRadius: 6,
                background: showBridges ? "var(--color-primary-bg)" : "transparent",
                border: `1px solid ${showBridges ? "var(--color-primary)" : "var(--color-border)"}`,
                fontSize: 12, fontWeight: 600, color: showBridges ? "var(--color-primary)" : "var(--color-text-secondary)",
              }}>
                <input type="checkbox" checked={showBridges}
                  onChange={(e) => setShowBridges(e.target.checked)} />
                Tablas intermedias
              </label>
            )}
            <button className="btn btn-secondary" style={{ fontSize: 13, borderColor: "#7C3AED", color: "#7C3AED" }}
              onClick={() => setShowRelationScan(true)}>
              Detectar relaciones
            </button>
            <button className="btn btn-secondary" style={{ fontSize: 13 }}
              onClick={() => svgRef.current && downloadPng(svgRef.current, workspaceName ?? "schema")}>
              Descargar PNG
            </button>
            <button className="btn btn-ghost" onClick={onClose}
              style={{ fontSize: 20, padding: "2px 8px", lineHeight: 1 }}>×</button>
          </div>
        </div>

        <RelationScanModal
          open={showRelationScan}
          onClose={() => setShowRelationScan(false)}
          workspaceId={workspaceId}
        />

        {/* Legend */}
        <div className="schema-legend" style={{ flexWrap: "wrap", gap: "6px 14px" }}>
          {datasets.map((ds, i) => (
            <span key={ds.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span className="schema-legend-dot"
                style={{ background: PALETTE[i % PALETTE.length] }} />
              <span style={{ fontSize: 12 }}>{ds.name}</span>
            </span>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)",
            flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 16, height: 16, borderRadius: "50%",
                background: "#64748B", border: "1.4px solid #64748B",
                fontSize: 9, fontWeight: 800, color: "#fff",
              }}>N</span>
              ↔
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 16, height: 16, borderRadius: "50%",
                background: "#64748B", border: "1.4px solid #64748B",
                fontSize: 9, fontWeight: 800, color: "#fff",
              }}>N</span>
              relación
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <svg width="24" height="6" viewBox="0 0 24 6"><line x1="0" y1="3" x2="24" y2="3" stroke="#7C3AED" strokeWidth="2" strokeDasharray="4 3"/></svg>
              vía intermedia
            </span>
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
              {...(svgW >= 900
                ? { style: { width: "100%", height: "auto", minHeight: Math.min(svgH, 600), display: "block" } }
                : { width: svgW, height: svgH, style: { display: "block", margin: "0 auto" } })}
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

              {/* Layer column headers — solo cuando hay relaciones */}
              {!noRelations && byLayer.map((_, li) => {
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

              {/* Arrows (under boxes). Conexión: padre.right (center) → hija.left (fila FK).
                  Si es una relación N:N virtual (vía bridge oculto), ambos lados son N y se dibuja
                  con línea punteada. */}
              {edges.map((edge, ei) => {
                const fp = posMap.get(edge.from);
                const tp = posMap.get(edge.to);
                if (!fp || !tp) return null;
                const childCols = colsMap.get(edge.from) ?? [];
                const parentCols = colsMap.get(edge.to) ?? [];
                const parentH = boxH(parentCols);
                const childH  = boxH(childCols);
                const isNN = !!edge.bridge;

                // Para N:N: conectar centros de ambas cajas (no hay fila FK específica).
                // Para FK normal: padre.right (center) → hija.left (fila FK).
                let x1, y1, x2, y2;
                if (isNN) {
                  x1 = tp.x + BOX_W; y1 = tp.y + parentH / 2;
                  x2 = fp.x;         y2 = fp.y + childH / 2;
                } else {
                  const fkIdx = childCols.findIndex((c) => c.field_key === edge.fkKey);
                  const fkY = fkIdx >= 0 && fkIdx < MAX_R
                    ? fp.y + HDR_H + fkIdx * ROW_H + ROW_H / 2 + 2
                    : fp.y + childH / 2;
                  x1 = tp.x + BOX_W; y1 = tp.y + parentH / 2;
                  x2 = fp.x;         y2 = fkY;
                }

                // Modelo unificado N:N: todas las relaciones son arrays. Ambos lados "N".
                // Las flechas via bridge siguen siendo dashed para distinguirlas visualmente
                // (son "indirectas" vs columna relation directa).
                return (
                  <Arrow key={ei}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    label={edge.fkKey} color={edge.color}
                    markerId={`garr-${edge.color.replace("#", "")}`}
                    leftCard="N"
                    rightCard="N"
                    dashed={isNN} />
                );
              })}

              {/* Separador visual + label para banda de datasets aislados */}
              {isolatedBandY !== null && (
                <g>
                  <line x1={MARGIN} y1={isolatedBandY} x2={svgW - MARGIN} y2={isolatedBandY}
                    stroke="#CBD5E0" strokeWidth={1} strokeDasharray="6 5" />
                  <rect x={svgW / 2 - 88} y={isolatedBandY - 11} width={176} height={22} rx={11}
                    fill="rgba(255,255,255,0.95)" stroke="#CBD5E0" strokeWidth={1} />
                  <text x={svgW / 2} y={isolatedBandY + 4} textAnchor="middle"
                    fontSize={10} fill="#64748B" fontWeight={700}
                    fontFamily="Inter,system-ui,sans-serif" letterSpacing={1}>
                    SIN RELACIONES
                  </text>
                </g>
              )}

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

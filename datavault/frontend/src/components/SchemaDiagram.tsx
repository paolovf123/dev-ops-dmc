import { useRef } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition } from "../types";

interface Props {
  currentDatasetId: string;
  currentDatasetName: string;
  currentColumns: ColumnDefinition[];
  onClose: () => void;
}

// ── FK detection (mirrors RelatedDatasets) ────────────────────────────────────
function normalize(name: string) { return name.toLowerCase().replace(/\s+/g, "_"); }
function keyword(name: string) {
  const parts = normalize(name).split("_");
  return parts[parts.length - 1];
}

// ── Layout constants ──────────────────────────────────────────────────────────
const BOX_W = 230;
const HEADER_H = 38;
const ROW_H = 22;
const BOX_PAD = 10;
const GAP_Y = 24;
const COL_GAP = 100;     // horizontal gap between columns
const MARGIN = 40;

const TYPE_COLORS: Record<string, string> = {
  text: "#718096",
  number: "#3182ce",
  date: "#805ad5",
  enum: "#d69e2e",
};

// ── SVG box for one table ─────────────────────────────────────────────────────
function TableBox({
  x, y, name, columns, isCurrent, accent,
}: {
  x: number; y: number; name: string; columns: ColumnDefinition[];
  isCurrent?: boolean; accent?: string;
}) {
  const headerColor = isCurrent ? "#009A44"
    : accent === "parent" ? "#3B82F6"
    : accent === "child" ? "#F5821F"
    : "#6B7280";

  const height = HEADER_H + columns.length * ROW_H + BOX_PAD;
  const colLimit = Math.min(columns.length, 10);

  return (
    <g>
      {/* Shadow */}
      <rect x={x + 3} y={y + 3} width={BOX_W} height={height}
        rx={8} fill="rgba(0,0,0,0.08)" />
      {/* Box */}
      <rect x={x} y={y} width={BOX_W} height={height}
        rx={8} fill="white" stroke={headerColor} strokeWidth={isCurrent ? 2.5 : 1.5} />
      {/* Header */}
      <rect x={x} y={y} width={BOX_W} height={HEADER_H}
        rx={8} fill={headerColor} />
      <rect x={x} y={y + HEADER_H - 8} width={BOX_W} height={8} fill={headerColor} />
      {/* Table name */}
      <text x={x + BOX_W / 2} y={y + HEADER_H / 2 + 5}
        textAnchor="middle" fill="white" fontSize={13} fontWeight={700}
        fontFamily="Inter, system-ui, sans-serif"
        style={{ letterSpacing: 0.2 }}>
        {name.length > 22 ? name.slice(0, 21) + "…" : name}
      </text>

      {/* Columns */}
      {columns.slice(0, colLimit).map((col, i) => {
        const cy = y + HEADER_H + i * ROW_H + ROW_H / 2 + 5;
        const isFk = col.field_key.startsWith("id_");
        return (
          <g key={col.id}>
            {/* Alternating row bg */}
            {i % 2 === 1 && (
              <rect x={x + 1} y={y + HEADER_H + i * ROW_H + 1}
                width={BOX_W - 2} height={ROW_H} fill="#F9FAFB" />
            )}
            {/* FK indicator */}
            {isFk && (
              <text x={x + 14} y={cy} fontSize={10} fill="#F5821F" fontWeight={700}>🔑</text>
            )}
            {/* Field name */}
            <text x={x + (isFk ? 28 : 14)} y={cy}
              fontSize={11.5} fill="#374151" fontFamily="Inter, system-ui, sans-serif">
              {col.field_key.length > 20 ? col.field_key.slice(0, 19) + "…" : col.field_key}
            </text>
            {/* Type badge */}
            <text x={x + BOX_W - 12} y={cy} fontSize={10}
              fill={TYPE_COLORS[col.data_type] ?? "#6B7280"}
              textAnchor="end" fontFamily="Inter, system-ui, sans-serif" fontWeight={600}>
              {col.data_type}
            </text>
          </g>
        );
      })}

      {/* "…more" truncation */}
      {columns.length > colLimit && (
        <text x={x + BOX_W / 2} y={y + HEADER_H + colLimit * ROW_H + 6}
          textAnchor="middle" fontSize={11} fill="#9CA3AF" fontFamily="Inter, system-ui, sans-serif">
          +{columns.length - colLimit} más…
        </text>
      )}
    </g>
  );
}

// ── Bezier connection line ────────────────────────────────────────────────────
function Connection({
  x1, y1, x2, y2, label, color,
}: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; color: string;
}) {
  const mx = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  const lx = mx;
  const ly = (y1 + y2) / 2;

  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={1.8}
        strokeDasharray={label.startsWith("id_") ? "none" : "5,3"} opacity={0.7} />
      {/* Arrow at target */}
      <polygon
        points={`${x2},${y2} ${x2 - 8},${y2 - 4} ${x2 - 8},${y2 + 4}`}
        fill={color} opacity={0.8} />
      {/* FK label pill */}
      <rect x={lx - 36} y={ly - 10} width={72} height={18}
        rx={9} fill="white" stroke={color} strokeWidth={1} />
      <text x={lx} y={ly + 4} textAnchor="middle"
        fontSize={10} fill={color} fontWeight={600}
        fontFamily="Inter, system-ui, sans-serif">
        {label.length > 12 ? label.slice(0, 11) + "…" : label}
      </text>
    </g>
  );
}

// ── Download SVG as PNG ───────────────────────────────────────────────────────
function downloadPng(svgEl: SVGSVGElement, name: string) {
  const serializer = new XMLSerializer();
  let src = serializer.serializeToString(svgEl);
  // embed font style inline so canvas renders text
  src = src.replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg"`);

  const { width, height } = svgEl.viewBox.baseVal;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#F4F6F9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);

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

// ── Main component ────────────────────────────────────────────────────────────
export default function SchemaDiagram({
  currentDatasetId, currentDatasetName, currentColumns, onClose,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const curKw = keyword(currentDatasetName);

  const { data: allDatasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });
  const otherDatasets = allDatasets.filter((d) => d.id !== currentDatasetId);

  const colQueries = useQueries({
    queries: otherDatasets.map((ds) => ({
      queryKey: ["columns", ds.id],
      queryFn: () => getColumns(ds.id),
      staleTime: 60_000,
    })),
  });

  // Detect parents (current has id_X → points to X)
  const parentRels = currentColumns
    .filter((c) => c.field_key.startsWith("id_"))
    .map((c) => {
      const refKw = c.field_key.slice(3);
      const ds = otherDatasets.find((d) =>
        keyword(d.name) === refKw || normalize(d.name) === refKw ||
        normalize(d.name).endsWith(`_${refKw}`) || normalize(d.name).startsWith(`${refKw}_`)
      );
      return ds ? { ds, fkKey: c.field_key } : null;
    })
    .filter(Boolean) as { ds: { id: string; name: string }; fkKey: string }[];

  // Detect children (other has id_<curKw> → points here)
  const childRels = otherDatasets
    .map((ds, i) => {
      const cols = colQueries[i]?.data ?? [];
      const fkCol = cols.find(
        (c) => c.field_key === `id_${curKw}` || c.field_key.includes(curKw)
      );
      return fkCol ? { ds, fkKey: fkCol.field_key } : null;
    })
    .filter(Boolean) as { ds: { id: string; name: string }; fkKey: string }[];

  // Fetch columns for all related datasets for display in boxes
  const relatedIds = [
    ...parentRels.map((r) => r.ds.id),
    ...childRels.map((r) => r.ds.id),
  ];
  const relColQueries = useQueries({
    queries: relatedIds.map((id) => ({
      queryKey: ["columns", id],
      queryFn: () => getColumns(id),
      staleTime: 60_000,
    })),
  });
  const relColsMap = new Map<string, ColumnDefinition[]>(
    relatedIds.map((id, i) => [id, relColQueries[i]?.data ?? []])
  );

  const isLoading = colQueries.some((q) => q.isLoading) || relColQueries.some((q) => q.isLoading);

  // ── Layout: parents LEFT | current CENTER | children RIGHT ────────────────
  function boxHeight(cols: ColumnDefinition[]) {
    return HEADER_H + Math.min(cols.length, 10) * ROW_H + BOX_PAD +
      (cols.length > 10 ? ROW_H : 0);
  }

  function stackY(items: { cols: ColumnDefinition[] }[]) {
    let y = MARGIN;
    return items.map((it) => {
      const top = y;
      y += boxHeight(it.cols) + GAP_Y;
      return top;
    });
  }

  const parentItems = parentRels.map((r) => ({ cols: relColsMap.get(r.ds.id) ?? [] }));
  const childItems = childRels.map((r) => ({ cols: relColsMap.get(r.ds.id) ?? [] }));
  const curH = boxHeight(currentColumns);

  const parentYs = stackY(parentItems);
  const childYs = stackY(childItems);

  const totalParentH = parentItems.reduce((s, it) => s + boxHeight(it.cols) + GAP_Y, 0);
  const totalChildH = childItems.reduce((s, it) => s + boxHeight(it.cols) + GAP_Y, 0);
  const totalCenterH = curH;

  const svgH = Math.max(totalParentH, totalChildH, totalCenterH) + MARGIN * 2;

  const hasSiblings = parentRels.length > 0 || childRels.length > 0;
  const numCols = hasSiblings ? 3 : 1;
  const svgW = numCols === 1
    ? MARGIN * 2 + BOX_W
    : MARGIN + BOX_W + COL_GAP + BOX_W + COL_GAP + BOX_W + MARGIN;

  // Column X positions
  const colX = hasSiblings
    ? [MARGIN, MARGIN + BOX_W + COL_GAP, MARGIN + BOX_W * 2 + COL_GAP * 2]
    : [MARGIN];
  const centerX = hasSiblings ? colX[1] : colX[0];
  const centerY = MARGIN + Math.max(0, (svgH - MARGIN * 2 - curH) / 2);

  return (
    <div className="schema-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="schema-modal">
        {/* Header */}
        <div className="schema-header">
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Diagrama de relaciones</p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
              {currentDatasetName}
              {hasSiblings &&
                ` · ${parentRels.length} padre${parentRels.length !== 1 ? "s" : ""}, ${childRels.length} hijo${childRels.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 13 }}
              onClick={() => svgRef.current && downloadPng(svgRef.current, currentDatasetName)}>
              ⬇ Descargar PNG
            </button>
            <button className="btn btn-ghost" onClick={onClose}
              style={{ fontSize: 20, padding: "2px 8px", lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Legend */}
        <div className="schema-legend">
          <span><span className="schema-legend-dot" style={{ background: "#009A44" }} />Tabla actual</span>
          {parentRels.length > 0 && <span><span className="schema-legend-dot" style={{ background: "#3B82F6" }} />Tabla padre (referenciada)</span>}
          {childRels.length > 0 && <span><span className="schema-legend-dot" style={{ background: "#F5821F" }} />Tabla hija (referencia aquí)</span>}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)" }}>
            🔑 = clave foránea
          </span>
        </div>

        {/* Diagram */}
        <div className="schema-body">
          {isLoading ? (
            <div style={{ padding: "64px", textAlign: "center", color: "var(--color-text-muted)" }}>
              Cargando diagrama…
            </div>
          ) : (
            <svg ref={svgRef} viewBox={`0 0 ${svgW} ${svgH}`}
              style={{ width: "100%", height: "auto", minHeight: Math.min(svgH, 520) }}
              xmlns="http://www.w3.org/2000/svg">

              {/* Background */}
              <rect width={svgW} height={svgH} fill="#F4F6F9" />

              {/* Grid dots */}
              <defs>
                <pattern id="dots" width={24} height={24} patternUnits="userSpaceOnUse">
                  <circle cx={12} cy={12} r={1} fill="#CBD5E0" opacity={0.6} />
                </pattern>
              </defs>
              <rect width={svgW} height={svgH} fill="url(#dots)" />

              {/* Connection lines — PARENTS (center ← left) */}
              {parentRels.map((rel, i) => {
                const parentCenterY = parentYs[i] + boxHeight(parentItems[i].cols) / 2;
                const curCenterY = centerY + curH / 2;
                return (
                  <Connection key={rel.ds.id}
                    x1={colX[0] + BOX_W} y1={parentCenterY}
                    x2={centerX} y2={curCenterY}
                    label={rel.fkKey} color="#3B82F6" />
                );
              })}

              {/* Connection lines — CHILDREN (center → right) */}
              {childRels.map((rel, i) => {
                const childCenterY = childYs[i] + boxHeight(childItems[i].cols) / 2;
                const curCenterY = centerY + curH / 2;
                return (
                  <Connection key={rel.ds.id}
                    x1={centerX + BOX_W} y1={curCenterY}
                    x2={colX[2]} y2={childCenterY}
                    label={rel.fkKey} color="#F5821F" />
                );
              })}

              {/* Parent boxes */}
              {parentRels.map((rel, i) => (
                <TableBox key={rel.ds.id}
                  x={colX[0]} y={parentYs[i]}
                  name={rel.ds.name}
                  columns={relColsMap.get(rel.ds.id) ?? []}
                  accent="parent" />
              ))}

              {/* Current box */}
              <TableBox
                x={centerX} y={centerY}
                name={currentDatasetName}
                columns={currentColumns}
                isCurrent />

              {/* Child boxes */}
              {childRels.map((rel, i) => (
                <TableBox key={rel.ds.id}
                  x={colX[2]} y={childYs[i]}
                  name={rel.ds.name}
                  columns={relColsMap.get(rel.ds.id) ?? []}
                  accent="child" />
              ))}

              {/* No relations message */}
              {!hasSiblings && (
                <text x={svgW / 2} y={svgH - 24}
                  textAnchor="middle" fontSize={12} fill="#9CA3AF"
                  fontFamily="Inter, system-ui, sans-serif">
                  Sin tablas relacionadas detectadas
                </text>
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

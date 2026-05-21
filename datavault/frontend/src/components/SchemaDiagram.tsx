import { useRef } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition } from "../types";

interface Props {
  currentDatasetId: string;
  currentDatasetName: string;
  currentColumns: ColumnDefinition[];
  workspaceId?: string;
  onClose: () => void;
}

function normalize(name: string) { return name.toLowerCase().replace(/\s+/g, "_"); }
function keyword(name: string) {
  const parts = normalize(name).split("_");
  return parts[parts.length - 1];
}

// ── Layout ────────────────────────────────────────────────────────────────────
const BOX_W    = 268;
const HDR_H    = 44;
const ROW_H    = 26;
const BOX_PAD  = 14;
const GAP_Y    = 44;
const COL_GAP  = 188;
const MARGIN   = 52;
const MAX_ROWS = 10;

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

function boxH(cols: ColumnDefinition[]) {
  return HDR_H + Math.min(cols.length, MAX_ROWS) * ROW_H + BOX_PAD
    + (cols.length > MAX_ROWS ? ROW_H : 0);
}

// ── Table box ─────────────────────────────────────────────────────────────────
function TableBox({ x, y, name, columns, accent, isCurrent }: {
  x: number; y: number; name: string;
  columns: ColumnDefinition[]; accent: string; isCurrent?: boolean;
}) {
  const h = boxH(columns);
  const shown = Math.min(columns.length, MAX_ROWS);
  const STRIPE = 5;

  return (
    <g>
      {/* soft shadow */}
      <rect x={x + 3} y={y + 3} width={BOX_W} height={h} rx={10}
        fill="rgba(0,0,0,0.07)" />
      {/* card body */}
      <rect x={x} y={y} width={BOX_W} height={h} rx={10}
        fill="white" stroke={isCurrent ? accent : "#E2E8F0"}
        strokeWidth={isCurrent ? 2.5 : 1} />
      {/* left accent stripe */}
      <rect x={x} y={y} width={STRIPE} height={h} rx={10} fill={accent} />
      <rect x={x} y={y + 8} width={STRIPE} height={h - 16} fill={accent} />
      {/* header bg */}
      {isCurrent && (
        <rect x={x + STRIPE} y={y} width={BOX_W - STRIPE} height={HDR_H}
          rx={10} fill={accent + "18"} />
      )}
      {/* header divider */}
      <line x1={x + STRIPE} y1={y + HDR_H} x2={x + BOX_W} y2={y + HDR_H}
        stroke="#E2E8F0" strokeWidth={1} />
      {/* table name */}
      <text x={x + STRIPE + 12} y={y + HDR_H / 2 + 5}
        fill={accent} fontSize={13} fontWeight={700}
        fontFamily="Inter,system-ui,sans-serif">
        {name.length > 24 ? name.slice(0, 23) + "…" : name}
      </text>
      {/* column count badge */}
      <rect x={x + BOX_W - 42} y={y + 13} width={34} height={18} rx={9}
        fill={accent + "22"} />
      <text x={x + BOX_W - 25} y={y + 25} textAnchor="middle"
        fontSize={10} fill={accent} fontWeight={700}
        fontFamily="Inter,system-ui,sans-serif">
        {columns.length} col
      </text>

      {/* column rows */}
      {columns.slice(0, shown).map((col, i) => {
        const ry = y + HDR_H + i * ROW_H;
        const cy = ry + ROW_H / 2 + 4;
        const isFk = col.field_key.startsWith("id_");
        const tShort = TYPE_SHORT[col.data_type] ?? col.data_type.slice(0, 4);
        const tFg = TYPE_FG[col.data_type] ?? "#64748B";
        const tBg = TYPE_BG[col.data_type] ?? "#F1F5F9";
        const badgeW = Math.max(tShort.length * 7 + 10, 32);

        return (
          <g key={col.id}>
            {/* alternating row bg */}
            {i % 2 === 0 && (
              <rect x={x + STRIPE + 1} y={ry + 1} width={BOX_W - STRIPE - 2}
                height={ROW_H - 1} fill="#FAFBFC" />
            )}
            {/* FK icon */}
            {isFk && (
              <rect x={x + STRIPE + 6} y={ry + 6} width={18} height={14}
                rx={4} fill="#FEF3C7" />
            )}
            {isFk && (
              <text x={x + STRIPE + 15} y={cy} textAnchor="middle"
                fontSize={9} fill="#D97706" fontWeight={700}
                fontFamily="Inter,system-ui,sans-serif">FK</text>
            )}
            {/* field name */}
            <text x={x + STRIPE + (isFk ? 30 : 10)} y={cy}
              fontSize={11.5} fill={isFk ? "#92400E" : "#374151"}
              fontFamily="Inter,system-ui,sans-serif"
              fontWeight={isFk ? 600 : 400}>
              {col.field_key.length > 21
                ? col.field_key.slice(0, 20) + "…"
                : col.field_key}
            </text>
            {/* type badge */}
            <rect x={x + BOX_W - badgeW - 8} y={ry + 5}
              width={badgeW} height={ROW_H - 10} rx={5} fill={tBg} />
            <text x={x + BOX_W - badgeW / 2 - 8} y={cy}
              textAnchor="middle" fontSize={9.5}
              fill={tFg} fontWeight={700}
              fontFamily="Inter,system-ui,sans-serif">
              {tShort}
            </text>
          </g>
        );
      })}

      {/* overflow */}
      {columns.length > MAX_ROWS && (
        <text x={x + BOX_W / 2} y={y + HDR_H + MAX_ROWS * ROW_H + BOX_PAD - 2}
          textAnchor="middle" fontSize={10.5} fill="#94A3B8"
          fontFamily="Inter,system-ui,sans-serif">
          +{columns.length - MAX_ROWS} columnas más
        </text>
      )}
    </g>
  );
}

// ── Bezier connection with label near source ───────────────────────────────────
function Connection({
  x1, y1, x2, y2, label, color, markerId,
}: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; color: string; markerId: string;
}) {
  const mx = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;

  // Label at ~25% along bezier (near source)
  const lx = 0.703 * x1 + 0.297 * x2;
  const ly = 0.844 * y1 + 0.156 * y2 - 18;
  const text = label.length > 16 ? label.slice(0, 15) + "…" : label;
  const pw = text.length * 6.8 + 16;

  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={2} opacity={0.65}
        markerEnd={`url(#${markerId})`} />
      <rect x={lx - pw / 2} y={ly - 10} width={pw} height={19}
        rx={9} fill="white" stroke={color} strokeWidth={1.2} opacity={0.95} />
      <text x={lx} y={ly + 4} textAnchor="middle"
        fontSize={10} fill={color} fontWeight={700}
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

  // Clone and stamp explicit dimensions so the image renderer uses the full viewBox
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

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SchemaDiagram({
  currentDatasetId, currentDatasetName, currentColumns, workspaceId, onClose,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const curKw = keyword(currentDatasetName);

  const { data: allDatasets = [] } = useQuery({
    queryKey: ["datasets", workspaceId ?? "all"],
    queryFn: () => getDatasets(workspaceId ? { workspace_id: workspaceId } : undefined),
  });
  const otherDatasets = allDatasets.filter((d) => d.id !== currentDatasetId);

  const colQueries = useQueries({
    queries: otherDatasets.map((ds) => ({
      queryKey: ["columns", ds.id],
      queryFn: () => getColumns(ds.id),
      staleTime: 60_000,
    })),
  });

  // FK detection
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

  const childRels = otherDatasets
    .map((ds, i) => {
      const cols = colQueries[i]?.data ?? [];
      const fkCol = cols.find(
        (c) => c.field_key === `id_${curKw}` || c.field_key.includes(curKw)
      );
      return fkCol ? { ds, fkKey: fkCol.field_key } : null;
    })
    .filter(Boolean) as { ds: { id: string; name: string }; fkKey: string }[];

  const relatedIds = [...parentRels.map((r) => r.ds.id), ...childRels.map((r) => r.ds.id)];
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
  const hasSiblings = parentRels.length > 0 || childRels.length > 0;

  // ── Layout ────────────────────────────────────────────────────────────────
  const parentItems = parentRels.map((r) => ({ cols: relColsMap.get(r.ds.id) ?? [] }));
  const childItems  = childRels.map((r)  => ({ cols: relColsMap.get(r.ds.id) ?? [] }));
  const curH = boxH(currentColumns);

  function stackY(items: { cols: ColumnDefinition[] }[]) {
    let y = MARGIN;
    return items.map((it) => {
      const top = y;
      y += boxH(it.cols) + GAP_Y;
      return top;
    });
  }

  const parentYs = stackY(parentItems);
  const childYs  = stackY(childItems);

  const totalParentH = parentItems.reduce((s, it) => s + boxH(it.cols) + GAP_Y, 0);
  const totalChildH  = childItems.reduce((s, it)  => s + boxH(it.cols) + GAP_Y, 0);
  const svgH = Math.max(totalParentH, totalChildH, curH) + MARGIN * 2;

  const numCols = hasSiblings ? 3 : 1;
  const svgW = numCols === 1
    ? MARGIN * 2 + BOX_W
    : MARGIN + BOX_W + COL_GAP + BOX_W + COL_GAP + BOX_W + MARGIN;

  const colX = hasSiblings
    ? [MARGIN, MARGIN + BOX_W + COL_GAP, MARGIN + BOX_W * 2 + COL_GAP * 2]
    : [MARGIN];
  const centerX = hasSiblings ? colX[1] : colX[0];
  const centerY = MARGIN + Math.max(0, (svgH - MARGIN * 2 - curH) / 2);

  // Port Y for a column in a box
  function portY(boxTop: number, cols: ColumnDefinition[], fkKey: string) {
    const idx = cols.findIndex((c) => c.field_key === fkKey);
    if (idx < 0 || idx >= MAX_ROWS) return boxTop + boxH(cols) / 2;
    return boxTop + HDR_H + idx * ROW_H + ROW_H / 2 + 2;
  }

  const ACCENT_PARENT = "#3B82F6";
  const ACCENT_CHILD  = "#F5821F";
  const ACCENT_CUR    = "#009A44";

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
          <span><span className="schema-legend-dot" style={{ background: ACCENT_CUR }} />Tabla actual</span>
          {parentRels.length > 0 && <span><span className="schema-legend-dot" style={{ background: ACCENT_PARENT }} />Padre (referenciada)</span>}
          {childRels.length > 0 && <span><span className="schema-legend-dot" style={{ background: ACCENT_CHILD }} />Hija (referencia aquí)</span>}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)" }}>
            FK = clave foránea
          </span>
        </div>

        {/* Diagram */}
        <div className="schema-body">
          {isLoading ? (
            <div style={{ padding: 64, textAlign: "center", color: "var(--color-text-muted)" }}>
              Cargando diagrama…
            </div>
          ) : (
            <svg ref={svgRef} viewBox={`0 0 ${svgW} ${svgH}`}
              style={{ width: "100%", height: "auto", minHeight: Math.min(svgH, 540) }}
              xmlns="http://www.w3.org/2000/svg">

              <defs>
                <pattern id="sdots" width={28} height={28} patternUnits="userSpaceOnUse">
                  <circle cx={14} cy={14} r={1.2} fill="#C4CDD6" opacity={0.55} />
                </pattern>
                <marker id="arr-parent" markerWidth={9} markerHeight={9}
                  refX={7} refY={4} orient="auto">
                  <path d="M0,0 L0,8 L9,4 z" fill={ACCENT_PARENT} opacity={0.85} />
                </marker>
                <marker id="arr-child" markerWidth={9} markerHeight={9}
                  refX={7} refY={4} orient="auto">
                  <path d="M0,0 L0,8 L9,4 z" fill={ACCENT_CHILD} opacity={0.85} />
                </marker>
              </defs>

              {/* Background */}
              <rect width={svgW} height={svgH} fill="#EFF2F7" />
              <rect width={svgW} height={svgH} fill="url(#sdots)" />

              {/* Column headers */}
              {hasSiblings && (
                <>
                  {[
                    { label: "PADRES", x: colX[0] + BOX_W / 2, color: ACCENT_PARENT },
                    { label: "TABLA ACTUAL", x: centerX + BOX_W / 2, color: ACCENT_CUR },
                    { label: "HIJOS", x: colX[2] + BOX_W / 2, color: ACCENT_CHILD },
                  ].map(({ label, x, color }) => (
                    <g key={label}>
                      <rect x={x - 48} y={14} width={96} height={20} rx={10}
                        fill={color + "22"} />
                      <text x={x} y={28} textAnchor="middle"
                        fontSize={10} fill={color} fontWeight={700}
                        fontFamily="Inter,system-ui,sans-serif" letterSpacing={1}>
                        {label}
                      </text>
                    </g>
                  ))}
                </>
              )}

              {/* Parent connections */}
              {parentRels.map((rel, i) => {
                const parentCols = parentItems[i].cols;
                const py = parentYs[i] + boxH(parentCols) / 2;
                const cy = portY(centerY, currentColumns, rel.fkKey);
                return (
                  <Connection key={rel.ds.id}
                    x1={colX[0] + BOX_W} y1={py}
                    x2={centerX} y2={cy}
                    label={rel.fkKey} color={ACCENT_PARENT}
                    markerId="arr-parent" />
                );
              })}

              {/* Child connections */}
              {childRels.map((rel, i) => {
                const childCols = relColsMap.get(rel.ds.id) ?? [];
                const cy = portY(childYs[i], childCols, rel.fkKey);
                const srcY = centerY + curH / 2;
                return (
                  <Connection key={rel.ds.id}
                    x1={centerX + BOX_W} y1={srcY}
                    x2={colX[2]} y2={cy}
                    label={rel.fkKey} color={ACCENT_CHILD}
                    markerId="arr-child" />
                );
              })}

              {/* Parent boxes */}
              {parentRels.map((rel, i) => (
                <TableBox key={rel.ds.id}
                  x={colX[0]} y={parentYs[i]}
                  name={rel.ds.name}
                  columns={parentItems[i].cols}
                  accent={ACCENT_PARENT} />
              ))}

              {/* Current box */}
              <TableBox
                x={centerX} y={centerY}
                name={currentDatasetName}
                columns={currentColumns}
                accent={ACCENT_CUR}
                isCurrent />

              {/* Child boxes */}
              {childRels.map((rel, i) => (
                <TableBox key={rel.ds.id}
                  x={colX[2]} y={childYs[i]}
                  name={rel.ds.name}
                  columns={relColsMap.get(rel.ds.id) ?? []}
                  accent={ACCENT_CHILD} />
              ))}

              {!hasSiblings && (
                <text x={svgW / 2} y={svgH - 22}
                  textAnchor="middle" fontSize={12} fill="#94A3B8"
                  fontFamily="Inter,system-ui,sans-serif">
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

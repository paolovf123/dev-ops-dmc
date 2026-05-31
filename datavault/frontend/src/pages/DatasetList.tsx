import { useState, useEffect } from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { getDatasets, getColumns, getRecords } from "../api/datasets";
import ImportExcelModal from "../components/ImportExcelModal";
import EditDatasetModal from "../components/EditDatasetModal";
import TemplatePickerModal from "../components/TemplatePickerModal";
import { useNavigate } from "react-router-dom";
import GlobalSchemaDiagram from "../components/GlobalSchemaDiagram";
import RelationsManagerModal from "../components/RelationsManagerModal";
import RelationScanModal from "../components/RelationScanModal";
import AdminDashboard from "../components/AdminDashboard";
import { useAuth } from "../auth/AuthContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useToast } from "../components/Toast";
import { IcBuilding } from "../components/ui/icons";
import AppShell from "../components/chrome/AppShell";
import { Badge, Btn, Toggle } from "../components/ui/kit";
import {
  Search, Table2, FunctionSquare, MoreHorizontal, Plus,
  Network, Sparkles, LayoutGrid, Workflow,
} from "lucide-react";
import type { ColumnDefinition } from "../types";
import type { UseQueryResult } from "@tanstack/react-query";

interface Dataset { id: string; name: string; description?: string | null; is_bridge?: boolean; is_computed?: boolean }

// ── Helpers del mini-mapa de relaciones (preview inline) ──────────────────────
const BOX_COLORS = [
  "var(--accent-pri)", "var(--accent-rel)", "var(--accent-calc)", "#0fb583", "#8b3df0",
  "#f59e0b", "#14b8a6", "#6366f1", "#ec4899", "#0ea5e9",
];
function normKw(s: string) { return s.toLowerCase().replace(/\s+/g, "_"); }
function kw(s: string) { const p = normKw(s).split("_"); return p[p.length - 1]; }

type Kind = "real" | "calc" | "bridge";
function kindMeta(k: Kind): { color: string; soft: string } {
  if (k === "calc") return { color: "var(--accent-calc)", soft: "var(--calc-soft)" };
  if (k === "bridge") return { color: "var(--accent-rel)", soft: "var(--rel-soft)" };
  return { color: "var(--accent-pri)", soft: "var(--pri-soft)" };
}

function SchemaPreview({
  datasets, colQueries,
}: {
  datasets: Dataset[];
  colQueries: UseQueryResult<ColumnDefinition[]>[];
}) {
  const W = 148, H = 52, GAP_X = 76, GAP_Y = 22, MARGIN = 28, COLS = 4;
  const STRIPE = 4;

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

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="pdots" width={22} height={22} patternUnits="userSpaceOnUse">
          <circle cx={11} cy={11} r={1} fill="var(--border-strong)" opacity={0.5} />
        </pattern>
        <marker id="parr" markerWidth={7} markerHeight={7} refX={5} refY={3} orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill="var(--text-mute)" />
        </marker>
      </defs>
      <rect width={svgW} height={svgH} fill="url(#pdots)" />

      {edges.map((e, i) => {
        const fp = pos[e.fi], tp = pos[e.ti];
        if (!fp || !tp) return null;
        const x1 = fp.x + W, y1 = fp.y + H / 2;
        const x2 = tp.x, y2 = tp.y + H / 2;
        const mx = (x1 + x2) / 2;
        return <path key={i} d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
          fill="none" stroke="var(--accent-rel)" strokeWidth={1.5} opacity={0.5} markerEnd="url(#parr)" />;
      })}

      {datasets.map((ds, i) => {
        const { x, y } = pos[i];
        const color = BOX_COLORS[i % BOX_COLORS.length];
        const colCount = colQueries[i]?.data?.length ?? 0;
        const fkCount = (colQueries[i]?.data ?? []).filter(c => c.field_key.startsWith("id_")).length;
        return (
          <g key={ds.id}>
            <rect x={x} y={y} width={W} height={H} rx={9} fill="var(--surface)" stroke="var(--border)" strokeWidth={1} />
            <rect x={x} y={y} width={STRIPE} height={H} rx={9} fill={color} />
            <rect x={x} y={y + 7} width={STRIPE} height={H - 14} fill={color} />
            <text x={x + STRIPE + 9} y={y + 20}
              fill={color} fontSize={11} fontWeight={700} fontFamily="Inter,system-ui,sans-serif">
              {ds.name.length > 16 ? ds.name.slice(0, 15) + "…" : ds.name}
            </text>
            <line x1={x + STRIPE} y1={y + 27} x2={x + W} y2={y + 27} stroke="var(--border-soft)" strokeWidth={1} />
            <text x={x + STRIPE + 9} y={y + 42}
              fill="var(--text-mute)" fontSize={10} fontFamily="Inter,system-ui,sans-serif">
              {colCount} cols{fkCount > 0 ? `  ·  ${fkCount} FK` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Card de dataset (estilo handoff) ──────────────────────────────────────────
function SkeletonCard({ i = 0 }: { i?: number }) {
  return (
    <div className="og-rise" style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
      padding: 16, minHeight: 132, boxShadow: "var(--shadow-1)", animationDelay: `${i * 55}ms`,
    }}>
      <div className="og-shimmer" style={{ width: 40, height: 40, borderRadius: "var(--r-2)" }} />
      <div className="og-shimmer" style={{ width: "55%", height: 15, borderRadius: 5, marginTop: 14 }} />
      <div className="og-shimmer" style={{ width: "75%", height: 11, borderRadius: 5, marginTop: 9 }} />
      <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
        <div className="og-shimmer" style={{ width: 52, height: 20, borderRadius: 999 }} />
        <div className="og-shimmer" style={{ width: 64, height: 20, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function highlight(text: string, query: string) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="global-search-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function DatasetList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { current: workspace, setCurrent } = useWorkspace();
  const [showSchema, setShowSchema] = useState(false);
  const [showRelManager, setShowRelManager] = useState(false);
  const [showRelationScan, setShowRelationScan] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingDataset, setEditingDataset] = useState<{ id: string; name: string; description?: string | null; is_bridge?: boolean } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    if (isAdmin) setCurrent(null);
  }, []);

  const { data: datasets = [], isLoading } = useQuery({
    queryKey: ["datasets", workspace?.id ?? "all"],
    queryFn: () => getDatasets(workspace ? { workspace_id: workspace.id } : undefined),
  });

  const [showBridges, setShowBridges] = useState(() => localStorage.getItem("dv_show_bridges") === "1");
  useEffect(() => { localStorage.setItem("dv_show_bridges", showBridges ? "1" : "0"); }, [showBridges]);
  const bridgesCount = datasets.filter((d) => d.is_bridge).length;
  const visibleDatasets = showBridges ? datasets : datasets.filter((d) => !d.is_bridge);

  const colQueries = useQueries({
    queries: datasets.map((ds) => ({
      queryKey: ["columns", ds.id],
      queryFn: () => getColumns(ds.id),
      staleTime: 60_000,
    })),
  });

  const recQueries = useQueries({
    queries: datasets.map((ds) => ({
      queryKey: ["records", ds.id, "count"],
      queryFn: () => getRecords(ds.id, {}).then((r) => r.total),
      staleTime: 30_000,
    })),
  });

  const totalRecords = recQueries.reduce((sum, q) => sum + (typeof q.data === "number" ? q.data : 0), 0);
  const totalCols = colQueries.reduce((sum, q) => sum + (q.data?.length ?? 0), 0);

  // Búsqueda global
  const trimSearch = globalSearch.trim();
  const searchQueries = useQueries({
    queries: datasets.map((ds) => ({
      queryKey: ["records", ds.id, trimSearch],
      queryFn: () => getRecords(ds.id, { search: trimSearch, limit: 50 }),
      enabled: trimSearch.length >= 2,
      staleTime: 10_000,
    })),
  });

  const searchResults = trimSearch.length >= 2
    ? datasets.flatMap((ds, i) => {
        const hits = searchQueries[i]?.data?.data ?? [];
        return hits.slice(0, 5).map((rec) => ({ ds, rec }));
      }).slice(0, 30)
    : [];

  // ── Sin workspace asignado (no-admin) ──
  if (!isAdmin && !workspace) {
    return (
      <AppShell active="home">
        <main className="home-main">
          <div className="empty" style={{ marginTop: "var(--sp-12)" }}>
            <div className="empty__art"><IcBuilding size={28} /></div>
            <h4>Sin workspace asignado</h4>
            <p>Aún no perteneces a ningún workspace. Pide a un administrador que te agregue a uno.</p>
          </div>
        </main>
      </AppShell>
    );
  }

  // ── Admin en / → dashboard global ──
  if (isAdmin) {
    return (
      <AppShell active="home">
        <main className="home-main"><AdminDashboard /></main>
      </AppShell>
    );
  }

  const sectionTitle: React.CSSProperties = { font: "400 13px/1 var(--font-sans)", color: "var(--text-mute)", marginBottom: 14 };

  // ── Home de usuario: grid de datasets ──
  return (
    <>
      <AppShell active="home">
        <main className="home-main" style={{ overflowY: "auto", padding: 0 }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 32px 80px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
              <div>
                <h1 style={{ margin: 0, font: "700 28px/1.1 var(--font-sans)", letterSpacing: "-.02em", color: "var(--text)" }}>
                  {workspace ? workspace.name : "Datasets"}
                </h1>
                <p style={{ margin: "7px 0 0", font: "400 15px/1.4 var(--font-sans)", color: "var(--text-soft)", maxWidth: 520 }}>
                  {workspace?.description ?? "Convierte tus Excels en tablas relacionadas."}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {datasets.length > 1 && (
                  <Btn variant="soft" icon={<Sparkles size={16} />} onClick={() => setShowRelationScan(true)}>Detectar relaciones</Btn>
                )}
                <Btn variant="primary" icon={<Plus size={16} />} onClick={() => navigate("/create")}>Nuevo dataset</Btn>
              </div>
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 18px", flexWrap: "wrap" }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, height: 38, padding: "0 12px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", width: 280 }}>
                <Search size={16} style={{ color: "var(--text-mute)", flex: "none" }} />
                <input
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setGlobalSearch("")}
                  placeholder="Buscar dataset, registro…"
                  style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--text)", font: "400 13.5px/1 var(--font-sans)" }}
                />
              </div>
              {datasets.length > 0 && (
                <Btn variant="soft" size="sm" icon={<LayoutGrid size={15} />} onClick={() => setShowSchema(true)}>Diagrama</Btn>
              )}
              {datasets.length > 1 && (
                <Btn variant="soft" size="sm" icon={<Network size={15} />} onClick={() => setShowRelManager(true)}>Relaciones</Btn>
              )}
              <div style={{ flex: 1 }} />
              {bridgesCount > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, font: "500 13px/1 var(--font-sans)", color: "var(--text-soft)" }}>
                  <Workflow size={15} style={{ color: "var(--text-mute)" }} />
                  <span>Intermedias <span className="mono" style={{ color: "var(--text-mute)" }}>({bridgesCount})</span></span>
                  <Toggle on={showBridges} onChange={setShowBridges} />
                </div>
              )}
            </div>

            {/* Resultados de búsqueda global */}
            {trimSearch.length >= 2 && (
              <div className="global-search-results" style={{ maxWidth: 520, margin: "0 0 var(--sp-4)" }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-mute)" }}>
                    {searchQueries.some((q) => q.isLoading) ? "Buscando…" : "Sin resultados"}
                  </div>
                ) : (() => {
                  const grouped = new Map<string, typeof searchResults>();
                  for (const item of searchResults) {
                    const arr = grouped.get(item.ds.id) ?? [];
                    arr.push(item);
                    grouped.set(item.ds.id, arr);
                  }
                  return [...grouped.entries()].map(([dsId, items]) => (
                    <div key={dsId} className="global-search-group">
                      <div className="global-search-group-header">{items[0].ds.name}</div>
                      {items.map(({ rec, ds }) => {
                        const cols = colQueries[datasets.findIndex((d) => d.id === ds.id)]?.data ?? [];
                        const firstVal = cols
                          .map((c) => String(rec.data[c.field_key] ?? ""))
                          .find((v) => v.toLowerCase().includes(trimSearch.toLowerCase()));
                        const labelCol = cols[0];
                        const label = labelCol ? String(rec.data[labelCol.field_key] ?? "—") : rec.id;
                        return (
                          <button key={rec.id} className="global-search-item"
                            onClick={() => { navigate(`/datasets/${ds.id}`); setGlobalSearch(""); }}>
                            <span className="global-search-item-name">{highlight(label, trimSearch)}</span>
                            {firstVal && firstVal !== label && (
                              <span className="global-search-item-meta">{highlight(firstVal.slice(0, 40), trimSearch)}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Count line */}
            {!isLoading && (
              <div style={sectionTitle}>
                {visibleDatasets.length} dataset{visibleDatasets.length !== 1 ? "s" : ""} · {totalRecords.toLocaleString("es-PE")} filas · {totalCols} columnas
              </div>
            )}

            {/* Grid de cards */}
            {isLoading ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))", gap: 16 }}>
                {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} i={i} />)}
              </div>
            ) : visibleDatasets.length === 0 ? (
              <div className="empty">
                <div className="empty__art"><Table2 size={28} /></div>
                <h4>{datasets.length === 0 ? "Sin datasets todavía" : "Solo hay tablas intermedias"}</h4>
                <p>{datasets.length === 0 ? "Crea tu primer dataset para empezar." : "Usa el toggle de arriba para verlas."}</p>
                <button className="btn btn--primary" onClick={() => navigate("/create")}><Plus /> Nuevo dataset</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))", gap: 16 }}>
                {visibleDatasets.map((ds, idx) => {
                  const origIdx = datasets.indexOf(ds);
                  const cols = colQueries[origIdx]?.data ?? [];
                  const colCount = colQueries[origIdx]?.data?.length ?? null;
                  const recCount = recQueries[origIdx]?.data ?? null;
                  const relCount = cols.filter((c) => c.data_type === "relation").length;
                  const code = ds.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "DS";
                  const kind: Kind = ds.is_computed ? "calc" : ds.is_bridge ? "bridge" : "real";
                  const m = kindMeta(kind);
                  const Icon = ds.is_computed ? FunctionSquare : ds.is_bridge ? Workflow : Table2;

                  return (
                    <div key={ds.id} className="og-card og-rise" tabIndex={0} role="button"
                      onClick={() => navigate(`/datasets/${ds.id}`)}
                      onKeyDown={(e) => e.key === "Enter" && navigate(`/datasets/${ds.id}`)}
                      style={{
                        animationDelay: `${idx * 55}ms`,
                        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
                        padding: 16, cursor: "pointer", transition: "all var(--t-fast)", boxShadow: "var(--shadow-1)",
                        display: "flex", flexDirection: "column", minHeight: 132,
                      }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <span style={{
                          display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "var(--r-2)",
                          background: m.soft, color: m.color, border: `1px solid color-mix(in srgb, ${m.color} 26%, transparent)`,
                        }}><Icon size={21} /></span>
                        <button title={`Editar "${ds.name}"`}
                          onClick={(e) => { e.stopPropagation(); setEditingDataset({ id: ds.id, name: ds.name, description: ds.description, is_bridge: ds.is_bridge }); }}
                          style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "var(--r-2)", border: "none", background: "transparent", color: "var(--text-mute)", cursor: "pointer" }}>
                          <MoreHorizontal size={18} />
                        </button>
                      </div>

                      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ font: "600 16px/1.2 var(--font-sans)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.name}</span>
                        <span className="mono" style={{ font: "500 10.5px/1 var(--font-mono)", color: "var(--text-mute)", padding: "3px 5px", borderRadius: 5, background: "var(--surface-alt)", flex: "none" }}>{code}</span>
                      </div>
                      {ds.description && (
                        <div style={{ font: "400 12.5px/1.3 var(--font-sans)", color: "var(--text-mute)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.description}</div>
                      )}

                      <div style={{ flex: 1 }} />

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 13 }}>
                        <Badge tone="neutral">{colCount === null ? "—" : colCount} col</Badge>
                        <Badge tone="neutral">{recCount === null ? "—" : recCount.toLocaleString("es-PE")} filas</Badge>
                        {kind === "calc" && <Badge tone="calc" dot>calculado</Badge>}
                        {kind === "bridge" && <Badge tone="rel">intermedia</Badge>}
                        {relCount > 0 && kind !== "bridge" && <Badge tone="rel" dot>{relCount} rel</Badge>}
                      </div>
                    </div>
                  );
                })}

                {/* Card crear */}
                <button className="og-rise" onClick={() => navigate("/create")} style={{
                  animationDelay: `${visibleDatasets.length * 55}ms`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
                  minHeight: 132, borderRadius: "var(--r-3)", border: "1.5px dashed var(--border-strong)",
                  background: "transparent", cursor: "pointer", color: "var(--text-mute)", transition: "all var(--t-fast)",
                }}>
                  <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "var(--r-2)", border: "1.5px dashed var(--border-strong)" }}><Plus size={22} /></span>
                  <span style={{ font: "600 14px/1 var(--font-sans)" }}>Nuevo dataset</span>
                </button>
              </div>
            )}

            {/* Mapa de relaciones */}
            {!isLoading && datasets.length > 1 && (
              <div style={{ marginTop: 34 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <Network size={17} style={{ color: "var(--accent-rel)" }} />
                  <span style={{ font: "600 15px/1 var(--font-sans)", color: "var(--text)" }}>
                    Mapa de relaciones{workspace ? ` — ${workspace.name}` : ""}
                  </span>
                  <a href="#" onClick={(e) => { e.preventDefault(); setShowSchema(true); }}
                    style={{ marginLeft: "auto", font: "500 13px/1 var(--font-sans)", color: "var(--accent-pri)" }}>Ver completo →</a>
                </div>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", padding: "18px 20px", boxShadow: "var(--shadow-1)", overflow: "hidden" }}>
                  <SchemaPreview datasets={datasets} colQueries={colQueries} />
                </div>
              </div>
            )}
          </div>
        </main>
      </AppShell>

      {/* ── Modales ── */}
      {showSchema && (
        <GlobalSchemaDiagram onClose={() => setShowSchema(false)} workspaceId={workspace?.id} workspaceName={workspace?.name} />
      )}
      <RelationScanModal open={showRelationScan} onClose={() => setShowRelationScan(false)} workspaceId={workspace?.id} />
      <RelationsManagerModal open={showRelManager} onClose={() => setShowRelManager(false)} workspaceId={workspace?.id} />
      <EditDatasetModal open={!!editingDataset} onClose={() => setEditingDataset(null)} dataset={editingDataset} />
      <TemplatePickerModal open={showTemplates} onClose={() => setShowTemplates(false)} workspaceId={workspace?.id} />
      <ImportExcelModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        workspaceId={workspace?.id}
        onSuccess={(datasetId, datasetName, counts) => {
          qc.invalidateQueries({ queryKey: ["datasets"] });
          toast(`"${datasetName}" importado — ${counts.cols} cols, ${counts.rows} filas`, "success");
          navigate(`/datasets/${datasetId}`);
        }}
      />
    </>
  );
}

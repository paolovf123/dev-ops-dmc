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
import {
  Search, Table2, FunctionSquare, MoreHorizontal, Plus,
  Network, ScanSearch, LayoutGrid, Zap, Workflow,
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

// Variante de color del ícono de cada card (determinística por nombre)
const ICON_VARIANTS = ["", "is-rel", "is-mint", "is-violet"];
function iconVariant(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffffff;
  return ICON_VARIANTS[h % ICON_VARIANTS.length];
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

function SkeletonCard() {
  const bar = (w: string, h = 12) => (
    <div style={{ height: h, width: w, borderRadius: 4, background: "var(--surface-alt)" }} />
  );
  return (
    <div className="h-card" style={{ pointerEvents: "none" }}>
      <div className="h-card__head">
        <span className="h-card__icon" style={{ background: "var(--surface-alt)", color: "transparent" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {bar("55%", 14)}{bar("40%", 11)}
        </div>
      </div>
      <div className="h-card__stats">{bar("100%", 28)}</div>
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
        <main className="home-main">
          <AdminDashboard />
        </main>
      </AppShell>
    );
  }

  // ── Home de usuario: grid de datasets ──
  return (
    <>
      <AppShell active="home">
        <main className="home-main">
          {/* Header */}
          <div className="home-header">
            <div>
              <h1>{workspace ? workspace.name : "Datasets"}</h1>
              <p>{workspace?.description ?? "Gestiona, explora y vincula las tablas de datos de tu equipo."}</p>
            </div>
            <div className="home-header__actions">
              {datasets.length > 1 && (
                <button className="btn btn--secondary" onClick={() => setShowRelationScan(true)}>
                  <ScanSearch /> Detectar relaciones
                </button>
              )}
              <button className="btn btn--primary" onClick={() => navigate("/create")}>
                <Plus /> Nuevo dataset
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="home-toolbar">
            <span className="search" style={{ position: "relative" }}>
              <Search />
              <input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setGlobalSearch("")}
                placeholder="Buscar dataset, registro…"
                style={{ flex: 1, background: "transparent", border: 0, outline: 0, font: "inherit", color: "var(--text)" }}
              />
            </span>
            <span className="home-toolbar__grow" />
            {datasets.length > 0 && (
              <button className="tb-btn" onClick={() => setShowSchema(true)}><LayoutGrid /> Diagrama</button>
            )}
            {datasets.length > 1 && (
              <button className="tb-btn" onClick={() => setShowRelManager(true)}><Network /> Relaciones</button>
            )}
            {bridgesCount > 0 && (
              <button
                className={`tb-btn${showBridges ? " is-on" : ""}`}
                onClick={() => setShowBridges((v) => !v)}
                style={showBridges ? { color: "var(--accent-pri)" } : undefined}
                title="Mostrar/ocultar tablas intermedias (puentes N:N)"
              >
                <Workflow /> Intermedias ({bridgesCount})
              </button>
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

          {/* Sección + grid */}
          <div className="home-section-title">
            <h3>Tus datasets</h3>
            {!isLoading && (
              <span className="home-section-title__count">
                {visibleDatasets.length} dataset{visibleDatasets.length !== 1 ? "s" : ""} · {totalRecords.toLocaleString()} filas · {totalCols} cols
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="home-grid">{[1, 2, 3].map((n) => <SkeletonCard key={n} />)}</div>
          ) : visibleDatasets.length === 0 ? (
            <div className="empty">
              <div className="empty__art"><Table2 size={28} /></div>
              <h4>{datasets.length === 0 ? "Sin datasets todavía" : "Solo hay tablas intermedias"}</h4>
              <p>{datasets.length === 0 ? "Crea tu primer dataset para empezar." : "Usa el botón de intermedias para verlas."}</p>
              <button className="btn btn--primary" onClick={() => navigate("/create")}><Plus /> Nuevo dataset</button>
            </div>
          ) : (
            <div className="home-grid">
              {visibleDatasets.map((ds) => {
                const origIdx = datasets.indexOf(ds);
                const cols = colQueries[origIdx]?.data ?? [];
                const colCount = colQueries[origIdx]?.data?.length ?? null;
                const recCount = recQueries[origIdx]?.data ?? null;
                const relCount = cols.filter((c) => c.data_type === "relation").length;
                const code = ds.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "DS";
                const iconCls = ds.is_computed ? "is-calc" : iconVariant(ds.name);
                const Icon = ds.is_computed ? FunctionSquare : Table2;

                return (
                  <article key={ds.id} className="h-card" onClick={() => navigate(`/datasets/${ds.id}`)}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && navigate(`/datasets/${ds.id}`)}>
                    <div className="h-card__head">
                      <span className={`h-card__icon ${iconCls}`}><Icon /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="h-card__title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.name}</div>
                        <div className="h-card__sub">{code}{ds.is_computed ? " · derivado por script" : ds.is_bridge ? " · tabla intermedia" : ""}</div>
                      </div>
                      {ds.is_computed && <span className="badge badge--calc" style={{ marginLeft: "var(--sp-1)" }}>ƒ</span>}
                      <button className="h-card__menu" title={`Editar "${ds.name}"`}
                        onClick={(e) => { e.stopPropagation(); setEditingDataset({ id: ds.id, name: ds.name, description: ds.description, is_bridge: ds.is_bridge }); }}>
                        <MoreHorizontal />
                      </button>
                    </div>

                    <div className="h-card__stats">
                      <div><span>Filas</span><b>{recCount === null ? "—" : recCount.toLocaleString()}</b></div>
                      <div><span>Columnas</span><b>{colCount === null ? "—" : colCount}</b></div>
                      <div><span>Relaciones</span><b>{relCount}</b></div>
                    </div>

                    <div className="h-card__foot">
                      <span className="avatar-group">
                        <span className={`avatar avatar--xs ${ds.is_computed ? "avatar--calc" : relCount > 0 ? "avatar--rel" : ""}`}>{code.slice(0, 2)}</span>
                      </span>
                      <span className="when">
                        {ds.is_computed ? <><Zap /> calculado</> : ds.description ? ds.description.slice(0, 28) : "Abrir →"}
                      </span>
                    </div>
                  </article>
                );
              })}

              {/* Card crear */}
              <div className="h-card h-card--new" onClick={() => navigate("/create")}>
                <span className="h-card__icon"><Plus /></span>
                <h4>Nuevo dataset</h4>
                <p>Crea una tabla con columnas configurables.</p>
              </div>
            </div>
          )}

          {/* Mapa de relaciones */}
          {!isLoading && datasets.length > 1 && (
            <>
              <div className="home-section-title">
                <h3>Mapa de relaciones{workspace ? ` — ${workspace.name}` : ""}</h3>
                <a href="#" onClick={(e) => { e.preventDefault(); setShowSchema(true); }}>Ver completo →</a>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: "var(--r-3)", padding: "var(--sp-4)", overflow: "hidden" }}>
                <SchemaPreview datasets={datasets} colQueries={colQueries} />
              </div>
            </>
          )}
        </main>
      </AppShell>

      {/* ── Modales (fuera de .og para conservar su estilo legacy) ── */}
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

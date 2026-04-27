import { useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDatasets, deleteDataset, getColumns, getRecords } from "../api/datasets";
import { useNavigate } from "react-router-dom";
import GlobalSchemaDiagram from "../components/GlobalSchemaDiagram";
import { useConfirm } from "../components/ConfirmDialog";
import { useAuth } from "../auth/AuthContext";
import UserMenu from "../components/UserMenu";
import { useToast } from "../components/Toast";
import type { ColumnDefinition } from "../types";
import type { UseQueryResult } from "@tanstack/react-query";

// Deterministic color palette — each dataset gets a consistent color from its name
const PALETTE = [
  { from: "#009A44", to: "#007A36", light: "#E8F7EE", text: "#005C28" },
  { from: "#F5821F", to: "#D96C10", light: "#FFF3E8", text: "#9A4400" },
  { from: "#6366F1", to: "#4F46E5", light: "#EEF2FF", text: "#3730A3" },
  { from: "#0EA5E9", to: "#0284C7", light: "#F0F9FF", text: "#075985" },
  { from: "#8B5CF6", to: "#7C3AED", light: "#F5F3FF", text: "#5B21B6" },
  { from: "#EC4899", to: "#DB2777", light: "#FFF0F6", text: "#9D174D" },
  { from: "#14B8A6", to: "#0D9488", light: "#F0FDFA", text: "#115E59" },
  { from: "#F59E0B", to: "#D97706", light: "#FFFBEB", text: "#92400E" },
];

function dsColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffffff;
  return PALETTE[h % PALETTE.length];
}

// ── Helpers (duplicated from GlobalSchemaDiagram for the inline preview) ──────
const BOX_COLORS = [
  "#009A44","#3B82F6","#F5821F","#8B5CF6","#0EA5E9",
  "#EC4899","#14B8A6","#F59E0B","#6366F1","#10B981",
];
function normKw(s: string) { return s.toLowerCase().replace(/\s+/g, "_"); }
function kw(s: string) { const p = normKw(s).split("_"); return p[p.length - 1]; }

interface Dataset { id: string; name: string; description?: string }

// Compact inline SVG map (no column details, just boxes + lines)
function SchemaPreview({
  datasets,
  colQueries,
}: {
  datasets: Dataset[];
  colQueries: UseQueryResult<ColumnDefinition[]>[];
}) {
  const W = 130, H = 44, GAP_X = 90, GAP_Y = 18, MARGIN = 24;

  // Build FK edges
  const edges: { fi: number; ti: number; fkKey: string }[] = [];
  datasets.forEach((ds, fi) => {
    const cols = colQueries[fi]?.data ?? [];
    cols.filter((c) => c.field_key.startsWith("id_")).forEach((c) => {
      const refKw = c.field_key.slice(3);
      const ti = datasets.findIndex((d, j) =>
        j !== fi && (
          kw(d.name) === refKw ||
          normKw(d.name) === refKw ||
          normKw(d.name).endsWith(`_${refKw}`) ||
          normKw(d.name).startsWith(`${refKw}_`)
        )
      );
      if (ti !== -1 && !edges.find((e) => e.fi === fi && e.ti === ti))
        edges.push({ fi, ti, fkKey: c.field_key });
    });
  });

  // Lay out in a rough grid: 3 cols
  const COLS = 3;
  const svgW = MARGIN * 2 + COLS * W + (COLS - 1) * GAP_X;
  const rows = Math.ceil(datasets.length / COLS);
  const svgH = MARGIN * 2 + rows * H + (rows - 1) * GAP_Y;

  const pos = datasets.map((_, i) => ({
    x: MARGIN + (i % COLS) * (W + GAP_X),
    y: MARGIN + Math.floor(i / COLS) * (H + GAP_Y),
  }));

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg">
      <rect width={svgW} height={svgH} fill="#F4F6F9" />
      <defs>
        <pattern id="pdots" width={20} height={20} patternUnits="userSpaceOnUse">
          <circle cx={10} cy={10} r={0.9} fill="#CBD5E0" opacity={0.5} />
        </pattern>
        <marker id="parr" markerWidth={7} markerHeight={7} refX={5} refY={3} orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill="#94A3B8" />
        </marker>
      </defs>
      <rect width={svgW} height={svgH} fill="url(#pdots)" />

      {/* Edges */}
      {edges.map((e, i) => {
        const fp = pos[e.fi], tp = pos[e.ti];
        if (!fp || !tp) return null;
        const x1 = fp.x + W, y1 = fp.y + H / 2;
        const x2 = tp.x + W, y2 = tp.y + H / 2;
        const mx = (x1 + x2) / 2;
        return (
          <path key={i}
            d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
            fill="none" stroke="#94A3B8" strokeWidth={1.4} opacity={0.6}
            markerEnd="url(#parr)" />
        );
      })}

      {/* Boxes */}
      {datasets.map((ds, i) => {
        const { x, y } = pos[i];
        const color = BOX_COLORS[i % BOX_COLORS.length];
        const colCount = colQueries[i]?.data?.length ?? 0;
        return (
          <g key={ds.id}>
            <rect x={x + 2} y={y + 2} width={W} height={H} rx={7} fill="rgba(0,0,0,0.06)" />
            <rect x={x} y={y} width={W} height={H} rx={7} fill="white"
              stroke={color} strokeWidth={2} />
            <rect x={x} y={y} width={W} height={22} rx={7} fill={color} />
            <rect x={x} y={y + 15} width={W} height={7} fill={color} />
            <text x={x + W / 2} y={y + 15} textAnchor="middle"
              fill="white" fontSize={11} fontWeight={700}
              fontFamily="Inter,system-ui,sans-serif">
              {ds.name.length > 17 ? ds.name.slice(0, 16) + "…" : ds.name}
            </text>
            <text x={x + W / 2} y={y + 36} textAnchor="middle"
              fill="#6B7280" fontSize={10}
              fontFamily="Inter,system-ui,sans-serif">
              {colCount} col{colCount !== 1 ? "s" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="ds-card" style={{ pointerEvents: "none" }}>
      <div className="ds-card-header" style={{ background: "var(--color-border-light)" }} />
      <div className="ds-card-body">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ height: 16, width: "55%", borderRadius: 4, background: "var(--color-border-light)" }} />
          <div style={{ width: 24, height: 24, borderRadius: 4, background: "var(--color-border-light)" }} />
        </div>
        <div style={{ height: 12, width: "80%", borderRadius: 4, background: "var(--color-border-light)", marginTop: 10 }} />
        <div style={{ height: 12, width: "60%", borderRadius: 4, background: "var(--color-border-light)", marginTop: 6 }} />
      </div>
      <div className="ds-card-footer">
        <div style={{ height: 20, width: 70, borderRadius: 99, background: "var(--color-border-light)" }} />
        <div style={{ height: 20, width: 80, borderRadius: 99, background: "var(--color-border-light)" }} />
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
  const confirm = useConfirm();
  const toast = useToast();
  const { user, isAdmin, logout } = useAuth();
  const [showSchema, setShowSchema] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  const { data: datasets = [], isLoading } = useQuery({
    queryKey: ["datasets"],
    queryFn: getDatasets,
  });

  // Fetch column + record counts for all datasets in parallel
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

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDataset(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["datasets"] }); toast("Dataset eliminado", "success"); },
    onError: () => toast("No se pudo eliminar el dataset", "error"),
  });

  const totalRecords = recQueries.reduce((sum, q) => sum + (typeof q.data === "number" ? q.data : 0), 0);

  // Global search across all datasets
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

  return (
    <>
      {/* ── Header ── */}
      <header className="app-header">
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo">T</div>
          <span className="app-header-name">Trans<em>Excel</em></span>
        </button>
        <div className="app-header-spacer" />
        <span className="app-header-tag">Paolo Corp</span>
        <UserMenu />
      </header>

      {/* ── Hero ── */}
      <div className="ds-hero">
        <div className="ds-hero-inner">
          <div>
            <h1 className="ds-hero-title">Mis datasets</h1>
            <p className="ds-hero-sub">
              Gestiona, explora y vincula tus tablas de datos
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {datasets.length > 0 && (
              <button className="btn btn-secondary" onClick={() => setShowSchema(true)}
                style={{ fontSize: 14 }}>
                🗺 Ver diagrama
              </button>
            )}
            {isAdmin && (
              <button className="btn btn-primary ds-hero-btn" onClick={() => navigate("/create")}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span>
                Nuevo dataset
              </button>
            )}
          </div>
        </div>

        {/* Global search */}
        {datasets.length > 0 && (
          <div style={{ maxWidth: "var(--page-max)", margin: "16px auto 0", position: "relative" }}>
            <div className="global-search-wrap">
              <span className="search-icon">🔍</span>
              <input
                placeholder="Buscar en todos los datasets..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setGlobalSearch("")}
              />
            </div>
            {trimSearch.length >= 2 && (
              <div className="global-search-results" style={{ maxWidth: 480, marginTop: 6 }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: "14px 16px", fontSize: 13, color: "var(--color-text-muted)" }}>
                    {searchQueries.some((q) => q.isLoading) ? "Buscando…" : "Sin resultados"}
                  </div>
                ) : (
                  (() => {
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
                              <span className="global-search-item-name">
                                {highlight(label, trimSearch)}
                              </span>
                              {firstVal && firstVal !== label && (
                                <span className="global-search-item-meta">
                                  {highlight(firstVal.slice(0, 40), trimSearch)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ));
                  })()
                )}
                {searchResults.length > 0 && (
                  <div style={{ padding: "6px 14px 8px", borderTop: "1px solid var(--color-border-light)",
                    fontSize: 11, color: "var(--color-text-muted)" }}>
                    {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""}
                    {searchResults.length === 30 ? " (limitado a 30)" : ""}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stats bar */}
        {!isLoading && datasets.length > 0 && (
          <div className="ds-stats">
            <div className="ds-stat">
              <span className="ds-stat-value">{datasets.length}</span>
              <span className="ds-stat-label">dataset{datasets.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="ds-stat-divider" />
            <div className="ds-stat">
              <span className="ds-stat-value">{totalRecords.toLocaleString()}</span>
              <span className="ds-stat-label">registros totales</span>
            </div>
            <div className="ds-stat-divider" />
            <div className="ds-stat">
              <span className="ds-stat-value">
                {colQueries.reduce((sum, q) => sum + (q.data?.length ?? 0), 0)}
              </span>
              <span className="ds-stat-label">columnas totales</span>
            </div>
          </div>
        )}
      </div>

      {showSchema && <GlobalSchemaDiagram onClose={() => setShowSchema(false)} />}

      {/* ── Grid ── */}
      <main className="page" style={{ paddingTop: 28 }}>
        {isLoading ? (
          <div className="ds-grid">
            {[1, 2, 3].map((n) => <SkeletonCard key={n} />)}
          </div>
        ) : datasets.length === 0 ? (
          <div className="ds-empty" onClick={() => navigate("/create")}>
            <div className="ds-empty-icon">🗄️</div>
            <h3>Sin datasets todavía</h3>
            <p>Haz clic para crear tu primer dataset</p>
          </div>
        ) : (
          <div className="ds-grid">
            {datasets.map((ds, i) => {
              const color = dsColor(ds.name);
              const colCount = colQueries[i]?.data?.length ?? null;
              const recCount = recQueries[i]?.data?.length ?? null;
              const initial = ds.name.charAt(0).toUpperCase();

              return (
                <article
                  key={ds.id}
                  className="ds-card"
                  onClick={() => navigate(`/datasets/${ds.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/datasets/${ds.id}`)}
                >
                  {/* Colored gradient header */}
                  <div
                    className="ds-card-header"
                    style={{ background: `linear-gradient(135deg, ${color.from}, ${color.to})` }}
                  >
                    <div className="ds-card-avatar" style={{ background: "rgba(255,255,255,0.22)" }}>
                      {initial}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="ds-card-body">
                    <div className="ds-card-top">
                      <h3 className="ds-card-name">{ds.name}</h3>
                      <button
                        className="ds-card-delete"
                        title={`Eliminar "${ds.name}"`}
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok = await confirm({
                            title: `Eliminar "${ds.name}"`,
                            message: "Se eliminarán el dataset, todas sus columnas y todos sus registros permanentemente.",
                            confirmLabel: "Eliminar dataset",
                            variant: "danger",
                          });
                          if (ok) deleteMut.mutate(ds.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                    {ds.description ? (
                      <p className="ds-card-desc">{ds.description}</p>
                    ) : (
                      <p className="ds-card-desc ds-card-desc--empty">Sin descripción</p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="ds-card-footer">
                    <span
                      className="ds-meta-badge"
                      style={{ background: color.light, color: color.text, border: `1px solid ${color.from}33` }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm0 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7zm0 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1z"/>
                      </svg>
                      {colCount === null ? "—" : colCount} col{colCount !== 1 ? "s" : ""}
                    </span>
                    <span className="ds-meta-badge">
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M14 1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zm-1 12H3V3h10v10z"/>
                        <path d="M5 5h6v1H5zm0 3h6v1H5zm0 3h4v1H5z"/>
                      </svg>
                      {recCount === null ? "—" : recCount.toLocaleString()} fila{recCount !== 1 ? "s" : ""}
                    </span>
                    <span className="ds-card-open">
                      Abrir <span style={{ fontSize: 14 }}>→</span>
                    </span>
                  </div>
                </article>
              );
            })}

            {/* "New dataset" ghost card */}
            <div className="ds-card ds-card--new" onClick={() => navigate("/create")}>
              <div className="ds-card-new-inner">
                <div className="ds-card-new-icon">＋</div>
                <p style={{ margin: "10px 0 4px", fontWeight: 600, fontSize: 14 }}>Nuevo dataset</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
                  Crea tablas con columnas configurables
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Inline schema preview ── */}
        {!isLoading && datasets.length > 1 && (
          <div className="home-schema-preview">
            <div className="home-schema-header">
              <span style={{ fontWeight: 700, fontSize: 14 }}>Mapa de relaciones</span>
              <button className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 12px" }}
                onClick={() => setShowSchema(true)}>
                Ver completo ↗
              </button>
            </div>
            <SchemaPreview datasets={datasets} colQueries={colQueries} />
          </div>
        )}
      </main>
    </>
  );
}

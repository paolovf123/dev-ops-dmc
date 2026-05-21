import { useNavigate } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getDatasets, getColumns, getRecords } from "../api/datasets";
import type { ColumnDefinition } from "../types";

interface Props {
  currentDatasetId: string;
  currentDatasetName: string;
  currentColumns: ColumnDefinition[];
  workspaceId?: string;
}

function normalize(name: string) { return name.toLowerCase().replace(/\s+/g, "_"); }
function keyword(name: string) {
  const parts = normalize(name).split("_");
  return parts[parts.length - 1];
}

function RelCard({
  name, fkKey, count, isLoading, direction, onClick,
}: {
  name: string; fkKey: string; count: number | null;
  isLoading: boolean; direction: "parent" | "child"; onClick: () => void;
}) {
  return (
    <div className="related-card" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <div className={`related-card-icon ${direction === "parent" ? "related-card-icon--parent" : ""}`}>
        {direction === "parent" ? "⬆" : "⬇"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="related-card-name">{name}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
          <span className={direction === "parent" ? "related-fk-badge related-fk-badge--parent" : "related-fk-badge"}>
            {fkKey}
          </span>
          {isLoading
            ? <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>cargando...</span>
            : count !== null
              ? <span className="related-count-badge">{count} {(count as number) === 1 ? "registro" : "registros"}</span>
              : null}
        </div>
      </div>
      <span className="related-card-arrow">›</span>
    </div>
  );
}

export default function RelatedDatasets({ currentDatasetId, currentDatasetName, currentColumns, workspaceId }: Props) {
  const navigate = useNavigate();
  const curKw = keyword(currentDatasetName);

  const { data: allDatasets = [] } = useQuery({
    queryKey: ["datasets", workspaceId ?? "all"],
    queryFn: () => getDatasets(workspaceId ? { workspace_id: workspaceId } : undefined),
  });
  const otherDatasets = allDatasets.filter((d) => d.id !== currentDatasetId);

  // Fetch columns of all other datasets (to find who references us)
  const colQueries = useQueries({
    queries: otherDatasets.map((ds) => ({
      queryKey: ["columns", ds.id],
      queryFn: () => getColumns(ds.id),
      staleTime: 60_000,
    })),
  });

  const isLoadingCols = colQueries.some((q) => q.isLoading);

  // ── PARENTS: current dataset has id_<kw> → points to another dataset ─────────
  const parentRels = currentColumns
    .filter((c) => c.field_key.startsWith("id_"))
    .map((c) => {
      const refKw = c.field_key.slice(3); // "id_clientes" → "clientes"
      const parentDs = otherDatasets.find((d) =>
        keyword(d.name) === refKw ||
        normalize(d.name) === refKw ||
        normalize(d.name).endsWith(`_${refKw}`) ||
        normalize(d.name).startsWith(`${refKw}_`)
      );
      return parentDs ? { ds: parentDs, fkKey: c.field_key } : null;
    })
    .filter(Boolean) as { ds: (typeof allDatasets)[0]; fkKey: string }[];

  // ── CHILDREN: another dataset has id_<curKw> → references us ────────────────
  const childRels = otherDatasets
    .map((ds, i) => {
      const cols = colQueries[i]?.data ?? [];
      const fkCol = cols.find(
        (c) => c.field_key === `id_${curKw}` || c.field_key.includes(curKw)
      );
      return fkCol ? { ds, fkKey: fkCol.field_key } : null;
    })
    .filter(Boolean) as { ds: (typeof allDatasets)[0]; fkKey: string }[];

  // Fetch record counts for all related datasets
  const allRelated = [
    ...parentRels.map((r) => ({ ...r, direction: "parent" as const })),
    ...childRels.map((r) => ({ ...r, direction: "child" as const })),
  ];

  const recQueries = useQueries({
    queries: allRelated.map(({ ds }) => ({
      queryKey: ["records", ds.id, "count"],
      queryFn: () => getRecords(ds.id, {}).then((r) => r.total),
      staleTime: 30_000,
    })),
  });

  const handleCreate = () =>
    navigate(`/create?linkedTo=${currentDatasetId}&linkedName=${encodeURIComponent(currentDatasetName)}`);

  const totalRelated = parentRels.length + childRels.length;

  return (
    <section className="related-section">
      <div className="related-section-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="related-section-icon">🔗</div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "var(--color-text)" }}>
              Tablas relacionadas
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
              {isLoadingCols ? "Detectando vínculos…" :
                totalRelated > 0
                  ? `${parentRels.length} referencia${parentRels.length !== 1 ? "s" : ""} hacia arriba · ${childRels.length} hacia abajo`
                  : "Sin tablas vinculadas todavía"}
            </p>
          </div>
        </div>
        <button className="btn btn-secondary related-create-btn" onClick={handleCreate}>
          <span style={{ fontSize: 15 }}>＋</span> Nueva tabla relacionada
        </button>
      </div>

      {isLoadingCols ? (
        <div className="related-grid">
          {[1, 2].map((n) => (
            <div key={n} className="related-card" style={{ pointerEvents: "none" }}>
              <div className="related-card-icon" style={{ background: "var(--color-border-light)" }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ height: 13, width: "45%", borderRadius: 4, background: "var(--color-border-light)" }} />
                <div style={{ height: 11, width: "30%", borderRadius: 4, background: "var(--color-border-light)" }} />
              </div>
            </div>
          ))}
        </div>
      ) : totalRelated === 0 ? (
        <div className="related-empty" onClick={handleCreate}>
          <span style={{ fontSize: 32 }}>🗄️</span>
          <p style={{ margin: "10px 0 4px", fontWeight: 600, fontSize: 14, color: "var(--color-text-secondary)" }}>
            Ninguna tabla vinculada a <em style={{ fontStyle: "normal", color: "var(--color-primary)" }}>{currentDatasetName}</em>
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)" }}>
            Haz clic para crear una tabla con la clave foránea lista
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Parents */}
          {parentRels.length > 0 && (
            <div>
              <div className="related-dir-label">
                <span className="related-dir-arrow related-dir-arrow--up">⬆</span>
                Este dataset referencia a
              </div>
              <div className="related-grid">
                {parentRels.map(({ ds, fkKey }, i) => (
                  <RelCard key={ds.id} name={ds.name} fkKey={fkKey}
                    count={recQueries[i]?.data ?? null}
                    isLoading={!!recQueries[i]?.isLoading}
                    direction="parent"
                    onClick={() => navigate(`/datasets/${ds.id}`)} />
                ))}
              </div>
            </div>
          )}

          {/* Children */}
          {childRels.length > 0 && (
            <div>
              <div className="related-dir-label">
                <span className="related-dir-arrow related-dir-arrow--down">⬇</span>
                Referencian a este dataset
              </div>
              <div className="related-grid">
                {childRels.map(({ ds, fkKey }, i) => (
                  <RelCard key={ds.id} name={ds.name} fkKey={fkKey}
                    count={recQueries[parentRels.length + i]?.data ?? null}
                    isLoading={!!recQueries[parentRels.length + i]?.isLoading}
                    direction="child"
                    onClick={() => navigate(`/datasets/${ds.id}`)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

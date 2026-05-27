import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getDatasets, getColumns, getRecords } from "../../api/datasets";
import { SearchInput, EmptyState, Badge } from "../ui";
import { IcTable } from "../ui/icons";

interface Props {
  workspaceId: string;
  workspaceName: string;
}

export default function WsTabDatasets({ workspaceId, workspaceName }: Props) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const [showBridges, setShowBridges] = useState(false);

  const { data: datasets = [], isLoading } = useQuery({
    queryKey: ["datasets", workspaceId],
    queryFn: () => getDatasets({ workspace_id: workspaceId }),
  });

  const q = filter.trim().toLowerCase();
  const visible = datasets
    .filter((d) => showBridges || !d.is_bridge)
    .filter((d) => !q || d.name.toLowerCase().includes(q));
  const bridgesCount = datasets.filter((d) => d.is_bridge).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="dk-card dk-card-pad" style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
            Datasets de {workspaceName}
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "var(--color-text-muted)" }}>
              ({visible.length} de {datasets.length})
            </span>
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
            Acceso rápido a los datasets del workspace.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {bridgesCount > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", color: "var(--color-text-secondary)" }}>
              <input type="checkbox" checked={showBridges} onChange={(e) => setShowBridges(e.target.checked)} />
              Mostrar intermedias ({bridgesCount})
            </label>
          )}
          <SearchInput value={filter} onChange={setFilter} placeholder="Filtrar…" style={{ minWidth: 180 }} />
          <button className="btn btn-primary" style={{ fontSize: 12, padding: "6px 13px" }}
            onClick={() => navigate(`/ws/${workspaceId}`)}>
            Abrir workspace
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>
          Cargando…
        </div>
      ) : visible.length === 0 ? (
        <div className="dk-card">
          <EmptyState icon={<IcTable size={22} />}
            title={datasets.length === 0 ? "Sin datasets todavía" : "Sin resultados"}
            subtitle={datasets.length === 0 ? "Este workspace aún no tiene datasets." : "Ningún dataset coincide con el filtro."} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {visible.map((d) => (
            <DatasetCard key={d.id} dataset={d} onClick={() => navigate(`/datasets/${d.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DatasetCard({ dataset, onClick }: { dataset: { id: string; name: string; description: string | null; is_bridge: boolean }; onClick: () => void }) {
  const { data: cols = [] } = useQuery({
    queryKey: ["columns", dataset.id],
    queryFn: () => getColumns(dataset.id),
    staleTime: 60_000,
  });
  const { data: count = 0 } = useQuery({
    queryKey: ["records", dataset.id, "count"],
    queryFn: () => getRecords(dataset.id, { limit: 1 }).then((r) => r.total),
    staleTime: 30_000,
  });
  return (
    <div onClick={onClick}
      style={{
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: 12, padding: "12px 14px", cursor: "pointer",
        display: "flex", flexDirection: "column", gap: 6,
        transition: "border-color 0.12s, box-shadow 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(14,165,233,0.12)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {dataset.name}
        </span>
        {dataset.is_bridge && <Badge tone="violet">intermedia</Badge>}
      </div>
      {dataset.description && (
        <p style={{
          margin: 0, fontSize: 11, color: "var(--color-text-muted)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {dataset.description}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--color-text-secondary)" }}>
        <span>{cols.length} cols</span>
        <span>·</span>
        <span>{count.toLocaleString()} {count === 1 ? "fila" : "filas"}</span>
      </div>
    </div>
  );
}

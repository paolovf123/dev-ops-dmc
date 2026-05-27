import { useMemo, useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "../api/client";
import { getDatasets, getColumns, updateColumn, createColumn, updateDataset, deleteDataset } from "../api/datasets";
import type { Dataset, ColumnDefinition } from "../types";
import { useToast } from "./Toast";
import { useEscapeKey } from "../utils/useEscapeKey";
import { modalTh as th, modalTd as td } from "../utils/ui";
import { IcLink, IcBridge } from "./ui/icons";
import RelationScanModal from "./RelationScanModal";

interface Props {
  open: boolean;
  onClose: () => void;
  workspaceId?: string;
}

type Tab = "list" | "bridges" | "create_nn";

interface RelationRow {
  fromDatasetId: string;
  fromDatasetName: string;
  fromColumnId: string;
  fromColumnName: string;
  fromColumnFieldKey: string;
  toDatasetId: string;
  toDatasetName: string;
  displayField: string | null;
}

export default function RelationsManagerModal({ open, onClose, workspaceId }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("list");
  const [query, setQuery] = useState("");
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [showScan, setShowScan] = useState(false);
  // ESC cierra el sub-modal de scan primero; si no está abierto, cierra el gestor.
  useEscapeKey(() => {
    if (showScan) setShowScan(false);
    else onClose();
  }, open);

  // Datasets del workspace
  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", workspaceId ?? "all"],
    queryFn: () => getDatasets(workspaceId ? { workspace_id: workspaceId } : undefined),
    enabled: open,
  });
  const datasetById = useMemo(() => new Map(datasets.map((d) => [d.id, d])), [datasets]);

  // Columnas de cada dataset
  const colQueries = useQueries({
    queries: datasets.map((d) => ({
      queryKey: ["columns", d.id],
      queryFn: () => getColumns(d.id),
      staleTime: 60_000,
      enabled: open,
    })),
  });
  const allLoaded = colQueries.every((q) => !q.isLoading);

  // Construir el listado de relaciones confirmadas
  const relations = useMemo<RelationRow[]>(() => {
    const rows: RelationRow[] = [];
    datasets.forEach((ds, i) => {
      const cols = colQueries[i]?.data ?? [];
      cols.forEach((c) => {
        if (c.data_type === "relation" && c.rules?.related_dataset_id) {
          const target = datasetById.get(c.rules.related_dataset_id);
          rows.push({
            fromDatasetId: ds.id,
            fromDatasetName: ds.name,
            fromColumnId: c.id,
            fromColumnName: c.name,
            fromColumnFieldKey: c.field_key,
            toDatasetId: c.rules.related_dataset_id,
            toDatasetName: target?.name ?? "(no encontrada)",
            displayField: c.rules.display_field ?? null,
          });
        }
      });
    });
    return rows;
  }, [datasets, colQueries, datasetById]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return relations;
    return relations.filter(
      (r) =>
        r.fromDatasetName.toLowerCase().includes(q) ||
        r.toDatasetName.toLowerCase().includes(q) ||
        r.fromColumnName.toLowerCase().includes(q) ||
        r.fromColumnFieldKey.toLowerCase().includes(q),
    );
  }, [relations, query]);

  // Remover relación: vuelve la columna a tipo "text" y limpia las rules
  const removeMut = useMutation({
    mutationFn: async (rel: RelationRow) => {
      return updateColumn(rel.fromDatasetId, rel.fromColumnId, {
        data_type: "text",
        rules: {} as ColumnDefinition["rules"],
      } as Partial<ColumnDefinition>);
    },
    onMutate: (rel) => setRemovingKey(`${rel.fromDatasetId}:${rel.fromColumnId}`),
    onSuccess: (_data, rel) => {
      qc.invalidateQueries({ queryKey: ["columns", rel.fromDatasetId] });
      qc.invalidateQueries({ queryKey: ["datasets"] });
      toast(`✓ Relación de ${rel.fromDatasetName}.${rel.fromColumnName} eliminada`, "success");
    },
    onError: (e: Error) => toast(e.message ?? "Error al eliminar relación", "error"),
    onSettled: () => setRemovingKey(null),
  });

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "var(--color-surface)", borderRadius: 14, padding: "24px 28px",
        width: "min(1100px, 96vw)", height: "min(820px, 94vh)",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)", gap: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", color: "var(--color-primary)" }}><IcLink size={20} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Gestor de relaciones</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
              Lista, busca y elimina relaciones · crea tablas intermedias N:N
            </p>
          </div>
          <button className="btn btn-secondary"
            onClick={() => setShowScan(true)}
            style={{ marginLeft: "auto", fontSize: 13, borderColor: "#7C3AED", color: "#7C3AED" }}>
            Detectar relaciones
          </button>
          <button className="btn btn-ghost" onClick={onClose}
            style={{ padding: "4px 8px", fontSize: 18 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 4, borderBottom: "1px solid var(--color-border)",
          paddingBottom: 0, marginBottom: -4,
        }}>
          {([
            ["list", `Relaciones activas (${relations.length})`],
            ["bridges", `Tablas intermedias (${datasets.filter((d) => d.is_bridge).length})`],
            ["create_nn", "Tabla intermedia con atributos"],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{
                padding: "8px 14px", fontSize: 13, fontWeight: tab === k ? 700 : 500,
                background: "none", border: "none", cursor: "pointer",
                borderBottom: tab === k ? "2px solid var(--color-primary)" : "2px solid transparent",
                color: tab === k ? "var(--color-primary)" : "var(--color-text-secondary)",
                marginBottom: -1,
              }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "list" && (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                placeholder="Buscar por dataset, columna…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  flex: 1, fontSize: 13, padding: "7px 11px", borderRadius: 6,
                  border: "1px solid var(--color-border)",
                }}
              />
              <button
                onClick={() => setShowScan(true)}
                style={{
                  padding: "8px 16px", fontSize: 13, fontWeight: 600,
                  background: "#7C3AED", color: "#fff",
                  border: "none", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#6D28D9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#7C3AED")}>
                <span style={{ fontSize: 15 }}>＋</span> Buscar más relaciones
              </button>
            </div>

            <div style={{ overflowY: "auto", flex: 1, border: "1px solid var(--color-border)", borderRadius: 8 }}>
              {!allLoaded ? (
                <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)" }}>
                  Cargando relaciones…
                </div>
              ) : relations.length === 0 ? (
                <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)" }}>
                  No hay relaciones confirmadas todavía.
                  <br />
                  Usa "Detectar relaciones" para aplicar sugerencias.
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
                  Sin resultados para "{query}".
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg)", position: "sticky", top: 0 }}>
                      <th style={th}>Desde</th>
                      <th style={th}>Columna</th>
                      <th style={th}>→ Apunta a</th>
                      <th style={th}>Campo destino</th>
                      <th style={th}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((rel) => {
                      const key = `${rel.fromDatasetId}:${rel.fromColumnId}`;
                      const removing = removingKey === key;
                      return (
                        <tr key={key} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                          <td style={td}>
                            <Link to={`/datasets/${rel.fromDatasetId}`}
                              style={{ color: "var(--color-primary)", fontWeight: 600 }}>
                              {rel.fromDatasetName}
                            </Link>
                          </td>
                          <td style={td}>
                            <code style={{ fontSize: 12, color: "#DB2777" }}>{rel.fromColumnFieldKey}</code>
                            {rel.fromColumnName !== rel.fromColumnFieldKey && (
                              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{rel.fromColumnName}</div>
                            )}
                          </td>
                          <td style={td}>
                            <Link to={`/datasets/${rel.toDatasetId}`}
                              style={{ color: "var(--color-primary)", fontWeight: 600 }}>
                              {rel.toDatasetName}
                            </Link>
                          </td>
                          <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-muted)" }}>
                            {rel.displayField ?? "id (registro)"}
                          </td>
                          <td style={td}>
                            <button
                              onClick={() => {
                                if (confirm(`¿Quitar la relación de ${rel.fromDatasetName}.${rel.fromColumnName}?\n\nLa columna volverá a ser de tipo "text" (los datos se conservan).`)) {
                                  removeMut.mutate(rel);
                                }
                              }}
                              disabled={removing}
                              style={{
                                fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 6,
                                border: "1px solid #DC2626", background: "#fff",
                                color: "#DC2626", cursor: removing ? "wait" : "pointer", whiteSpace: "nowrap",
                                opacity: removing ? 0.6 : 1,
                              }}
                              onMouseEnter={(e) => { if (!removing) (e.currentTarget as HTMLButtonElement).style.background = "#FEE2E2"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}>
                              {removing ? "Quitando…" : "Quitar"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {tab === "bridges" && (
          <BridgesList
            datasets={datasets}
            colsByDsId={new Map(datasets.map((d, i) => [d.id, colQueries[i]?.data ?? []]))}
            onChanged={() => qc.invalidateQueries({ queryKey: ["datasets"] })}
          />
        )}

        {tab === "create_nn" && (
          <CreateNNRelation
            datasets={datasets}
            workspaceId={workspaceId}
            onCreated={() => {
              qc.invalidateQueries({ queryKey: ["datasets"] });
              setTab("bridges");
              toast("✓ Tabla intermedia creada", "success");
            }}
          />
        )}
      </div>

      <RelationScanModal
        open={showScan}
        onClose={() => {
          setShowScan(false);
          // Refrescar la lista al cerrar (puede haber aplicaciones nuevas)
          qc.invalidateQueries({ queryKey: ["datasets"] });
          datasets.forEach((d) => qc.invalidateQueries({ queryKey: ["columns", d.id] }));
        }}
        workspaceId={workspaceId}
      />
    </div>
  );
}

// ── Sub-componente: wizard para crear relación N:N ──────────────────────────
function CreateNNRelation({
  datasets, workspaceId, onCreated,
}: {
  datasets: Dataset[];
  workspaceId?: string;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [dsAId, setDsAId] = useState("");
  const [dsBId, setDsBId] = useState("");
  const [bridgeName, setBridgeName] = useState("");
  const [dsAFilter, setDsAFilter] = useState("");
  const [dsBFilter, setDsBFilter] = useState("");
  const [creating, setCreating] = useState(false);

  const visibleDs = useMemo(() => datasets.filter((d) => !d.is_computed && !d.is_bridge), [datasets]);
  const dsA = datasets.find((d) => d.id === dsAId);
  const dsB = datasets.find((d) => d.id === dsBId);

  const defaultName = useMemo(() => {
    if (!dsA || !dsB) return "";
    const clean = (s: string) => s.replace(/\s+/g, "");
    return `${clean(dsA.name)}_${clean(dsB.name)}`;
  }, [dsA, dsB]);

  const effectiveName = bridgeName.trim() || defaultName;

  // Sugerir field_keys para las 2 FKs basadas en los nombres de los datasets
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const fkA = `id_${slug(dsA?.name ?? "a")}`;
  const fkB = `id_${slug(dsB?.name ?? "b")}`;

  const handleCreate = async () => {
    if (!dsA || !dsB || !effectiveName) return;
    setCreating(true);
    try {
      // 1. Crear el dataset bridge con is_bridge=true
      const { data: bridge } = await api.post<Dataset>("/datasets", {
        name: effectiveName,
        description: `Tabla intermedia que conecta ${dsA.name} con ${dsB.name}`,
        workspace_id: workspaceId,
        is_bridge: true,
      });
      // 2. Crear FK a A
      await createColumn(bridge.id, {
        name: `ID ${dsA.name}`,
        field_key: fkA,
        data_type: "relation",
        rules: { required: true, related_dataset_id: dsA.id },
        position: 0,
      } as never);
      // 3. Crear FK a B
      await createColumn(bridge.id, {
        name: `ID ${dsB.name}`,
        field_key: fkB,
        data_type: "relation",
        rules: { required: true, related_dataset_id: dsB.id },
        position: 1,
      } as never);
      onCreated();
    } catch (e) {
      toast((e as Error).message ?? "Error al crear", "error");
    } finally {
      setCreating(false);
    }
  };

  const filterAndShow = (filter: string, exclude: string, onPick: (id: string) => void) => {
    const q = filter.trim().toLowerCase();
    const list = q ? visibleDs.filter((d) => d.name.toLowerCase().includes(q) && d.id !== exclude) : visibleDs.filter((d) => d.id !== exclude);
    return (
      <div style={{
        maxHeight: 200, overflowY: "auto",
        border: "1px solid var(--color-border)", borderRadius: 6,
        background: "var(--color-surface)",
      }}>
        {list.length === 0 ? (
          <p style={{ padding: "10px 12px", fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
            {q ? `Sin resultados para "${filter}"` : "No hay datasets disponibles"}
          </p>
        ) : list.map((d) => (
          <button key={d.id} onClick={() => onPick(d.id)}
            style={{
              width: "100%", textAlign: "left", background: "none", border: "none",
              padding: "7px 12px", fontSize: 13, cursor: "pointer",
              borderBottom: "1px solid var(--color-border-light)",
              color: "var(--color-text)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
            {d.name}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
      <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
        Todas las relaciones del sistema son <strong>N:N</strong> por defecto: una columna
        <code style={{ background: "var(--color-bg)", padding: "0 4px", borderRadius: 3, margin: "0 3px" }}>relation</code>
        puede guardar varios valores. <strong>No hace falta una tabla intermedia para tener N:N.</strong>
        <br /><br />
        Usa este wizard <strong>solo</strong> si necesitás guardar <strong>atributos del vínculo</strong>
        (ej. en la conexión Operación↔Inversionista querés guardar el monto aportado por cada
        inversionista, la fecha, %). En ese caso la tabla intermedia es el lugar para esos campos.
      </p>

      {/* Dataset A */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Dataset A
          </label>
          {dsA ? (
            <div style={{
              marginTop: 4, padding: "8px 12px", border: "1.5px solid var(--color-primary)",
              borderRadius: 6, background: "var(--color-primary-bg)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{dsA.name}</span>
              <button onClick={() => { setDsAId(""); setDsAFilter(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--color-text-muted)", textDecoration: "underline" }}>
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Buscar dataset…"
                value={dsAFilter}
                onChange={(e) => setDsAFilter(e.target.value)}
                style={{
                  width: "100%", fontSize: 12, padding: "5px 9px",
                  border: "1px solid var(--color-border)", borderRadius: 6,
                  marginTop: 4, marginBottom: 4,
                }} />
              {filterAndShow(dsAFilter, dsBId, setDsAId)}
            </>
          )}
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Dataset B
          </label>
          {dsB ? (
            <div style={{
              marginTop: 4, padding: "8px 12px", border: "1.5px solid var(--color-primary)",
              borderRadius: 6, background: "var(--color-primary-bg)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{dsB.name}</span>
              <button onClick={() => { setDsBId(""); setDsBFilter(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--color-text-muted)", textDecoration: "underline" }}>
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Buscar dataset…"
                value={dsBFilter}
                onChange={(e) => setDsBFilter(e.target.value)}
                style={{
                  width: "100%", fontSize: 12, padding: "5px 9px",
                  border: "1px solid var(--color-border)", borderRadius: 6,
                  marginTop: 4, marginBottom: 4,
                }} />
              {filterAndShow(dsBFilter, dsAId, setDsBId)}
            </>
          )}
        </div>
      </div>

      {dsA && dsB && (
        <>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Nombre de la tabla intermedia
            </label>
            <input
              type="text"
              placeholder={defaultName}
              value={bridgeName}
              onChange={(e) => setBridgeName(e.target.value)}
              style={{
                width: "100%", fontSize: 14, padding: "8px 12px",
                border: "1px solid var(--color-border)", borderRadius: 6,
                marginTop: 4,
              }} />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>
              Por defecto: <code>{defaultName}</code>
            </p>
          </div>

          <div style={{
            padding: "12px 14px", borderRadius: 8,
            background: "var(--color-bg)", border: "1px dashed var(--color-border)",
            fontSize: 12, color: "var(--color-text-secondary)",
          }}>
            <strong>Se creará:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
              <li>Dataset <strong>{effectiveName}</strong> marcado como <em>tabla intermedia</em></li>
              <li>Columna <code style={{ background: "var(--color-surface)", padding: "0 4px", borderRadius: 3 }}>{fkA}</code> tipo relation → {dsA.name}</li>
              <li>Columna <code style={{ background: "var(--color-surface)", padding: "0 4px", borderRadius: 3 }}>{fkB}</code> tipo relation → {dsB.name}</li>
            </ul>
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>
              Luego podrás agregar columnas extras (cantidad, fecha, monto, %, etc.) editando la tabla intermedia.
            </p>
          </div>

          <button
            className="btn btn-primary"
            disabled={creating || !effectiveName}
            onClick={handleCreate}
            style={{ alignSelf: "flex-start", padding: "8px 18px", fontSize: 13 }}>
            {creating ? "Creando…" : "Crear tabla intermedia"}
          </button>
        </>
      )}
    </div>
  );
}

// ── Sub-componente: lista de tablas intermedias con links directos ──────────
function BridgesList({
  datasets, colsByDsId, onChanged,
}: {
  datasets: Dataset[];
  colsByDsId: Map<string, ColumnDefinition[]>;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [working, setWorking] = useState<string | null>(null);
  const bridges = useMemo(() => datasets.filter((d) => d.is_bridge), [datasets]);
  const datasetById = useMemo(() => new Map(datasets.map((d) => [d.id, d])), [datasets]);

  const handleUnmark = async (b: Dataset) => {
    if (!confirm(`¿Desmarcar ${b.name} como tabla intermedia?\n\nVolverá a aparecer en la lista principal.`)) return;
    setWorking(b.id);
    try {
      await updateDataset(b.id, { is_bridge: false });
      onChanged();
      toast(`✓ ${b.name} ya no es tabla intermedia`, "success");
    } catch (e) {
      toast((e as Error).message ?? "Error", "error");
    } finally {
      setWorking(null);
    }
  };

  const handleDelete = async (b: Dataset) => {
    if (!confirm(`¿Eliminar ${b.name} y sus datos definitivamente?\n\nEsto desconecta la relación N:N. No se puede deshacer.`)) return;
    setWorking(b.id);
    try {
      await deleteDataset(b.id);
      onChanged();
      toast(`✓ ${b.name} eliminada`, "success");
    } catch (e) {
      toast((e as Error).message ?? "Error", "error");
    } finally {
      setWorking(null);
    }
  };

  if (bridges.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)" }}>
        No hay tablas intermedias todavía.
        <br />
        <span style={{ fontSize: 12 }}>Usa "Crear relación N:N" para conectar 2 datasets con una tabla puente.</span>
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>
        Las tablas intermedias están <strong>ocultas</strong> de la lista principal de datasets,
        pero podés abrirlas desde aquí para agregar registros, editar columnas o ver sus datos.
      </p>

      {bridges.map((b) => {
        const cols = colsByDsId.get(b.id) ?? [];
        const relCols = cols.filter((c) => c.data_type === "relation" && c.rules?.related_dataset_id);
        const connects = relCols.map((c) => datasetById.get(c.rules!.related_dataset_id!)?.name ?? "(?)").join(" ↔ ");
        const isWorking = working === b.id;
        return (
          <div key={b.id} style={{
            border: "1px solid var(--color-border)", borderRadius: 10, padding: "12px 14px",
            background: "var(--color-surface)",
            opacity: isWorking ? 0.6 : 1, transition: "opacity 0.15s",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", color: "var(--pm-violet-600)" }}><IcBridge size={16} /></span>
                  <Link to={`/datasets/${b.id}`}
                    style={{ fontSize: 15, fontWeight: 700, color: "var(--color-primary)" }}>
                    {b.name}
                  </Link>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                    background: "#7C3AED20", color: "#7C3AED", textTransform: "uppercase", letterSpacing: 0.5,
                  }}>intermedia</span>
                </div>
                {connects && (
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                    Conecta: <strong>{connects}</strong>
                  </div>
                )}
                {b.description && (
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6 }}>
                    {b.description}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  {cols.length} columna{cols.length !== 1 ? "s" : ""} · {relCols.length} FKs
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <Link to={`/datasets/${b.id}`}
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: "5px 12px", whiteSpace: "nowrap", textDecoration: "none" }}>
                  Abrir tabla
                </Link>
                <button onClick={() => handleUnmark(b)} disabled={isWorking}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 6,
                    border: "1px solid var(--color-border)", background: "var(--color-surface)",
                    color: "var(--color-text-secondary)", cursor: isWorking ? "wait" : "pointer", whiteSpace: "nowrap",
                  }}>
                  ↑ Desmarcar
                </button>
                <button onClick={() => handleDelete(b)} disabled={isWorking}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 6,
                    border: "1px solid #DC2626", background: "#fff",
                    color: "#DC2626", cursor: isWorking ? "wait" : "pointer", whiteSpace: "nowrap",
                  }}>
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

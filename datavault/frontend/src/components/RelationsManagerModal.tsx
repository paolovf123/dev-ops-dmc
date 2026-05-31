import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Link2, Sparkles, Plus, Trash2, X, ArrowRight, Network, ExternalLink, ArrowUpFromLine,
} from "lucide-react";
import api from "../api/client";
import { getDatasets, getColumns, updateColumn, createColumn, updateDataset, deleteDataset } from "../api/datasets";
import type { Dataset, ColumnDefinition } from "../types";
import { useToast } from "./Toast";
import { useEscapeKey } from "../utils/useEscapeKey";
import { Badge, Btn, Chip, IconBtn, TONE } from "./ui/kit";
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

// ── Estilos compartidos de presentación ──────────────────────────────────────
const inputSt: CSSProperties = {
  width: "100%", height: 38, padding: "0 11px", borderRadius: "var(--r-2)",
  border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
  font: "400 13.5px var(--font-sans)", outline: "none",
};
const labelSt: CSSProperties = {
  display: "block", font: "500 12.5px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6,
};

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

  const bridgeCount = datasets.filter((d) => d.is_bridge).length;
  const tabs: [Tab, string, number | null][] = [
    ["list", "Relaciones activas", relations.length],
    ["bridges", "Tablas intermedias", bridgeCount],
    ["create_nn", "Tabla intermedia con atributos", null],
  ];
  const [relFg, relBg] = TONE.rel;

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "var(--overlay)", backdropFilter: "blur(5px)",
        display: "grid", placeItems: "center", padding: 24,
        animation: "ogFade var(--t-mid)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 1040, height: "min(820px, 92vh)",
          display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-4)", boxShadow: "var(--shadow-4)",
          animation: "ogPop var(--t-slow)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: "var(--r-2)", background: relBg, color: relFg, flex: "none" }}>
            <Link2 size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>Gestor de relaciones</div>
            <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3 }}>
              Lista, busca y elimina relaciones · crea tablas intermedias N:N
            </div>
          </div>
          <Btn variant="soft" tone="violet" icon={<Sparkles size={15} />} onClick={() => setShowScan(true)}>
            Detectar relaciones
          </Btn>
          <IconBtn onClick={onClose} title="Cerrar" style={{ width: 32, height: 32, color: "var(--text-mute)" }}>
            <X size={18} />
          </IconBtn>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "0 20px", borderBottom: "1px solid var(--border)" }}>
          {tabs.map(([k, label, count]) => {
            const on = tab === k;
            return (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  padding: "11px 4px", marginRight: 12, font: `${on ? 700 : 500} 13px var(--font-sans)`,
                  background: "none", border: "none", cursor: "pointer",
                  borderBottom: on ? "2px solid var(--accent-rel)" : "2px solid transparent",
                  color: on ? "var(--accent-rel)" : "var(--text-soft)",
                  marginBottom: -1, display: "inline-flex", alignItems: "center", gap: 7,
                }}
              >
                {label}
                {count != null && <Badge tone={on ? "rel" : "neutral"}>{count}</Badge>}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 20, overflow: "hidden" }}>
          {tab === "list" && (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
                <input
                  type="text"
                  placeholder="Buscar por dataset, columna…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ ...inputSt, flex: 1 }}
                />
                <Btn variant="primary" tone="violet" icon={<Plus size={15} />} onClick={() => setShowScan(true)}>
                  Buscar más relaciones
                </Btn>
              </div>

              <div style={{ overflowY: "auto", flex: 1, border: "1px solid var(--border)", borderRadius: "var(--r-3)", background: "var(--surface)" }}>
                {!allLoaded ? (
                  <EmptyState>Cargando relaciones…</EmptyState>
                ) : relations.length === 0 ? (
                  <EmptyState>
                    No hay relaciones confirmadas todavía.
                    <br />
                    Usa "Detectar relaciones" para aplicar sugerencias.
                  </EmptyState>
                ) : filtered.length === 0 ? (
                  <EmptyState>Sin resultados para "{query}".</EmptyState>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", font: "400 13px var(--font-sans)" }}>
                    <thead>
                      <tr style={{ position: "sticky", top: 0, background: "var(--surface-alt)", zIndex: 1 }}>
                        <th style={thSt}>Desde</th>
                        <th style={thSt}>Columna</th>
                        <th style={thSt}>→ Apunta a</th>
                        <th style={thSt}>Campo destino</th>
                        <th style={{ ...thSt, textAlign: "right" }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((rel) => {
                        const key = `${rel.fromDatasetId}:${rel.fromColumnId}`;
                        const removing = removingKey === key;
                        return (
                          <tr key={key} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={tdSt}>
                              <Link to={`/datasets/${rel.fromDatasetId}`} style={{ textDecoration: "none" }}>
                                <Chip tone="rel">{rel.fromDatasetName}</Chip>
                              </Link>
                            </td>
                            <td style={tdSt}>
                              <span className="mono" style={{ font: "500 12px var(--font-mono)", color: "var(--accent-rel)" }}>
                                .{rel.fromColumnFieldKey}
                              </span>
                              {rel.fromColumnName !== rel.fromColumnFieldKey && (
                                <div style={{ font: "400 11px var(--font-sans)", color: "var(--text-mute)" }}>{rel.fromColumnName}</div>
                              )}
                            </td>
                            <td style={tdSt}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                                <ArrowRight size={14} color="var(--text-mute)" />
                                <Link to={`/datasets/${rel.toDatasetId}`} style={{ textDecoration: "none" }}>
                                  <Chip tone="primary">{rel.toDatasetName}</Chip>
                                </Link>
                              </span>
                            </td>
                            <td style={{ ...tdSt, font: "400 11.5px var(--font-mono)", color: "var(--text-mute)" }} className="mono">
                              {rel.displayField ?? "id (registro)"}
                            </td>
                            <td style={{ ...tdSt, textAlign: "right" }}>
                              <Btn
                                variant="danger"
                                size="sm"
                                disabled={removing}
                                icon={<Trash2 size={13} />}
                                onClick={() => {
                                  if (confirm(`¿Quitar la relación de ${rel.fromDatasetName}.${rel.fromColumnName}?\n\nLa columna volverá a ser de tipo "text" (los datos se conservan).`)) {
                                    removeMut.mutate(rel);
                                  }
                                }}
                              >
                                {removing ? "Quitando…" : "Quitar"}
                              </Btn>
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

// ── Estilos de tabla ──────────────────────────────────────────────────────────
const thSt: CSSProperties = {
  textAlign: "left", padding: "10px 14px", font: "600 11.5px var(--font-sans)",
  color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap",
};
const tdSt: CSSProperties = {
  padding: "10px 14px", color: "var(--text)", verticalAlign: "middle",
};

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: "56px 24px", textAlign: "center", font: "400 13.5px var(--font-sans)", color: "var(--text-mute)", lineHeight: 1.6 }}>
      {children}
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
      <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--r-2)", background: "var(--surface)" }}>
        {list.length === 0 ? (
          <p style={{ padding: "10px 12px", font: "400 12.5px var(--font-sans)", color: "var(--text-mute)", margin: 0 }}>
            {q ? `Sin resultados para "${filter}"` : "No hay datasets disponibles"}
          </p>
        ) : list.map((d) => (
          <button
            key={d.id}
            onClick={() => onPick(d.id)}
            className="og-menu-item"
            style={{
              width: "100%", textAlign: "left", background: undefined, border: "none",
              padding: "8px 12px", font: "400 13px var(--font-sans)", cursor: "pointer",
              borderBottom: "1px solid var(--border)", color: "var(--text)",
            }}
          >
            {d.name}
          </button>
        ))}
      </div>
    );
  };

  const code = (txt: ReactNode) => (
    <span className="mono" style={{ font: "400 12px var(--font-mono)", background: "var(--surface-alt)", padding: "1px 5px", borderRadius: 4, color: "var(--accent-rel)" }}>{txt}</span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", flex: 1 }}>
      <p style={{ margin: 0, font: "400 12.5px var(--font-sans)", color: "var(--text-soft)", lineHeight: 1.6 }}>
        Todas las relaciones del sistema son <strong style={{ color: "var(--text)" }}>N:N</strong> por defecto: una columna {code("relation")} puede
        guardar varios valores. <strong style={{ color: "var(--text)" }}>No hace falta una tabla intermedia para tener N:N.</strong>
        <br /><br />
        Usa este wizard <strong style={{ color: "var(--text)" }}>solo</strong> si necesitás guardar <strong style={{ color: "var(--text)" }}>atributos del vínculo</strong>
        {" "}(ej. en la conexión Operación↔Inversionista querés guardar el monto aportado por cada
        inversionista, la fecha, %). En ese caso la tabla intermedia es el lugar para esos campos.
      </p>

      {/* Dataset A / B */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={labelSt}>Dataset A</div>
          {dsA ? (
            <SelectedDs name={dsA.name} onClear={() => { setDsAId(""); setDsAFilter(""); }} />
          ) : (
            <>
              <input
                type="text"
                placeholder="Buscar dataset…"
                value={dsAFilter}
                onChange={(e) => setDsAFilter(e.target.value)}
                style={{ ...inputSt, height: 34, fontSize: 12.5, marginBottom: 6 }}
              />
              {filterAndShow(dsAFilter, dsBId, setDsAId)}
            </>
          )}
        </div>

        <div>
          <div style={labelSt}>Dataset B</div>
          {dsB ? (
            <SelectedDs name={dsB.name} onClear={() => { setDsBId(""); setDsBFilter(""); }} />
          ) : (
            <>
              <input
                type="text"
                placeholder="Buscar dataset…"
                value={dsBFilter}
                onChange={(e) => setDsBFilter(e.target.value)}
                style={{ ...inputSt, height: 34, fontSize: 12.5, marginBottom: 6 }}
              />
              {filterAndShow(dsBFilter, dsAId, setDsBId)}
            </>
          )}
        </div>
      </div>

      {dsA && dsB && (
        <>
          <label style={{ display: "block" }}>
            <div style={labelSt}>Nombre de la tabla intermedia</div>
            <input
              type="text"
              placeholder={defaultName}
              value={bridgeName}
              onChange={(e) => setBridgeName(e.target.value)}
              style={inputSt}
            />
            <p style={{ margin: "6px 0 0", font: "400 11.5px var(--font-sans)", color: "var(--text-mute)" }}>
              Por defecto: {code(defaultName)}
            </p>
          </label>

          <div style={{
            padding: "14px 16px", borderRadius: "var(--r-3)",
            background: "var(--rel-soft)", border: "1px dashed color-mix(in srgb, var(--accent-rel) 35%, transparent)",
            font: "400 12.5px var(--font-sans)", color: "var(--text-soft)",
          }}>
            <strong style={{ color: "var(--text)" }}>Se creará:</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.8 }}>
              <li>Dataset <strong style={{ color: "var(--text)" }}>{effectiveName}</strong> marcado como <em>tabla intermedia</em></li>
              <li>Columna {code(fkA)} tipo relation → {dsA.name}</li>
              <li>Columna {code(fkB)} tipo relation → {dsB.name}</li>
            </ul>
            <p style={{ margin: "10px 0 0", font: "400 11.5px var(--font-sans)", color: "var(--text-mute)" }}>
              Luego podrás agregar columnas extras (cantidad, fecha, monto, %, etc.) editando la tabla intermedia.
            </p>
          </div>

          <Btn
            variant="primary"
            tone="rel"
            icon={<Plus size={15} />}
            disabled={creating || !effectiveName}
            onClick={handleCreate}
            style={{ alignSelf: "flex-start" }}
          >
            {creating ? "Creando…" : "Crear tabla intermedia"}
          </Btn>
        </>
      )}
    </div>
  );
}

function SelectedDs({ name, onClear }: { name: string; onClear: () => void }) {
  return (
    <div style={{
      padding: "9px 13px", border: "1.5px solid var(--accent-rel)", borderRadius: "var(--r-2)",
      background: "var(--rel-soft)", display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span style={{ font: "600 13.5px var(--font-sans)", color: "var(--text)" }}>{name}</span>
      <button
        onClick={onClear}
        style={{ background: "none", border: "none", cursor: "pointer", font: "500 11.5px var(--font-sans)", color: "var(--accent-rel)", textDecoration: "underline" }}
      >
        Cambiar
      </button>
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
      <EmptyState>
        No hay tablas intermedias todavía.
        <br />
        <span style={{ fontSize: 12 }}>Usa "Crear relación N:N" para conectar 2 datasets con una tabla puente.</span>
      </EmptyState>
    );
  }

  return (
    <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, font: "400 12.5px var(--font-sans)", color: "var(--text-soft)", lineHeight: 1.6 }}>
        Las tablas intermedias están <strong style={{ color: "var(--text)" }}>ocultas</strong> de la lista principal de datasets,
        pero podés abrirlas desde aquí para agregar registros, editar columnas o ver sus datos.
      </p>

      {bridges.map((b) => {
        const cols = colsByDsId.get(b.id) ?? [];
        const relCols = cols.filter((c) => c.data_type === "relation" && c.rules?.related_dataset_id);
        const connects = relCols.map((c) => datasetById.get(c.rules!.related_dataset_id!)?.name ?? "(?)").join(" ↔ ");
        const isWorking = working === b.id;
        return (
          <div
            key={b.id}
            className="og-card"
            style={{
              border: "1px solid var(--border)", borderRadius: "var(--r-3)", padding: "14px 16px",
              background: "var(--surface)", boxShadow: "var(--shadow-1)",
              opacity: isWorking ? 0.6 : 1, transition: "opacity var(--t-fast)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", color: "var(--violet)" }}><Network size={16} /></span>
                  <Link to={`/datasets/${b.id}`} style={{ font: "700 15px var(--font-sans)", color: "var(--text)", textDecoration: "none" }}>
                    {b.name}
                  </Link>
                  <Badge tone="violet">intermedia</Badge>
                </div>
                {connects && (
                  <div style={{ font: "400 12.5px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>
                    Conecta: <strong style={{ color: "var(--text)" }}>{connects}</strong>
                  </div>
                )}
                {b.description && (
                  <div style={{ font: "400 11.5px var(--font-sans)", color: "var(--text-mute)", marginBottom: 6 }}>
                    {b.description}
                  </div>
                )}
                <div style={{ font: "400 11.5px var(--font-sans)", color: "var(--text-mute)" }}>
                  {cols.length} columna{cols.length !== 1 ? "s" : ""} · {relCols.length} FKs
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, flexShrink: 0, alignItems: "stretch" }}>
                <Link to={`/datasets/${b.id}`} style={{ textDecoration: "none" }}>
                  <Btn variant="primary" size="sm" full icon={<ExternalLink size={13} />}>Abrir tabla</Btn>
                </Link>
                <Btn variant="soft" size="sm" disabled={isWorking} icon={<ArrowUpFromLine size={13} />} onClick={() => handleUnmark(b)}>
                  Desmarcar
                </Btn>
                <Btn variant="danger" size="sm" disabled={isWorking} icon={<Trash2 size={13} />} onClick={() => handleDelete(b)}>
                  Eliminar
                </Btn>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

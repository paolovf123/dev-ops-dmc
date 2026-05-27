import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { scanRelationships, updateColumn, normalizeColumnValues } from "../api/datasets";
import type { RelationCandidate, CleanupSuggestion } from "../api/datasets";
import { useToast } from "./Toast";
import { useEscapeKey } from "../utils/useEscapeKey";
import { modalTh as th, modalTd as td } from "../utils/ui";
import { IcSearch } from "./ui/icons";

interface Props {
  open: boolean;
  onClose: () => void;
  workspaceId?: string;
}

type Filter = "all" | "name+content" | "name" | "content";
type Tab = "relations" | "cleanup";

export default function RelationScanModal({ open, onClose, workspaceId }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("relations");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [normalizingKey, setNormalizingKey] = useState<string | null>(null);
  const [normalized, setNormalized] = useState<Set<string>>(new Set());

  useEscapeKey(onClose, open);

  const scanMut = useMutation({
    mutationFn: () => scanRelationships(workspaceId),
  });

  const applyMut = useMutation({
    mutationFn: async (c: RelationCandidate) => {
      const rules: Record<string, unknown> = { related_dataset_id: c.to_dataset_id };
      if (c.to_field && c.to_field !== "__id__") rules.display_field = c.to_field;
      return updateColumn(c.from_dataset_id, c.from_column_id, {
        data_type: "relation",
        rules,
      } as Partial<unknown> as never);
    },
    onMutate: (c) => {
      setApplyingKey(`${c.from_dataset_id}:${c.from_column_id}`);
    },
    onSuccess: (_data, c) => {
      const key = `${c.from_dataset_id}:${c.from_column_id}`;
      setApplied((prev) => new Set(prev).add(key));
      qc.invalidateQueries({ queryKey: ["columns", c.from_dataset_id] });
      qc.invalidateQueries({ queryKey: ["datasets"] });
      toast(`✓ ${c.from_dataset_name}.${c.from_column} ahora apunta a ${c.to_dataset_name}`, "success");
    },
    onError: (e: Error) => toast(e.message ?? "Error al aplicar relación", "error"),
    onSettled: () => setApplyingKey(null),
  });

  const normalizeMut = useMutation({
    mutationFn: (s: CleanupSuggestion) => normalizeColumnValues(s.dataset_id, s.column_id),
    onMutate: (s) => setNormalizingKey(`${s.dataset_id}:${s.column_id}`),
    onSuccess: (data, s) => {
      const key = `${s.dataset_id}:${s.column_id}`;
      setNormalized((prev) => new Set(prev).add(key));
      qc.invalidateQueries({ queryKey: ["records", s.dataset_id] });
      toast(
        `✓ ${s.dataset_name}.${s.column}: ${data.updated} registros actualizados, ${data.groups_unified} grupos unificados`,
        "success",
      );
    },
    onError: (e: Error) => toast(e.message ?? "Error al normalizar", "error"),
    onSettled: () => setNormalizingKey(null),
  });

  useEffect(() => {
    if (open && !scanMut.data && !scanMut.isPending) {
      scanMut.mutate();
    }
    if (!open) {
      scanMut.reset();
      setTab("relations");
      setFilter("all");
      setQuery("");
      setApplied(new Set());
      setApplyingKey(null);
      setNormalized(new Set());
      setNormalizingKey(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo<RelationCandidate[]>(() => {
    const list = scanMut.data?.candidates ?? [];
    return list.filter((c) => {
      if (filter === "name+content" && !(c.name_match && c.content_match_ratio > 0)) return false;
      if (filter === "name" && !c.name_match) return false;
      if (filter === "content" && c.content_match_ratio <= 0) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !c.from_dataset_name.toLowerCase().includes(q) &&
          !c.to_dataset_name.toLowerCase().includes(q) &&
          !c.from_column.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [scanMut.data, filter, query]);

  if (!open) return null;

  const total = scanMut.data?.candidates.length ?? 0;
  const scanned = scanMut.data?.scanned ?? 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "var(--color-surface)", borderRadius: 14, padding: "24px 28px",
        width: "min(1500px, 97vw)", height: "min(940px, 94vh)",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", color: "var(--pm-violet-600)" }}><IcSearch size={20} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Detectar relaciones</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
              Escanea columnas tipo FK por nombre + matching de contenido contra IDs de otras tablas
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}
            style={{ marginLeft: "auto", padding: "4px 8px", fontSize: 18 }}>×</button>
        </div>

        {scanMut.isPending && (
          <div style={{ padding: "32px 0", textAlign: "center", color: "var(--color-text-muted)" }}>
            Escaneando datasets…
          </div>
        )}

        {scanMut.isError && (
          <p style={{ margin: 0, color: "var(--pm-red-500)", fontSize: 13 }}>
            ⚠ {(scanMut.error as Error)?.message ?? "Error al escanear"}
          </p>
        )}

        {scanMut.data && (
          <>
            {/* Tab switcher */}
            <div style={{
              display: "flex", gap: 4, borderBottom: "1px solid var(--color-border)",
              paddingBottom: 0, marginBottom: -8,
            }}>
              {([
                ["relations", `Relaciones (${scanMut.data.candidates.length})`],
                ["cleanup", `Limpieza sugerida (${scanMut.data.cleanup_suggestions?.length ?? 0})`],
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
              <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 12, padding: "5px 10px" }}
                onClick={() => scanMut.mutate()}>
                ↻ Re-escanear
              </button>
            </div>

            {tab === "relations" && <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                {total} relación{total !== 1 ? "es" : ""} candidata{total !== 1 ? "s" : ""} en {scanned} dataset{scanned !== 1 ? "s" : ""}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {([
                  ["all", "Todas"],
                  ["name+content", "Nombre + contenido"],
                  ["name", "Solo nombre"],
                  ["content", "Solo contenido"],
                ] as [Filter, string][]).map(([k, label]) => (
                  <button key={k}
                    onClick={() => setFilter(k)}
                    style={{
                      padding: "4px 10px", fontSize: 12, borderRadius: 6,
                      border: "1px solid",
                      borderColor: filter === k ? "var(--color-primary)" : "var(--color-border)",
                      background: filter === k ? "var(--color-primary-bg)" : "transparent",
                      color: filter === k ? "var(--color-primary)" : "var(--color-text)",
                      cursor: "pointer", fontWeight: filter === k ? 600 : 400,
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              <input
                placeholder="Filtrar por nombre…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  fontSize: 13, padding: "5px 10px", borderRadius: 6,
                  border: "1px solid var(--color-border)", flexBasis: 220,
                }} />
            </div>

            <div style={{ overflowY: "auto", flex: 1, border: "1px solid var(--color-border)", borderRadius: 8 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
                  No hay candidatos con estos filtros.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg)", position: "sticky", top: 0 }}>
                      <th style={th}>Desde</th>
                      <th style={th}>Columna</th>
                      <th style={th}>→ Hacia</th>
                      <th style={th}>Match</th>
                      <th style={th}>Score</th>
                      <th style={th}>Ejemplos</th>
                      <th style={th}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => {
                    const key = `${c.from_dataset_id}:${c.from_column_id}`;
                    const isApplied = applied.has(key) || c.from_column_type === "relation";
                    const isApplying = applyingKey === key;
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                        <td style={td}>
                          <Link to={`/datasets/${c.from_dataset_id}`} style={{ color: "var(--color-primary)", fontWeight: 600 }}>
                            {c.from_dataset_name}
                          </Link>
                        </td>
                        <td style={td}>
                          <code style={{ fontSize: 12, color: "#DB2777" }}>{c.from_column}</code>
                          {c.from_column_label !== c.from_column && (
                            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{c.from_column_label}</div>
                          )}
                        </td>
                        <td style={td}>
                          <Link to={`/datasets/${c.to_dataset_id}`} style={{ color: "var(--color-primary)", fontWeight: 600 }}>
                            {c.to_dataset_name}
                          </Link>
                          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{c.to_field}</div>
                        </td>
                        <td style={td}>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {c.name_match && <Badge color="#2563EB">nombre</Badge>}
                            {c.content_match_ratio > 0 && (
                              <Badge color="#16A34A">
                                contenido {Math.round(c.content_match_ratio * 100)}%
                              </Badge>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>
                            {c.content_matched}/{c.values_sampled} valores
                          </div>
                        </td>
                        <td style={td}>
                          <ScoreBar score={c.score} />
                        </td>
                        <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-muted)" }}>
                          {c.sample_values.slice(0, 2).map((v) => (
                            <div key={v} style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180, whiteSpace: "nowrap" }}>
                              {v}
                            </div>
                          ))}
                        </td>
                        <td style={td}>
                          {isApplied ? (
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99,
                              background: "#16A34A18", color: "#16A34A", border: "1px solid #16A34A40",
                              whiteSpace: "nowrap",
                            }}>
                              ✓ Aplicada
                            </span>
                          ) : (
                            <button
                              onClick={() => applyMut.mutate(c)}
                              disabled={isApplying}
                              style={{
                                fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 6,
                                border: "1px solid var(--color-primary)", background: "var(--color-primary)",
                                color: "#fff", cursor: isApplying ? "wait" : "pointer", whiteSpace: "nowrap",
                                opacity: isApplying ? 0.6 : 1,
                              }}>
                              {isApplying ? "Aplicando…" : "Aplicar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>
              Score = 0.5 × (nombre coincide) + 0.5 × (proporción de valores que coinciden, insensible a mayúsculas y tildes).
              Hasta 3 destinos por columna fuente; los respaldos están penalizados.
            </p>
            </>}

            {tab === "cleanup" && <CleanupTab
              suggestions={scanMut.data.cleanup_suggestions ?? []}
              normalized={normalized}
              normalizingKey={normalizingKey}
              onNormalize={(s) => normalizeMut.mutate(s)}
            />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Tab: Limpieza de variantes ────────────────────────────────────────────────
function CleanupTab({
  suggestions, normalized, normalizingKey, onNormalize,
}: {
  suggestions: CleanupSuggestion[];
  normalized: Set<string>;
  normalizingKey: string | null;
  onNormalize: (s: CleanupSuggestion) => void;
}) {
  if (suggestions.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
        No detectamos columnas con variantes por mayúsculas, tildes o espacios.
        Los datos están razonablemente limpios.
      </div>
    );
  }
  return (
    <>
      <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>
        Estas columnas tienen valores que solo difieren en mayúsculas, tildes o espacios
        (ej. <code>Comercio</code>, <code>COMERCIO</code>, <code>comercio</code>). Unificarlas
        antes de buscar relaciones suele revelar conexiones ocultas con catálogos.
      </p>
      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {suggestions.map((s) => {
          const key = `${s.dataset_id}:${s.column_id}`;
          const isDone = normalized.has(key);
          const isPending = normalizingKey === key;
          return (
            <div key={key} style={{
              border: "1px solid var(--color-border)", borderRadius: 10, padding: "12px 14px",
              background: isDone ? "#F0FDF4" : "var(--color-surface)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Link to={`/datasets/${s.dataset_id}`} style={{ fontSize: 14, fontWeight: 700, color: "var(--color-primary)" }}>
                      {s.dataset_name}
                    </Link>
                    <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>·</span>
                    <code style={{ fontSize: 12, color: "#DB2777", fontWeight: 600 }}>{s.column}</code>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>({s.column_label})</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
                    <strong style={{ color: "var(--color-text)" }}>{s.raw_unique}</strong> valores únicos →
                    <strong style={{ color: "#16A34A", marginLeft: 4 }}>{s.normalized_unique}</strong> si se unifican
                    {" · "}
                    <strong style={{ color: "#D97706" }}>{s.dirty_groups}</strong> grupos con variantes
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {s.examples.map((ex, i) => (
                      <div key={i} style={{ fontSize: 12, lineHeight: 1.5 }}>
                        {ex.variants.map((v, j) => (
                          <span key={j}>
                            <code style={{
                              background: v === ex.canonical ? "#16A34A22" : "var(--color-bg)",
                              color: v === ex.canonical ? "#15803D" : "var(--color-text-secondary)",
                              padding: "1px 6px", borderRadius: 4,
                              fontWeight: v === ex.canonical ? 700 : 400,
                            }}>{v}</code>
                            {j < ex.variants.length - 1 && <span style={{ color: "var(--color-text-muted)", margin: "0 4px" }}>/</span>}
                          </span>
                        ))}
                        <span style={{ color: "var(--color-text-muted)", marginLeft: 8 }}>
                          → unificar como <strong style={{ color: "#15803D" }}>{ex.canonical}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {isDone ? (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99,
                      background: "#16A34A18", color: "#16A34A", border: "1px solid #16A34A40",
                      whiteSpace: "nowrap",
                    }}>
                      ✓ Normalizada
                    </span>
                  ) : (
                    <button
                      onClick={() => onNormalize(s)}
                      disabled={isPending}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 6,
                        border: "1px solid #16A34A", background: "#16A34A",
                        color: "#fff", cursor: isPending ? "wait" : "pointer", whiteSpace: "nowrap",
                        opacity: isPending ? 0.6 : 1,
                      }}>
                      {isPending ? "Normalizando…" : "Normalizar"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>
        Al normalizar, cada variante de un grupo se reemplaza por la <strong>forma más frecuente</strong>.
        Los valores se actualizan directamente en los registros — re-escanea después para ver nuevas relaciones.
      </p>
    </>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
      background: color + "1a", color, border: `1px solid ${color}40`, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.75 ? "#16A34A" : score >= 0.5 ? "#D97706" : "#94A3B8";
  return (
    <div style={{ minWidth: 80 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</div>
      <div style={{ width: 70, height: 4, background: "var(--color-border-light)", borderRadius: 2, marginTop: 2 }}>
        <div style={{ width: `${pct}%`, height: 4, background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

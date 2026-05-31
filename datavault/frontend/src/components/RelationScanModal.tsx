import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Sparkles, X, RotateCw, ArrowRight, AlertTriangle, Check, ExternalLink, Search,
} from "lucide-react";
import { scanRelationships, updateColumn, normalizeColumnValues } from "../api/datasets";
import type { RelationCandidate, CleanupSuggestion } from "../api/datasets";
import { useToast } from "./Toast";
import { useEscapeKey } from "../utils/useEscapeKey";
import { Badge, Btn, Chip, TONE } from "./ui/kit";

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
  const cleanupCount = scanMut.data?.cleanup_suggestions?.length ?? 0;
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
          width: "100%", maxWidth: 1080, maxHeight: "92vh",
          display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-4)", boxShadow: "var(--shadow-4)",
          animation: "ogPop var(--t-slow)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "18px 20px", borderBottom: "1px solid var(--border)",
        }}>
          <span style={{
            display: "grid", placeItems: "center", width: 38, height: 38,
            borderRadius: "var(--r-2)", background: relBg, color: relFg, flex: "none",
          }}>
            <Sparkles size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>
              Detectar relaciones
            </div>
            <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3 }}>
              El contenido manda: score = 0.85 × contenido + 0.15 × nombre
            </div>
          </div>
          <button
            onClick={onClose}
            className="og-iconbtn"
            style={{
              width: 32, height: 32, display: "grid", placeItems: "center",
              border: "none", background: "transparent", borderRadius: 8,
              cursor: "pointer", color: "var(--text-mute)", flex: "none",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflow: "auto", flex: 1, display: "flex", flexDirection: "column" }}>
          {scanMut.isPending && (
            <div style={{
              padding: "48px 0", textAlign: "center",
              font: "400 14px/1.5 var(--font-sans)", color: "var(--text-soft)",
            }}>
              Escaneando datasets…
            </div>
          )}

          {scanMut.isError && (
            <div style={{
              display: "flex", alignItems: "center", gap: 9,
              padding: "12px 14px", borderRadius: "var(--r-2)",
              background: "var(--danger-soft)",
              border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
              font: "500 13px/1.4 var(--font-sans)", color: "var(--danger)",
            }}>
              <AlertTriangle size={16} />
              {(scanMut.error as Error)?.message ?? "Error al escanear"}
            </div>
          )}

          {scanMut.data && (
            <>
              {/* Tab switcher */}
              <div style={{
                display: "flex", alignItems: "center", gap: 2,
                borderBottom: "1px solid var(--border)", marginBottom: 16,
              }}>
                {([
                  ["relations", `Relaciones (${total})`],
                  ["cleanup", `Limpieza sugerida (${cleanupCount})`],
                ] as [Tab, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    style={{
                      font: `${tab === k ? 600 : 500} 13px/1 var(--font-sans)`,
                      padding: "9px 13px", border: "none", background: "transparent",
                      cursor: "pointer",
                      color: tab === k ? "var(--text)" : "var(--text-soft)",
                      borderBottom: tab === k ? "2px solid var(--accent-rel)" : "2px solid transparent",
                      marginBottom: -1, transition: "color var(--t-fast)",
                    }}
                  >
                    {label}
                  </button>
                ))}
                <Btn
                  variant="ghost"
                  size="sm"
                  icon={<RotateCw size={14} />}
                  onClick={() => scanMut.mutate()}
                  style={{ marginLeft: "auto" }}
                >
                  Re-escanear
                </Btn>
              </div>

              {tab === "relations" && (
                <>
                  {/* Filtros + búsqueda */}
                  <div style={{
                    display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14,
                  }}>
                    <span style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)" }}>
                      {total} relación{total !== 1 ? "es" : ""} candidata{total !== 1 ? "s" : ""} en{" "}
                      {scanned} dataset{scanned !== 1 ? "s" : ""}
                    </span>

                    <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {([
                        ["all", "Todas"],
                        ["name+content", "Nombre + contenido"],
                        ["name", "Solo nombre"],
                        ["content", "Solo contenido"],
                      ] as [Filter, string][]).map(([k, label]) => {
                        const on = filter === k;
                        return (
                          <button
                            key={k}
                            onClick={() => setFilter(k)}
                            style={{
                              font: `${on ? 600 : 500} 12px/1 var(--font-sans)`,
                              padding: "6px 11px", borderRadius: "var(--r-pill)", cursor: "pointer",
                              border: `1px solid ${on ? "color-mix(in srgb, var(--accent-pri) 35%, transparent)" : "var(--border)"}`,
                              background: on ? "var(--pri-soft)" : "var(--surface)",
                              color: on ? "var(--accent-pri)" : "var(--text-soft)",
                              transition: "all var(--t-fast)", whiteSpace: "nowrap",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ position: "relative", flexBasis: 240, flexGrow: 0 }}>
                      <Search
                        size={15}
                        style={{
                          position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
                          color: "var(--text-mute)", pointerEvents: "none",
                        }}
                      />
                      <input
                        placeholder="Filtrar por nombre…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        style={{
                          width: "100%", height: 34, padding: "0 11px 0 32px",
                          borderRadius: "var(--r-2)", border: "1px solid var(--border)",
                          background: "var(--surface)", color: "var(--text)",
                          font: "400 13px/1 var(--font-sans)", outline: "none",
                        }}
                      />
                    </div>
                  </div>

                  {/* Lista de candidatos */}
                  {filtered.length === 0 ? (
                    <div style={{
                      padding: 40, textAlign: "center",
                      font: "400 13.5px/1.5 var(--font-sans)", color: "var(--text-soft)",
                    }}>
                      No hay candidatos con estos filtros.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                      {filtered.map((c, i) => {
                        const key = `${c.from_dataset_id}:${c.from_column_id}`;
                        const isApplied = applied.has(key) || c.from_column_type === "relation";
                        const isApplying = applyingKey === key;
                        return (
                          <RelationRow
                            key={i}
                            c={c}
                            isApplied={isApplied}
                            isApplying={isApplying}
                            onApply={() => applyMut.mutate(c)}
                          />
                        );
                      })}
                    </div>
                  )}

                  <p style={{
                    margin: "16px 0 0", font: "400 11.5px/1.6 var(--font-sans)", color: "var(--text-mute)",
                  }}>
                    Score = 0.85 × (proporción de valores que coinciden, insensible a mayúsculas y tildes)
                    + 0.15 × (el nombre coincide, solo como refuerzo). El contenido manda: un match de puro
                    nombre, sin datos que lo respalden, queda al fondo. Hasta 3 destinos por columna fuente;
                    los respaldos están penalizados.
                  </p>
                </>
              )}

              {tab === "cleanup" && (
                <CleanupTab
                  suggestions={scanMut.data.cleanup_suggestions ?? []}
                  normalized={normalized}
                  normalizingKey={normalizingKey}
                  onNormalize={(s) => normalizeMut.mutate(s)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Fila de relación candidata ────────────────────────────────────────────────
function RelationRow({
  c, isApplied, isApplying, onApply,
}: {
  c: RelationCandidate;
  isApplied: boolean;
  isApplying: boolean;
  onApply: () => void;
}) {
  const contentPct = Math.round(c.content_match_ratio * 100);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "11px 14px", borderRadius: "var(--r-3)",
      border: "1px solid var(--border)", background: "var(--surface)",
    }}>
      {/* Desde → Hacia */}
      <span style={{ display: "flex", alignItems: "center", gap: 7, flex: "1 1 280px", minWidth: 0, flexWrap: "wrap" }}>
        <Link to={`/datasets/${c.from_dataset_id}`} style={{ textDecoration: "none" }} title={c.from_dataset_name}>
          <Chip tone="rel" icon={<ExternalLink size={11} />}>{c.from_dataset_name}</Chip>
        </Link>
        <span className="mono" style={{ font: "400 11.5px/1 var(--font-mono)", color: "var(--text-mute)" }}>
          .{c.from_column}
        </span>
        <ArrowRight size={14} color="var(--text-mute)" style={{ flex: "none" }} />
        <Link to={`/datasets/${c.to_dataset_id}`} style={{ textDecoration: "none" }} title={c.to_dataset_name}>
          <Chip tone="primary">{c.to_dataset_name}</Chip>
        </Link>
        <span className="mono" style={{ font: "400 11px/1 var(--font-mono)", color: "var(--text-mute)" }}>
          {c.to_field}
        </span>
      </span>

      {/* Badges de match */}
      <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start", flex: "none", minWidth: 150 }}>
        <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {c.content_match_ratio > 0 && (
            <Badge tone="success">contenido {contentPct}%</Badge>
          )}
          {c.name_match && !c.name_only && <Badge tone="primary">nombre</Badge>}
          {c.name_only && <Badge tone="warn">solo nombre · sin datos</Badge>}
        </span>
        <span style={{ font: "400 10.5px/1 var(--font-sans)", color: "var(--text-mute)" }}>
          {c.content_matched}/{c.values_sampled} valores
        </span>
      </span>

      {/* Score con barra */}
      <ScoreBar score={c.score} />

      {/* Ejemplos */}
      <span className="mono" style={{
        flex: "none", width: 150, font: "400 11px/1.4 var(--font-mono)", color: "var(--text-mute)",
      }}>
        {c.sample_values.slice(0, 2).map((v) => (
          <span key={v} style={{
            display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {v}
          </span>
        ))}
      </span>

      {/* Acción */}
      <span style={{ flex: "none" }}>
        {isApplied ? (
          <Badge tone="success" style={{ padding: "5px 10px" }}>
            <Check size={12} /> Aplicada
          </Badge>
        ) : (
          <Btn
            variant={c.score >= 0.5 ? "primary" : "soft"}
            size="sm"
            disabled={isApplying}
            onClick={onApply}
          >
            {isApplying ? "Aplicando…" : "Aplicar"}
          </Btn>
        )}
      </span>
    </div>
  );
}

// ── Barra de score ─────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const tone = score >= 0.75 ? "var(--success)" : score >= 0.5 ? "var(--warning)" : "var(--text-mute)";
  return (
    <span style={{ flex: "none", width: 72 }}>
      <span className="mono" style={{ display: "block", font: "700 13px/1 var(--font-mono)", color: tone }}>
        {pct}%
      </span>
      <span style={{
        display: "block", width: "100%", height: 4, borderRadius: 2,
        background: "var(--surface-alt)", marginTop: 4, overflow: "hidden",
      }}>
        <span style={{ display: "block", width: `${pct}%`, height: 4, borderRadius: 2, background: tone }} />
      </span>
    </span>
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
      <div style={{
        padding: 48, textAlign: "center",
        font: "400 13.5px/1.6 var(--font-sans)", color: "var(--text-soft)",
      }}>
        No detectamos columnas con variantes por mayúsculas, tildes o espacios.
        Los datos están razonablemente limpios.
      </div>
    );
  }
  const code: CSSProperties = {
    font: "500 11.5px/1 var(--font-mono)", padding: "2px 6px", borderRadius: 5,
    background: "var(--surface-alt)", color: "var(--text-soft)",
  };
  return (
    <>
      <p style={{ margin: "0 0 14px", font: "400 13px/1.6 var(--font-sans)", color: "var(--text-soft)" }}>
        Estas columnas tienen valores que solo difieren en mayúsculas, tildes o espacios
        (ej. <code className="mono" style={code}>Comercio</code>{" "}
        <code className="mono" style={code}>COMERCIO</code>{" "}
        <code className="mono" style={code}>comercio</code>). Unificarlas antes de buscar
        relaciones suele revelar conexiones ocultas con catálogos.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {suggestions.map((s) => {
          const key = `${s.dataset_id}:${s.column_id}`;
          const isDone = normalized.has(key);
          const isPending = normalizingKey === key;
          return (
            <div key={key} style={{
              border: "1px solid var(--border)", borderRadius: "var(--r-3)", padding: "13px 15px",
              background: isDone ? "var(--success-soft)" : "var(--surface)",
              transition: "background var(--t-mid)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <Link
                      to={`/datasets/${s.dataset_id}`}
                      style={{ font: "700 14px/1 var(--font-sans)", color: "var(--accent-pri)", textDecoration: "none" }}
                    >
                      {s.dataset_name}
                    </Link>
                    <span style={{ color: "var(--text-mute)" }}>·</span>
                    <code className="mono" style={{ font: "600 12px/1 var(--font-mono)", color: "var(--accent-rel)" }}>
                      {s.column}
                    </code>
                    <span style={{ font: "400 11.5px/1 var(--font-sans)", color: "var(--text-mute)" }}>
                      ({s.column_label})
                    </span>
                  </div>

                  <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--text-soft)", marginBottom: 8 }}>
                    <strong style={{ color: "var(--text)" }}>{s.raw_unique}</strong> valores únicos →{" "}
                    <strong style={{ color: "var(--success)" }}>{s.normalized_unique}</strong> si se unifican
                    {" · "}
                    <strong style={{ color: "var(--warning)" }}>{s.dirty_groups}</strong> grupos con variantes
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {s.examples.map((ex, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", font: "400 12px/1 var(--font-sans)" }}>
                        {ex.variants.map((v, j) => (
                          <Variant key={j} value={v} canonical={v === ex.canonical} last={j === ex.variants.length - 1} />
                        ))}
                        <span style={{ color: "var(--text-mute)", marginLeft: 4 }}>→ unificar como</span>
                        <Chip tone="success">{ex.canonical}</Chip>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ flex: "none" }}>
                  {isDone ? (
                    <Badge tone="success" style={{ padding: "5px 10px" }}>
                      <Check size={12} /> Normalizada
                    </Badge>
                  ) : (
                    <Btn variant="soft" size="sm" disabled={isPending} onClick={() => onNormalize(s)}>
                      {isPending ? "Normalizando…" : "Normalizar"}
                    </Btn>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ margin: "16px 0 0", font: "400 11.5px/1.6 var(--font-sans)", color: "var(--text-mute)" }}>
        Al normalizar, cada variante de un grupo se reemplaza por la <strong>forma más frecuente</strong>.
        Los valores se actualizan directamente en los registros — re-escanea después para ver nuevas relaciones.
      </p>
    </>
  );
}

// ── Píldora de variante (resalta la forma canónica) ────────────────────────────
function Variant({ value, canonical, last }: { value: string; canonical: boolean; last: boolean }): ReactNode {
  return (
    <>
      <code className="mono" style={{
        font: `${canonical ? 700 : 400} 10.5px/1 var(--font-mono)`,
        padding: "2px 6px", borderRadius: 5,
        background: canonical ? "var(--success-soft)" : "var(--surface-alt)",
        color: canonical ? "var(--success)" : "var(--text-soft)",
      }}>
        {value}
      </code>
      {!last && <span style={{ color: "var(--text-mute)" }}>/</span>}
    </>
  );
}

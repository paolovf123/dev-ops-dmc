import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Lock, X, Search, Plus, ArrowUpRight, Trash2, Check, Layers, GitBranch,
} from "lucide-react";
import {
  getGroupDatasetAccess, getUserDatasetAccess,
  setDatasetGroupPermission, removeDatasetGroupPermission,
  getDatasets,
} from "../api/datasets";
import type { UserDatasetAccess } from "../api/datasets";
import { useEscapeKey } from "../utils/useEscapeKey";
import { Badge, Btn, type Tone } from "./ui/kit";
import { useToast } from "./Toast";

interface Props {
  open: boolean;
  onClose: () => void;
  /** El sujeto del que listar accesos: grupo o usuario */
  subject: { kind: "group" | "user"; id: string; name: string };
  /** Workspace al que pertenece el grupo (necesario para listar candidatos al agregar). */
  workspaceId?: string;
}

// ── Segmentado de rol (Sin acceso / Ver / Editar / Admin) ─────────────────────
// Mapea las claves del backend (none/viewer/editor/admin) a la paleta del handoff.
type RoleKey = "none" | "viewer" | "editor" | "admin";
const ROLE_SEG: { key: RoleKey; label: string; color: string }[] = [
  { key: "none",   label: "Sin acceso", color: "var(--text-mute)" },
  { key: "viewer", label: "Ver",        color: "var(--accent-pri)" },
  { key: "editor", label: "Editar",     color: "var(--success)" },
  { key: "admin",  label: "Admin",      color: "var(--violet)" },
];

function RoleSeg({
  value, onChange, lock,
}: {
  value: string;
  onChange?: (next: RoleKey) => void;
  lock?: boolean;
}) {
  return (
    <span style={{
      display: "inline-flex", borderRadius: "var(--r-2)",
      border: "1px solid var(--border)", overflow: "hidden",
      opacity: lock ? 0.7 : 1, flex: "none",
    }}>
      {ROLE_SEG.map(({ key, label, color }, i) => {
        const on = value === key;
        return (
          <button key={key} type="button" disabled={lock || !onChange}
            onClick={() => onChange?.(key)}
            style={{
              font: "600 11.5px/1 var(--font-sans)", padding: "6px 10px", border: "none",
              borderLeft: i ? "1px solid var(--border)" : "none",
              cursor: lock || !onChange ? "default" : "pointer",
              background: on ? color : "var(--surface)",
              color: on ? "#fff" : "var(--text-soft)", whiteSpace: "nowrap",
              transition: "background var(--t-fast), color var(--t-fast)",
            }}>
            {label}
          </button>
        );
      })}
    </span>
  );
}

// Origen del permiso → etiqueta + tono del badge
function sourceLabel(source: string): string {
  if (source === "global_admin") return "Admin global del sistema";
  if (source === "direct") return "Permiso directo";
  if (source.startsWith("group:")) return `Grupo: ${source.slice(6)}`;
  if (source.startsWith("workspace:")) return `Workspace (${source.slice(10)})`;
  return source;
}
function sourceBadge(source: string): { label: string; tone: Tone } {
  if (source === "global_admin") return { label: "global", tone: "violet" };
  if (source === "direct") return { label: "directo", tone: "rel" };
  if (source.startsWith("group:")) return { label: "grupo", tone: "calc" };
  if (source.startsWith("workspace:")) return { label: "workspace", tone: "primary" };
  return { label: source, tone: "neutral" };
}

export default function DatasetAccessModal({ open, onClose, subject, workspaceId }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const [wsFilter, setWsFilter] = useState<string>("");
  const [showAdder, setShowAdder] = useState(false);
  const [pickerDsId, setPickerDsId] = useState("");
  const [pickerRole, setPickerRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const [pickerFilter, setPickerFilter] = useState("");
  useEscapeKey(onClose, open);

  const isGroup = subject.kind === "group";
  // Solo editamos para grupos por ahora (el editing de directos por usuario
  // requiere conocer el dataset del cual cambiar permiso — agregable a futuro).
  const canEdit = isGroup;

  const { data, isLoading, error } = useQuery({
    queryKey: ["dataset-access", subject.kind, subject.id],
    queryFn: () =>
      isGroup
        ? getGroupDatasetAccess(subject.id)
        : getUserDatasetAccess(subject.id),
    enabled: open,
    staleTime: 30_000,
  });

  // Datasets disponibles del workspace del grupo (para el adder)
  const { data: wsDatasets = [] } = useQuery({
    queryKey: ["datasets", workspaceId ?? ""],
    queryFn: () => getDatasets(workspaceId ? { workspace_id: workspaceId } : undefined),
    enabled: open && isGroup && !!workspaceId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dataset-access", subject.kind, subject.id] });
    qc.invalidateQueries({ queryKey: ["dataset-group-permissions"] });
  };

  const setRoleMut = useMutation({
    mutationFn: ({ datasetId, role }: { datasetId: string; role: string }) =>
      setDatasetGroupPermission(datasetId, subject.id, role),
    onSuccess: (_, vars) => {
      invalidate();
      toast(`✓ Permiso actualizado: ${vars.role}`, "success");
    },
    onError: (e: Error) => toast(e.message ?? "Error al actualizar", "error"),
  });

  const removeMut = useMutation({
    mutationFn: (datasetId: string) => removeDatasetGroupPermission(datasetId, subject.id),
    onSuccess: () => {
      invalidate();
      toast("✓ Acceso quitado", "success");
    },
    onError: (e: Error) => toast(e.message ?? "Error al quitar", "error"),
  });

  const addMut = useMutation({
    mutationFn: () => setDatasetGroupPermission(pickerDsId, subject.id, pickerRole),
    onSuccess: () => {
      invalidate();
      toast(`✓ Acceso agregado`, "success");
      setShowAdder(false);
      setPickerDsId("");
      setPickerFilter("");
      setPickerRole("viewer");
    },
    onError: (e: Error) => toast(e.message ?? "Error al agregar", "error"),
  });

  // Lista de workspaces presentes en los datos (para filtro)
  const workspaces = useMemo(() => {
    if (!data) return [];
    const set = new Map<string, string>();
    for (const d of data) {
      const id = d.workspace_id ?? "";
      const name = d.workspace_name ?? "(sin workspace)";
      if (!set.has(id)) set.set(id, name);
    }
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return data.filter((d) => {
      if (wsFilter && (d.workspace_id ?? "") !== wsFilter) return false;
      if (!q) return true;
      return (
        d.dataset_name.toLowerCase().includes(q) ||
        (d.workspace_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, filter, wsFilter]);

  if (!open) return null;

  const sub = isGroup
    ? "Permisos explícitos asignados a este grupo"
    : "Rol efectivo · prioridad: directo › grupo › workspace › rol global";

  // ── primitivos de estilo locales ─────────────────────────────────────────────
  const inputStyle: CSSProperties = {
    height: 38, padding: "0 11px 0 34px", borderRadius: "var(--r-2)",
    border: "1px solid var(--border)", background: "var(--surface)",
    font: "400 13.5px/1 var(--font-sans)", color: "var(--text)", outline: "none",
  };

  return (
    <div onMouseDown={onClose} style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "var(--overlay)", backdropFilter: "blur(5px)",
      display: "grid", placeItems: "center", padding: 24, animation: "ogFade var(--t-mid)",
    }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 760, maxHeight: "90vh", display: "flex", flexDirection: "column",
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r-4)", boxShadow: "var(--shadow-4)",
        animation: "ogPop var(--t-slow)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "18px 20px", borderBottom: "1px solid var(--border)",
        }}>
          <span style={{
            display: "grid", placeItems: "center", width: 38, height: 38,
            borderRadius: "var(--r-2)", background: "var(--violet-soft)", color: "var(--violet)", flex: "none",
          }}>
            <Lock size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>
              Datasets accesibles · {subject.name}
            </div>
            <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3 }}>
              {sub}
            </div>
          </div>
          <button onClick={onClose} className="og-iconbtn" style={{
            width: 32, height: 32, display: "grid", placeItems: "center",
            border: "none", background: "transparent", borderRadius: 8,
            cursor: "pointer", color: "var(--text-mute)", flex: "none",
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Toolbar: buscar + filtro de workspace + contador */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <Search size={15} style={{
                position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
                color: "var(--text-mute)", pointerEvents: "none",
              }} />
              <input
                type="text"
                placeholder="Buscar dataset o workspace…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            {workspaces.length > 1 && (
              <select value={wsFilter} onChange={(e) => setWsFilter(e.target.value)}
                style={{
                  height: 38, padding: "0 10px", borderRadius: "var(--r-2)",
                  border: "1px solid var(--border)", background: "var(--surface)",
                  font: "400 13px/1 var(--font-sans)", color: "var(--text)", cursor: "pointer",
                }}>
                <option value="">Todos los workspaces</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            )}
            {data && (
              <span style={{ font: "500 12px/1 var(--font-sans)", color: "var(--text-mute)" }}>
                {filtered.length} de {data.length}
              </span>
            )}
          </div>

          {/* Lista de accesos */}
          {isLoading ? (
            <Empty>Cargando…</Empty>
          ) : error ? (
            <Empty tone="danger">Error: {(error as Error).message}</Empty>
          ) : !data || data.length === 0 ? (
            <Empty>
              {isGroup
                ? "Este grupo no tiene permisos asignados a ningún dataset todavía."
                : "Este usuario no tiene acceso a ningún dataset."}
            </Empty>
          ) : filtered.length === 0 ? (
            <Empty>Sin resultados para "{filter}".</Empty>
          ) : (
            <div style={{
              display: "flex", flexDirection: "column",
              border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden",
            }}>
              {filtered.map((d, idx) => {
                const userSource = !isGroup ? (d as UserDatasetAccess).source : undefined;
                const badge = userSource ? sourceBadge(userSource) : null;
                return (
                  <div key={d.dataset_id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                    borderBottom: idx < filtered.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <span style={{
                      display: "grid", placeItems: "center", width: 34, height: 34, flex: "none",
                      borderRadius: "var(--r-2)",
                      background: d.is_bridge ? "var(--calc-soft)" : "var(--pri-soft)",
                      color: d.is_bridge ? "var(--accent-calc)" : "var(--accent-pri)",
                    }}>
                      {d.is_bridge ? <GitBranch size={17} /> : <Layers size={17} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <Link to={`/datasets/${d.dataset_id}`} style={{
                          font: "600 13.5px/1.2 var(--font-sans)", color: "var(--text)",
                          textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {d.dataset_name}
                        </Link>
                        {d.is_bridge && <Badge tone="calc">intermedia</Badge>}
                      </span>
                      <span style={{
                        display: "block", font: "400 12px/1.3 var(--font-sans)",
                        color: "var(--text-mute)", marginTop: 2,
                      }}>
                        {d.workspace_name ?? "— sin workspace"}
                        {userSource && <> · {sourceLabel(userSource)}</>}
                      </span>
                    </span>

                    {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}

                    {canEdit ? (
                      <RoleSeg
                        value={d.role}
                        onChange={(role) => setRoleMut.mutate({ datasetId: d.dataset_id, role })}
                        lock={setRoleMut.isPending}
                      />
                    ) : (
                      <RoleSeg value={d.role} />
                    )}

                    <Link to={`/datasets/${d.dataset_id}`} title="Abrir dataset"
                      className="og-iconbtn" style={{
                        width: 32, height: 32, display: "grid", placeItems: "center",
                        borderRadius: 8, color: "var(--text-soft)", flex: "none",
                      }}>
                      <ArrowUpRight size={16} />
                    </Link>
                    {canEdit && (
                      <button
                        title="Quitar acceso"
                        onClick={() => {
                          if (confirm(`¿Quitar acceso de ${subject.name} al dataset "${d.dataset_name}"?`)) {
                            removeMut.mutate(d.dataset_id);
                          }
                        }}
                        disabled={removeMut.isPending}
                        className="og-iconbtn" style={{
                          width: 32, height: 32, display: "grid", placeItems: "center",
                          border: "none", background: "transparent", borderRadius: 8,
                          cursor: removeMut.isPending ? "not-allowed" : "pointer",
                          color: "var(--danger)", flex: "none",
                        }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Editor: agregar nuevo dataset al grupo */}
          {canEdit && workspaceId && (
            showAdder ? (
              <div style={{
                padding: 14, borderRadius: "var(--r-3)",
                background: "var(--pri-soft)", border: "1px solid color-mix(in srgb, var(--accent-pri) 30%, transparent)",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Plus size={15} color="var(--accent-pri)" />
                  <strong style={{ font: "700 13px/1 var(--font-sans)", color: "var(--text)" }}>
                    Dar acceso a otro dataset
                  </strong>
                  <button onClick={() => { setShowAdder(false); setPickerDsId(""); setPickerFilter(""); }}
                    className="og-iconbtn" style={{
                      marginLeft: "auto", width: 28, height: 28, display: "grid", placeItems: "center",
                      background: "transparent", border: "none", borderRadius: 8,
                      cursor: "pointer", color: "var(--text-mute)",
                    }}>
                    <X size={15} />
                  </button>
                </div>
                {(() => {
                  const q = pickerFilter.trim().toLowerCase();
                  const usedIds = new Set((data ?? []).map((d) => d.dataset_id));
                  const available = wsDatasets.filter((d) => !usedIds.has(d.id));
                  const filteredAvail = q
                    ? available.filter((d) => d.name.toLowerCase().includes(q))
                    : available;
                  return (
                    <>
                      <div style={{ position: "relative" }}>
                        <Search size={15} style={{
                          position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
                          color: "var(--text-mute)", pointerEvents: "none",
                        }} />
                        <input
                          type="text"
                          placeholder="Buscar dataset…"
                          value={pickerFilter}
                          onChange={(e) => setPickerFilter(e.target.value)}
                          style={{ ...inputStyle, width: "100%" }}
                        />
                      </div>
                      <div style={{
                        maxHeight: 180, overflowY: "auto",
                        border: "1px solid var(--border)", borderRadius: "var(--r-2)",
                        background: "var(--surface)",
                      }}>
                        {filteredAvail.length === 0 ? (
                          <p style={{ padding: "10px 12px", font: "400 12.5px/1.4 var(--font-sans)", color: "var(--text-mute)", margin: 0 }}>
                            {available.length === 0
                              ? "El grupo ya tiene acceso a todos los datasets del workspace."
                              : `Sin resultados para "${pickerFilter}".`}
                          </p>
                        ) : filteredAvail.map((d, i) => {
                          const sel = pickerDsId === d.id;
                          return (
                            <button key={d.id} onClick={() => setPickerDsId(d.id)}
                              className="og-menu-item"
                              style={{
                                width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8,
                                background: sel ? "var(--pri-soft)" : undefined,
                                border: "none", padding: "8px 12px",
                                font: `${sel ? 600 : 400} 13px/1 var(--font-sans)`,
                                cursor: "pointer",
                                borderBottom: i < filteredAvail.length - 1 ? "1px solid var(--border)" : "none",
                                color: sel ? "var(--accent-pri)" : "var(--text)",
                              }}>
                              {sel
                                ? <Check size={15} color="var(--accent-pri)" />
                                : <span style={{ width: 15, flex: "none" }} />}
                              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {d.name}
                              </span>
                              {d.is_bridge && <Badge tone="calc">intermedia</Badge>}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ font: "600 12.5px/1 var(--font-sans)", color: "var(--text-soft)" }}>Rol:</span>
                        <RoleSeg value={pickerRole} onChange={(r) => r !== "none" && setPickerRole(r)} />
                        <Btn variant="primary" icon={addMut.isPending ? undefined : <Check size={16} />}
                          disabled={!pickerDsId || addMut.isPending}
                          onClick={() => addMut.mutate()}
                          style={{ marginLeft: "auto" }}>
                          {addMut.isPending ? "Guardando…" : "Dar acceso"}
                        </Btn>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <Btn variant="soft" icon={<Plus size={16} />} onClick={() => setShowAdder(true)}
                style={{ alignSelf: "flex-start" }}>
                Dar acceso a otro dataset
              </Btn>
            )
          )}

          {/* Leyenda solo para usuarios (orígenes del permiso) */}
          {!isGroup && data && data.length > 0 && (
            <p style={{
              margin: 0, font: "400 11.5px/1.5 var(--font-sans)", color: "var(--text-mute)",
              display: "flex", alignItems: "flex-start", gap: 7,
            }}>
              <Lock size={13} style={{ flex: "none", marginTop: 1 }} />
              <span>
                <strong>Origen:</strong> directo (permiso individual) · grupo (vía membresía) ·
                workspace (por ser miembro) · global (admin del sistema, ve todo).
                Prioridad: directo › grupo › workspace.
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Estado vacío / cargando / error
function Empty({ children, tone }: { children: ReactNode; tone?: "danger" }) {
  return (
    <div style={{
      padding: 40, textAlign: "center",
      border: "1px solid var(--border)", borderRadius: "var(--r-3)",
      background: "var(--surface-alt)",
      font: "400 13px/1.5 var(--font-sans)",
      color: tone === "danger" ? "var(--danger)" : "var(--text-mute)",
    }}>
      {children}
    </div>
  );
}

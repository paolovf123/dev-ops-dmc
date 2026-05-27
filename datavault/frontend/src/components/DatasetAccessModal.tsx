import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  getGroupDatasetAccess, getUserDatasetAccess,
  setDatasetGroupPermission, removeDatasetGroupPermission,
  getDatasets,
} from "../api/datasets";
import type { GroupDatasetAccess, UserDatasetAccess } from "../api/datasets";
import { useEscapeKey } from "../utils/useEscapeKey";
import { DS_ROLE_STYLE as ROLE_STYLE, modalTh as th, modalTd as td } from "../utils/ui";
import { useToast } from "./Toast";

interface Props {
  open: boolean;
  onClose: () => void;
  /** El sujeto del que listar accesos: grupo o usuario */
  subject: { kind: "group" | "user"; id: string; name: string };
  /** Workspace al que pertenece el grupo (necesario para listar candidatos al agregar). */
  workspaceId?: string;
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

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "var(--color-surface)", borderRadius: 14, padding: "24px 28px",
        width: "min(960px, 96vw)", height: "min(720px, 92vh)",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)", gap: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 22 }}>{isGroup ? "" : ""}</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
              Datasets accesibles · {subject.name}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
              {isGroup
                ? "Permisos explícitos asignados a este grupo"
                : "Rol efectivo (combina permisos directos, de grupo y de workspace)"}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}
            style={{ marginLeft: "auto", padding: "4px 8px", fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Buscar dataset o workspace…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              flex: 1, minWidth: 220,
              fontSize: 13, padding: "6px 10px", borderRadius: 6,
              border: "1px solid var(--color-border)",
            }}
          />
          {workspaces.length > 1 && (
            <select value={wsFilter} onChange={(e) => setWsFilter(e.target.value)}
              style={{ fontSize: 13, padding: "6px 10px", borderRadius: 6 }}>
              <option value="">Todos los workspaces</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
          {data && (
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {filtered.length} de {data.length}
            </span>
          )}
        </div>

        <div style={{ overflowY: "auto", flex: 1, border: "1px solid var(--color-border)", borderRadius: 8 }}>
          {isLoading ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)" }}>
              Cargando…
            </div>
          ) : error ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--pm-red-500)", fontSize: 13 }}>
              Error: {(error as Error).message}
            </div>
          ) : !data || data.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)" }}>
              {isGroup
                ? "Este grupo no tiene permisos asignados a ningún dataset todavía."
                : "Este usuario no tiene acceso a ningún dataset."}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
              Sin resultados para "{filter}".
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--color-bg)", position: "sticky", top: 0 }}>
                  <th style={th}>Dataset</th>
                  <th style={th}>Workspace</th>
                  <th style={th}>Rol</th>
                  {!isGroup && <th style={th}>Origen del permiso</th>}
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const style = ROLE_STYLE[d.role] ?? ROLE_STYLE.viewer;
                  return (
                    <tr key={d.dataset_id} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                      <td style={td}>
                        <Link to={`/datasets/${d.dataset_id}`}
                          style={{ color: "var(--color-primary)", fontWeight: 600 }}>
                          {d.dataset_name}
                        </Link>
                        {d.is_bridge && (
                          <span style={{
                            marginLeft: 6, fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                            background: "#7C3AED20", color: "#7C3AED", textTransform: "uppercase",
                          }}>intermedia</span>
                        )}
                      </td>
                      <td style={{ ...td, color: "var(--color-text-secondary)" }}>
                        {d.workspace_name ?? <em style={{ color: "var(--color-text-muted)" }}>—</em>}
                      </td>
                      <td style={td}>
                        {canEdit ? (
                          <select
                            value={d.role}
                            disabled={setRoleMut.isPending}
                            onChange={(e) => setRoleMut.mutate({ datasetId: d.dataset_id, role: e.target.value })}
                            style={{
                              fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99,
                              background: style.bg, color: style.fg, border: `1px solid ${style.fg}40`,
                              cursor: "pointer",
                            }}>
                            <option value="admin">Admin</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Visualizar</option>
                            <option value="none">Sin acceso (bloqueo)</option>
                          </select>
                        ) : (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99,
                            background: style.bg, color: style.fg, border: `1px solid ${style.fg}40`,
                          }}>
                            {style.label}
                          </span>
                        )}
                      </td>
                      {!isGroup && (
                        <td style={{ ...td, fontSize: 11, color: "var(--color-text-muted)" }}>
                          {sourceLabel((d as UserDatasetAccess).source)}
                        </td>
                      )}
                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
                          <Link to={`/datasets/${d.dataset_id}`}
                            style={{
                              fontSize: 11, color: "var(--color-primary)",
                              textDecoration: "underline",
                            }}>
                            abrir →
                          </Link>
                          {canEdit && (
                            <button
                              onClick={() => {
                                if (confirm(`¿Quitar acceso de ${subject.name} al dataset "${d.dataset_name}"?`)) {
                                  removeMut.mutate(d.dataset_id);
                                }
                              }}
                              disabled={removeMut.isPending}
                              style={{
                                fontSize: 11, padding: "2px 8px", borderRadius: 4,
                                border: "1px solid #DC2626", background: "#fff",
                                color: "#DC2626", cursor: "pointer",
                              }}>
                              Quitar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Editor: agregar nuevo dataset al grupo */}
        {canEdit && workspaceId && (
          showAdder ? (
            <div style={{
              padding: "12px 14px", borderRadius: 8,
              background: "var(--color-primary-bg)", border: "1px solid var(--color-primary)",
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ fontSize: 13 }}>+ Dar acceso a otro dataset</strong>
                <button onClick={() => { setShowAdder(false); setPickerDsId(""); setPickerFilter(""); }}
                  style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--color-text-muted)" }}>
                  ×
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
                    <input
                      type="text"
                      placeholder="Buscar dataset…"
                      value={pickerFilter}
                      onChange={(e) => setPickerFilter(e.target.value)}
                      style={{
                        fontSize: 13, padding: "6px 10px", borderRadius: 6,
                        border: "1px solid var(--color-border)",
                      }}
                    />
                    <div style={{
                      maxHeight: 180, overflowY: "auto",
                      border: "1px solid var(--color-border)", borderRadius: 6,
                      background: "var(--color-surface)",
                    }}>
                      {filteredAvail.length === 0 ? (
                        <p style={{ padding: "10px 12px", fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
                          {available.length === 0
                            ? "El grupo ya tiene acceso a todos los datasets del workspace."
                            : `Sin resultados para "${pickerFilter}".`}
                        </p>
                      ) : filteredAvail.map((d) => (
                        <button key={d.id} onClick={() => setPickerDsId(d.id)}
                          style={{
                            width: "100%", textAlign: "left", background: pickerDsId === d.id ? "var(--color-primary-bg)" : "none",
                            border: "none", padding: "6px 12px", fontSize: 13, cursor: "pointer",
                            borderBottom: "1px solid var(--color-border-light)",
                            color: "var(--color-text)",
                            fontWeight: pickerDsId === d.id ? 600 : 400,
                          }}>
                          {pickerDsId === d.id && "✓ "}{d.name}
                          {d.is_bridge && (
                            <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", borderRadius: 99, background: "#7C3AED20", color: "#7C3AED" }}>intermedia</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>Rol:</span>
                      {(["admin", "editor", "viewer"] as const).map((r) => {
                        const sel = pickerRole === r;
                        const s = ROLE_STYLE[r];
                        return (
                          <button key={r} onClick={() => setPickerRole(r)}
                            style={{
                              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                              border: `1.5px solid ${s.fg}`,
                              background: sel ? s.bg : "transparent",
                              color: sel ? s.fg : "var(--color-text-muted)",
                              cursor: "pointer",
                            }}>
                            {s.label}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => addMut.mutate()}
                        disabled={!pickerDsId || addMut.isPending}
                        style={{
                          marginLeft: "auto",
                          fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 6,
                          background: pickerDsId ? "var(--color-primary)" : "var(--color-border)",
                          color: "#fff", border: "none",
                          cursor: pickerDsId ? "pointer" : "not-allowed",
                        }}>
                        {addMut.isPending ? "Guardando…" : "Dar acceso"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <button
              onClick={() => setShowAdder(true)}
              style={{
                padding: "10px 16px", fontSize: 13, fontWeight: 600,
                background: "var(--color-primary)", color: "#fff",
                border: "none", borderRadius: 8, cursor: "pointer",
                alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6,
              }}>
              <span style={{ fontSize: 15 }}>＋</span> Dar acceso a otro dataset
            </button>
          )
        )}

        {/* Leyenda solo para usuarios (orígenes del permiso) */}
        {!isGroup && data && data.length > 0 && (
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>
            <strong>Origen:</strong> "directo" (permiso individual) · "grupo:X" (vía membresía a grupo X) ·
            "workspace:rol" (por ser miembro del workspace) · "global_admin" (admin del sistema, ve todo).
            La prioridad es: directo &gt; grupo &gt; workspace.
          </p>
        )}
      </div>
    </div>
  );
}

function sourceLabel(source: string): string {
  if (source === "global_admin") return "Admin global del sistema";
  if (source === "direct") return "Permiso directo";
  if (source.startsWith("group:")) return `Grupo: ${source.slice(6)}`;
  if (source.startsWith("workspace:")) return `Workspace (${source.slice(10)})`;
  return source;
}

// Type guard ya implícito en sourceLabel — los grupos no tienen source
// pero TS necesita el cast en la celda condicional. Ya manejado arriba.

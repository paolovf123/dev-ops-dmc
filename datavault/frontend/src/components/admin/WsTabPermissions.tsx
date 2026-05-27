import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getDatasets, setDatasetGroupPermission, removeDatasetGroupPermission } from "../../api/datasets";
import { getWorkspaceMembers, getWorkspaceAccessMatrix } from "../../api/workspaces";
import { getGroups } from "../../api/groups";
import { DS_ROLE_STYLE } from "../../utils/ui";
import { SearchInput, EmptyState, Badge } from "../ui";
import { IcTable, IcUsers, IcLink } from "../ui/icons";
import { useToast } from "../Toast";

interface Props {
  workspaceId: string;
  workspaceName: string;
  /** Si true, en modo grupos se puede editar el acceso (otorgar/quitar) inline. */
  editable?: boolean;
}

type Mode = "groups" | "users";
type Role = "none" | "viewer" | "editor" | "admin";
const ROLES: Role[] = ["none", "viewer", "editor", "admin"];
const ROLE_LABEL: Record<Role, string> = { none: "Sin acceso", viewer: "Ver", editor: "Editar", admin: "Admin" };

// Color de acento por grupo (consistente por nombre).
const GROUP_COLORS = ["#6366F1", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#0EA5E9", "#EF4444", "#14B8A6", "#7C3AED"];
function groupColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % GROUP_COLORS.length;
  return GROUP_COLORS[h];
}

// ── Control segmentado para asignar rol ───────────────────────────────────────
function RoleSegmented({ value, onChange, busy }: { value: Role; onChange: (r: Role) => void; busy?: boolean }) {
  return (
    <div className="dk-seg" role="group" aria-label="Nivel de acceso">
      {ROLES.map((r) => {
        const active = value === r;
        const accent = r === "none" ? "#94A3B8" : DS_ROLE_STYLE[r].solid;
        return (
          <button key={r} className="dk-seg-btn" data-active={active} disabled={busy}
            onClick={() => !active && onChange(r)}
            style={active ? (r === "none"
              ? { background: "#E2E8F0", color: "var(--color-text-secondary)" }
              : { background: accent, color: "#fff" }) : undefined}>
            {ROLE_LABEL[r]}
          </button>
        );
      })}
    </div>
  );
}

export default function WsTabPermissions({ workspaceId, workspaceName, editable = false }: Props) {
  const [mode, setMode] = useState<Mode>("groups");
  const [subjectId, setSubjectId] = useState("");
  const [filter, setFilter] = useState("");
  const qc = useQueryClient();
  const toast = useToast();

  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", workspaceId],
    queryFn: () => getDatasets({ workspace_id: workspaceId }),
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["groups", workspaceId],
    queryFn: () => getGroups(workspaceId),
  });
  const { data: members = [] } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => getWorkspaceMembers(workspaceId),
    enabled: mode === "users",
  });
  const { data: accessEntries = [] } = useQuery({
    queryKey: ["access-matrix", workspaceId, mode],
    queryFn: () => getWorkspaceAccessMatrix(workspaceId, mode),
  });

  // subject_id → (dataset_id → role)
  const accessBySubject = useMemo(() => {
    const out = new Map<string, Map<string, string>>();
    for (const a of accessEntries) {
      if (!out.has(a.subject_id)) out.set(a.subject_id, new Map());
      out.get(a.subject_id)!.set(a.dataset_id, a.role);
    }
    return out;
  }, [accessEntries]);

  const setPerm = useMutation({
    mutationFn: ({ datasetId, groupId, role }: { datasetId: string; groupId: string; role: Role }) =>
      role === "none" ? removeDatasetGroupPermission(datasetId, groupId) : setDatasetGroupPermission(datasetId, groupId, role),
    onMutate: ({ datasetId, groupId, role }) => {
      // Optimista: refleja el cambio al instante.
      qc.setQueryData<typeof accessEntries>(["access-matrix", workspaceId, "groups"], (prev = []) => {
        const rest = prev.filter((e) => !(e.subject_id === groupId && e.dataset_id === datasetId));
        return role === "none" ? rest : [...rest, { dataset_id: datasetId, subject_id: groupId, role }];
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["access-matrix", workspaceId] }); qc.invalidateQueries({ queryKey: ["datasets"] }); },
    onError: () => { toast("No se pudo actualizar el permiso", "error"); qc.invalidateQueries({ queryKey: ["access-matrix", workspaceId] }); },
  });

  const realDatasets = datasets.filter((d) => !d.is_bridge);
  const q = filter.trim().toLowerCase();
  const visibleDatasets = realDatasets.filter((d) => !q || d.name.toLowerCase().includes(q));

  const subjects = mode === "groups"
    ? groups.map((g) => ({ id: g.id, name: g.name }))
    : members.map((m) => ({ id: m.user_id, name: m.username }));

  const effectiveSubjectId = subjectId && subjects.some((s) => s.id === subjectId) ? subjectId : (subjects[0]?.id ?? "");
  const subjectAccess = accessBySubject.get(effectiveSubjectId) ?? new Map<string, string>();
  const accessCountBy = (id: string) => accessBySubject.get(id)?.size ?? 0;

  const canEdit = editable && mode === "groups";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header + toggle de modo */}
      <div className="dk-card dk-card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Accesos · {workspaceName}</p>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
            {mode === "groups"
              ? "Elegí un grupo y asigná su nivel de acceso a cada dataset."
              : "Rol efectivo de cada miembro (combina permisos directos, de grupo y de workspace)."}
          </p>
        </div>
        <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
          {(["groups", "users"] as Mode[]).map((m) => (
            <button key={m} onClick={() => { setMode(m); setSubjectId(""); }}
              style={{
                padding: "6px 16px", fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer",
                background: mode === m ? "var(--color-primary)" : "transparent",
                color: mode === m ? "#fff" : "var(--color-text-secondary)",
              }}>
              {m === "groups" ? "Por grupo" : "Por miembro"}
            </button>
          ))}
        </div>
      </div>

      {subjects.length === 0 ? (
        <div className="dk-card">
          <EmptyState
            icon={mode === "groups" ? <IcLink size={22} /> : <IcUsers size={22} />}
            title={mode === "groups" ? "Sin grupos en este workspace" : "Sin miembros en este workspace"}
            subtitle={mode === "groups" ? "Creá grupos en la pestaña Grupos para asignarles acceso." : "Agregá miembros en la pestaña Miembros."}
          />
        </div>
      ) : (
        <>
          {/* Selector de sujeto (chips) */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {subjects.map((s) => {
              const active = s.id === effectiveSubjectId;
              const dot = mode === "groups" ? groupColor(s.name) : "#64748B";
              const n = accessCountBy(s.id);
              return (
                <button key={s.id} className="dk-chip" data-active={active} onClick={() => setSubjectId(s.id)}>
                  <span className="dk-chip-dot" style={{ background: dot }} />
                  {s.name}
                  {n > 0 && <span className="dk-chip-count">{n}</span>}
                </button>
              );
            })}
          </div>

          {/* Buscador + resumen */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <SearchInput value={filter} onChange={setFilter} placeholder="Buscar dataset…" style={{ minWidth: 240 }} />
            <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
              {mode === "groups"
                ? <>Este grupo accede a <strong style={{ color: "var(--color-text-secondary)" }}>{subjectAccess.size}</strong> de {realDatasets.length} datasets</>
                : <>Acceso a <strong style={{ color: "var(--color-text-secondary)" }}>{subjectAccess.size}</strong> de {realDatasets.length} datasets</>}
            </span>
          </div>

          {/* Lista de datasets con su control de acceso */}
          {visibleDatasets.length === 0 ? (
            <div className="dk-card">
              <EmptyState icon={<IcTable size={22} />} title="Sin datasets"
                subtitle={realDatasets.length === 0 ? "Este workspace no tiene datasets." : "Ningún dataset coincide con el filtro."} />
            </div>
          ) : (
            <div className="dk-card dk-card--flush">
              {visibleDatasets.map((d) => {
                const role = (subjectAccess.get(d.id) as Role) || "none";
                return (
                  <div key={d.id} className="dk-access-row">
                    <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        background: role === "none" ? "var(--color-bg)" : (DS_ROLE_STYLE[role].bg),
                        color: role === "none" ? "var(--color-text-muted)" : DS_ROLE_STYLE[role].fg,
                      }}>
                        <IcTable size={15} />
                      </span>
                      <Link to={`/datasets/${d.id}`}
                        style={{ fontWeight: 600, fontSize: 13.5, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.name}
                      </Link>
                    </div>
                    {canEdit ? (
                      <RoleSegmented value={role} busy={setPerm.isPending}
                        onChange={(r) => setPerm.mutate({ datasetId: d.id, groupId: effectiveSubjectId, role: r })} />
                    ) : (
                      role === "none"
                        ? <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Sin acceso</span>
                        : <Badge tone={role === "admin" ? "danger" : role === "editor" ? "warn" : "primary"}>{ROLE_LABEL[role]}</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

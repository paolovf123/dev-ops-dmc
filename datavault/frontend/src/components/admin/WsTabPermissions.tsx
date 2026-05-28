import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, Shield, Search, Filter, Info } from "lucide-react";
import { getDatasets, setDatasetGroupPermission, removeDatasetGroupPermission } from "../../api/datasets";
import { getWorkspaceMembers, getWorkspaceAccessMatrix } from "../../api/workspaces";
import { getGroups } from "../../api/groups";
import { EmptyState } from "../ui";
import { IcUsers, IcLink, IcTable } from "../ui/icons";
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
const ROLE_LABEL: Record<Role, string> = { none: "Sin", viewer: "Ver", editor: "Editar", admin: "Admin" };
// Clase de acento por rol para el control .access-seg (matchea el mockup).
const ROLE_SEG_CLASS: Record<Role, string> = { none: "is-none", viewer: "is-view", editor: "is-edit", admin: "is-admin" };

// Glifos de color para las cabeceras de dataset (rotan por índice).
const GLYPH_COLORS = ["var(--accent-pri)", "var(--accent-rel)", "#0fb583", "#8b3df0", "var(--accent-pri)", "var(--accent-calc)"];
const AVATAR_VARIANTS = ["", "avatar--rel", "avatar--mint", "avatar--violet"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Celda: control segmentado de 4 niveles (Sin / Ver / Editar / Admin) ─────────
function AccessSeg({
  value, editable, busy, onChange,
}: {
  value: Role;
  editable: boolean;
  busy?: boolean;
  onChange?: (r: Role) => void;
}) {
  return (
    <div className="access-seg">
      {ROLES.map((r) => {
        const on = value === r;
        const cls = on ? `access-seg__item is-on ${ROLE_SEG_CLASS[r]}` : "access-seg__item";
        return (
          <span
            key={r}
            className={cls}
            role={editable ? "button" : undefined}
            aria-disabled={editable ? busy : undefined}
            style={editable && !busy ? { cursor: "pointer" } : editable ? { cursor: "wait" } : { cursor: "default" }}
            onClick={() => { if (editable && !busy && !on) onChange?.(r); }}
          >
            {ROLE_LABEL[r]}
          </span>
        );
      })}
    </div>
  );
}

export default function WsTabPermissions({ workspaceId, workspaceName, editable = false }: Props) {
  const [mode, setMode] = useState<Mode>("groups");
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

  // Filas: grupos (mode=groups) o miembros (mode=users), filtradas por el buscador.
  const rows = mode === "groups"
    ? groups
        .filter((g) => !q || g.name.toLowerCase().includes(q))
        .map((g) => ({ id: g.id, name: g.name, sub: `${g.member_count} ${g.member_count === 1 ? "persona" : "personas"}`, isGroup: true }))
    : members
        .filter((m) => !q || m.username.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
        .map((m) => ({ id: m.user_id, name: m.username, sub: m.email, isGroup: false }));

  const canEdit = editable && mode === "groups";

  const emptyRows = mode === "groups" ? groups.length === 0 : members.length === 0;

  return (
    <>
      {/* Toggle de modo: Grupo / Persona (segmented del DS) */}
      <div className="page-tabs-row" style={{ borderBottom: 0, marginBottom: "var(--sp-3)" }}>
        <span style={{ fontSize: "var(--fs-13)", fontWeight: 600 }}>Accesos · {workspaceName}</span>
        <span className="home-toolbar__grow" style={{ flex: 1 }} />
        <span style={{ fontSize: "var(--fs-11)", color: "var(--text-mute)", marginRight: "var(--sp-2)" }}>Mostrando matriz por ·</span>
        <div className="segmented">
          {(["groups", "users"] as Mode[]).map((m) => (
            <span
              key={m}
              className={`segmented__item${mode === m ? " is-active" : ""}`}
              onClick={() => setMode(m)}
              style={{ cursor: "pointer" }}
            >
              {m === "groups" ? "Grupo" : "Persona"}
            </span>
          ))}
        </div>
      </div>

      <div className="matrix-wrap">
        <div className="matrix-controls">
          <span className="search" style={{ width: 280 }}>
            <Search />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={mode === "groups" ? "Buscar grupo…" : "Buscar persona…"}
              style={{ border: 0, background: "transparent", outline: "none", flex: 1, font: "inherit", color: "inherit" }}
            />
          </span>
          <button className="tb-btn"><Filter /> Filtrar datasets</button>
          <span className="grow" />
          <span style={{ fontSize: "var(--fs-12)", color: "var(--text-soft)", display: "inline-flex", gap: "var(--sp-3)", alignItems: "center" }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--accent-pri-soft)", border: "1px solid var(--accent-pri)", verticalAlign: -1, marginRight: 4 }} /> Ver</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--success-soft)", border: "1px solid var(--success)", verticalAlign: -1, marginRight: 4 }} /> Editar</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--accent-rel-soft)", border: "1px solid var(--accent-rel)", verticalAlign: -1, marginRight: 4 }} /> Admin</span>
          </span>
        </div>

        {emptyRows ? (
          <EmptyState
            icon={mode === "groups" ? <IcLink size={22} /> : <IcUsers size={22} />}
            title={mode === "groups" ? "Sin grupos en este workspace" : "Sin miembros en este workspace"}
            subtitle={mode === "groups" ? "Creá grupos en la pestaña Grupos para asignarles acceso." : "Agregá miembros en la pestaña Miembros."}
          />
        ) : realDatasets.length === 0 ? (
          <EmptyState icon={<IcTable size={22} />} title="Sin datasets"
            subtitle="Este workspace no tiene datasets." />
        ) : (
          <div className="matrix-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th className="who">{mode === "groups" ? "Grupo" : "Persona"}</th>
                  {realDatasets.map((d, i) => (
                    <th key={d.id}>
                      <div className="dataset-h">
                        <span className="name">
                          <span className="glyph" style={{ background: GLYPH_COLORS[i % GLYPH_COLORS.length] }}>
                            {d.name.charAt(0).toUpperCase()}
                          </span>
                          {d.name}
                        </span>
                        <span className="meta">{d.is_computed ? "ƒ derivado" : "dataset"}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => {
                  const subjectAccess = accessBySubject.get(row.id) ?? new Map<string, string>();
                  return (
                    <tr key={row.id} className={row.isGroup ? "is-group-row" : undefined}>
                      <td className="who">
                        <span className={`who-cell${row.isGroup ? " is-group" : ""}`}>
                          {row.isGroup ? (
                            <Layers />
                          ) : (
                            <span className={`avatar avatar--xs ${AVATAR_VARIANTS[ri % AVATAR_VARIANTS.length]}`}>
                              {initials(row.name)}
                            </span>
                          )}
                          {row.name}
                          {row.isGroup ? (
                            <> · {row.sub}</>
                          ) : (
                            <span style={{ fontSize: 10, color: "var(--text-mute)" }}>{row.sub}</span>
                          )}
                        </span>
                      </td>
                      {realDatasets.map((d) => {
                        const role = (subjectAccess.get(d.id) as Role) || "none";
                        return (
                          <td key={d.id}>
                            <AccessSeg
                              value={role}
                              editable={canEdit}
                              busy={setPerm.isPending}
                              onChange={(r) => setPerm.mutate({ datasetId: d.id, groupId: row.id, role: r })}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: "var(--fs-12)", color: "var(--text-mute)", marginTop: "var(--sp-3)" }}>
        <Info style={{ width: 12, height: 12, verticalAlign: -1 }} />{" "}
        {mode === "groups"
          ? "Asigná el nivel de acceso de cada grupo a cada dataset. Las personas del grupo heredan estos accesos."
          : "Rol efectivo de cada miembro (combina permisos directos, de grupo y de workspace). Para editar, cambiá a la vista por Grupo."}
      </p>
    </>
  );
}

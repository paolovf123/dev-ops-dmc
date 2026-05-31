import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Lock, Table2, FunctionSquare, Layers, Users } from "lucide-react";
import { getDatasets, setDatasetGroupPermission, removeDatasetGroupPermission } from "../../api/datasets";
import { getWorkspaceMembers, getWorkspaceAccessMatrix } from "../../api/workspaces";
import { getGroups } from "../../api/groups";
import { EmptyState } from "../ui";
import { Avatar } from "../ui/kit";
import { useToast } from "../Toast";

interface Props {
  workspaceId: string;
  workspaceName: string;
  /** Si true, en modo grupos se puede editar el acceso (otorgar/quitar) inline. */
  editable?: boolean;
}

type Mode = "groups" | "users";
type Role = "none" | "viewer" | "editor" | "admin";

// Orden del ciclo y metadatos visuales del heatmap (Sin → Ver → Editar → Admin → Sin).
const ROLE_CYCLE: Role[] = ["none", "viewer", "editor", "admin"];
const ROLE_META: Record<Role, { short: string; label: string; fg: string; bg: string; bd: string }> = {
  none:   { short: "—",      label: "Sin acceso", fg: "var(--text-mute)",  bg: "var(--surface-alt)",  bd: "var(--border)" },
  viewer: { short: "Ver",    label: "Ver",        fg: "var(--accent-pri)", bg: "var(--pri-soft)",     bd: "color-mix(in srgb, var(--accent-pri) 32%, transparent)" },
  editor: { short: "Editar", label: "Editar",     fg: "var(--success)",    bg: "var(--success-soft)", bd: "color-mix(in srgb, var(--success) 36%, transparent)" },
  admin:  { short: "Admin",  label: "Admin",      fg: "var(--violet)",     bg: "var(--violet-soft)",  bd: "color-mix(in srgb, var(--violet) 36%, transparent)" },
};

// ── Celda del heatmap: click cicla el rol (Sin → Ver → Editar → Admin) ──────────
function HeatCell({
  value, editable, busy, onClick,
}: {
  value: Role;
  editable: boolean;
  busy?: boolean;
  onClick?: () => void;
}) {
  const m = ROLE_META[value];
  return (
    <button
      className={editable ? "og-heatcell" : undefined}
      disabled={!editable || busy}
      title={editable ? `${m.label} · click para ciclar` : m.label}
      onClick={() => { if (editable && !busy) onClick?.(); }}
      style={{
        width: "100%", height: "var(--row-h)", minHeight: 34, borderRadius: "var(--r-2)",
        cursor: editable ? (busy ? "wait" : "pointer") : "default",
        background: m.bg, color: m.fg, border: `1px solid ${m.bd}`,
        font: "600 12.5px/1 var(--font-sans)", display: "grid", placeItems: "center",
        transition: "all var(--t-fast)",
      }}
    >
      {m.short}
    </button>
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
    mutationFn: async ({ datasetId, groupId, role }: { datasetId: string; groupId: string; role: Role }) => {
      if (role === "none") await removeDatasetGroupPermission(datasetId, groupId);
      else await setDatasetGroupPermission(datasetId, groupId, role);
    },
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

  // Columnas: grupos (mode=groups) o miembros (mode=users), filtradas por el buscador.
  const cols = mode === "groups"
    ? groups
        .filter((g) => !q || g.name.toLowerCase().includes(q))
        .map((g) => ({ id: g.id, name: g.name, sub: `${g.member_count} ${g.member_count === 1 ? "miembro" : "miembros"}`, isGroup: true }))
    : members
        .filter((m) => !q || m.username.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
        .map((m) => ({ id: m.user_id, name: m.username, sub: m.email, isGroup: false }));

  const canEdit = editable && mode === "groups";
  const emptyCols = mode === "groups" ? groups.length === 0 : members.length === 0;

  const gridTemplate = `200px repeat(${cols.length}, minmax(116px, 1fr))`;

  return (
    <>
      {/* Toggle de modo + nota */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", padding: 3, borderRadius: "var(--r-2)", background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
          {([["groups", "Por grupos"], ["users", "Por usuarios"]] as [Mode, string][]).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              style={{
                font: "600 12.5px/1 var(--font-sans)", padding: "7px 13px", borderRadius: 6, border: "none", cursor: "pointer",
                background: mode === k ? "var(--surface)" : "transparent", color: mode === k ? "var(--text)" : "var(--text-soft)",
                boxShadow: mode === k ? "var(--shadow-1)" : "none", transition: "all var(--t-fast)",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Buscador */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, height: 36, padding: "0 12px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", width: 240 }}>
          <Search size={15} style={{ color: "var(--text-mute)", flex: "none" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={mode === "groups" ? "Buscar grupo…" : "Buscar persona…"}
            style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--text)", font: "400 13px/1 var(--font-sans)" }}
          />
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ font: "400 12.5px/1 var(--font-sans)", color: "var(--text-mute)" }}>
          {canEdit ? "Click una celda para ciclar el rol · mutación optimista" : `Accesos · ${workspaceName}`}
        </span>
      </div>

      {/* Heatmap */}
      {emptyCols ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", boxShadow: "var(--shadow-1)", padding: 24 }}>
          <EmptyState
            icon={mode === "groups" ? <Layers size={22} /> : <Users size={22} />}
            title={mode === "groups" ? "Sin grupos en este workspace" : "Sin miembros en este workspace"}
            subtitle={mode === "groups" ? "Creá grupos en la pestaña Grupos para asignarles acceso." : "Agregá miembros en la pestaña Miembros."}
          />
        </div>
      ) : realDatasets.length === 0 ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", boxShadow: "var(--shadow-1)", padding: 24 }}>
          <EmptyState icon={<Table2 size={22} />} title="Sin datasets" subtitle="Este workspace no tiene datasets." />
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", boxShadow: "var(--shadow-1)", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 720 }}>
              {/* Cabeceras de columna (grupos / personas) */}
              <div style={{ display: "grid", gridTemplateColumns: gridTemplate, background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <div style={{ padding: "12px 16px", font: "500 12px/1 var(--font-sans)", color: "var(--text-mute)", alignSelf: "center" }}>
                  Dataset · {mode === "groups" ? "Grupo" : "Persona"}
                </div>
                {cols.map((c) => (
                  <div key={c.id} style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, borderLeft: "1px solid var(--border)", minWidth: 0 }}>
                    <Avatar name={c.name} size={24} square />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", font: "600 13px/1.2 var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      <span style={{ display: "block", font: "400 11px/1.2 var(--font-sans)", color: "var(--text-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sub}</span>
                    </span>
                  </div>
                ))}
              </div>

              {/* Filas: un dataset por fila, una celda por grupo/persona */}
              {realDatasets.map((d, di) => (
                <div key={d.id} style={{ display: "grid", gridTemplateColumns: gridTemplate, borderBottom: di < realDatasets.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center" }}>
                  <div style={{ padding: "0 16px", display: "flex", alignItems: "center", gap: 9, height: "calc(var(--row-h) + 16px)" }}>
                    <span style={{
                      display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 7,
                      background: d.is_computed ? "var(--calc-soft)" : "var(--pri-soft)",
                      color: d.is_computed ? "var(--accent-calc)" : "var(--accent-pri)",
                    }}>
                      {d.is_computed ? <FunctionSquare size={16} /> : <Table2 size={16} />}
                    </span>
                    <span style={{ font: "600 13.5px/1.2 var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                  </div>
                  {cols.map((c) => {
                    const subjectAccess = accessBySubject.get(c.id) ?? new Map<string, string>();
                    const role = (subjectAccess.get(d.id) as Role) || "none";
                    const next = ROLE_CYCLE[(ROLE_CYCLE.indexOf(role) + 1) % ROLE_CYCLE.length];
                    return (
                      <div key={c.id} style={{ padding: "8px", borderLeft: "1px solid var(--border)" }}>
                        <HeatCell
                          value={role}
                          editable={canEdit}
                          busy={setPerm.isPending}
                          onClick={() => setPerm.mutate({ datasetId: d.id, groupId: c.id, role: next })}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Leyenda + nota de prioridad */}
      <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {ROLE_CYCLE.map((r) => {
            const m = ROLE_META[r];
            return (
              <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 16, height: 16, borderRadius: 5, background: m.bg, border: `1px solid ${m.bd}` }} />
                <span style={{ font: "500 12.5px/1 var(--font-sans)", color: "var(--text-soft)" }}>{m.label}</span>
              </span>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "400 12.5px/1 var(--font-sans)", color: "var(--text-mute)" }}>
          <Lock size={14} /> Sin acceso bloquea explícitamente
        </span>
      </div>
      <div style={{ font: "400 12.5px/1.5 var(--font-sans)", color: "var(--text-mute)", marginTop: 12, maxWidth: 640 }}>
        {canEdit ? (
          <>
            Asigná el nivel de acceso de cada grupo a cada dataset. Las personas del grupo heredan estos accesos.
            Prioridad del rol efectivo: <strong style={{ color: "var(--text-soft)" }}>admin global › directo › grupo › workspace › rol global</strong>.
          </>
        ) : (
          "Rol efectivo de cada miembro (combina permisos directos, de grupo y de workspace). Para editar, cambiá a la vista Por grupos."
        )}
      </div>
    </>
  );
}

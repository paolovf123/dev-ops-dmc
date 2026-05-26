import { useState, useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getDatasets, getGroupDatasetAccess, getUserDatasetAccess } from "../../api/datasets";
import { getWorkspaceMembers } from "../../api/workspaces";
import { getGroups } from "../../api/groups";
import type { GroupDatasetAccess, UserDatasetAccess } from "../../api/datasets";

interface Props {
  workspaceId: string;
  workspaceName: string;
}

const ROLE_BG: Record<string, string> = {
  admin: "#DC2626", editor: "#D97706", viewer: "#2563EB", none: "#6B7280",
};
const ROLE_LABEL: Record<string, string> = {
  admin: "A", editor: "E", viewer: "V", none: "-",
};

type Mode = "groups" | "users";

export default function WsTabPermissions({ workspaceId, workspaceName }: Props) {
  const [mode, setMode] = useState<Mode>("groups");
  const [filter, setFilter] = useState("");

  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", workspaceId],
    queryFn: () => getDatasets({ workspace_id: workspaceId }),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["groups", workspaceId],
    queryFn: () => getGroups(workspaceId),
    enabled: mode === "groups",
  });

  const { data: members = [] } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => getWorkspaceMembers(workspaceId),
    enabled: mode === "users",
  });

  // Cargar acceso de cada grupo o usuario en paralelo
  const groupAccessQueries = useQueries({
    queries: groups.map((g) => ({
      queryKey: ["dataset-access", "group", g.id],
      queryFn: () => getGroupDatasetAccess(g.id),
      enabled: mode === "groups" && !!g.id,
    })),
  });
  const userAccessQueries = useQueries({
    queries: members.map((m) => ({
      queryKey: ["dataset-access", "user", m.user_id],
      queryFn: () => getUserDatasetAccess(m.user_id),
      enabled: mode === "users" && !!m.user_id,
    })),
  });

  // Map: dataset_id × subject_id → role
  const matrix = useMemo(() => {
    const out = new Map<string, Map<string, string>>();
    if (mode === "groups") {
      groups.forEach((g, i) => {
        const accesses = (groupAccessQueries[i]?.data ?? []) as GroupDatasetAccess[];
        for (const a of accesses) {
          if (!out.has(a.dataset_id)) out.set(a.dataset_id, new Map());
          out.get(a.dataset_id)!.set(g.id, a.role);
        }
      });
    } else {
      members.forEach((m, i) => {
        const accesses = (userAccessQueries[i]?.data ?? []) as UserDatasetAccess[];
        for (const a of accesses) {
          if (!out.has(a.dataset_id)) out.set(a.dataset_id, new Map());
          out.get(a.dataset_id)!.set(m.user_id, a.role);
        }
      });
    }
    return out;
  }, [mode, groups, members, groupAccessQueries, userAccessQueries]);

  const q = filter.trim().toLowerCase();
  const visibleDatasets = datasets.filter((d) => !d.is_bridge && (!q || d.name.toLowerCase().includes(q)));

  const columns = mode === "groups"
    ? groups.map((g) => ({ id: g.id, name: g.name }))
    : members.map((m) => ({ id: m.user_id, name: m.username }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        padding: "14px 18px", background: "var(--color-surface)",
        border: "1px solid var(--color-border)", borderRadius: 12, flexWrap: "wrap",
      }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
            Matriz de permisos · {workspaceName}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
            {mode === "groups"
              ? "Permisos explícitos asignados a cada grupo del workspace."
              : "Rol efectivo de cada miembro (combina directos + grupos + workspace)."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: 6, overflow: "hidden" }}>
            {(["groups", "users"] as Mode[]).map((m) => (
              <button key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "5px 12px", fontSize: 12, fontWeight: 600,
                  background: mode === m ? "var(--color-primary)" : "transparent",
                  color: mode === m ? "#fff" : "var(--color-text-secondary)",
                  border: "none", cursor: "pointer",
                }}>
                {m === "groups" ? "Grupos" : "Miembros"}
              </button>
            ))}
          </div>
          <input
            placeholder="🔍 Filtrar dataset…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ fontSize: 12, padding: "5px 9px", border: "1px solid var(--color-border)", borderRadius: 6, width: 180 }}
          />
        </div>
      </div>

      {/* Leyenda */}
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--color-text-muted)", padding: "0 4px" }}>
        {Object.entries(ROLE_BG).filter(([k]) => k !== "none").map(([role, color]) => (
          <span key={role} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 18, height: 18, borderRadius: 4, background: color, color: "#fff", fontWeight: 700, fontSize: 10,
            }}>{ROLE_LABEL[role]}</span>
            {role}
          </span>
        ))}
        <span style={{ marginLeft: "auto" }}>Celda vacía = sin acceso</span>
      </div>

      {/* Matrix table */}
      {visibleDatasets.length === 0 || columns.length === 0 ? (
        <div style={{
          padding: 40, textAlign: "center", color: "var(--color-text-muted)",
          background: "var(--color-surface)", border: "1px dashed var(--color-border)", borderRadius: 12,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <p style={{ margin: 0, fontSize: 13 }}>
            {visibleDatasets.length === 0 ? "Sin datasets en este workspace." :
             mode === "groups" ? "Sin grupos en este workspace." : "Sin miembros en este workspace."}
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, width: "max-content", minWidth: "100%" }}>
            <thead>
              <tr style={{ background: "var(--color-bg)" }}>
                <th style={{
                  ...thStyle, position: "sticky", left: 0, zIndex: 2, background: "var(--color-bg)",
                  minWidth: 200, borderRight: "1px solid var(--color-border)",
                }}>
                  Dataset \ {mode === "groups" ? "Grupo" : "Miembro"}
                </th>
                {columns.map((c) => (
                  <th key={c.id} style={{ ...thStyle, minWidth: 80, textAlign: "center" }}
                    title={c.name}>
                    <div style={{
                      writingMode: "vertical-rl", transform: "rotate(180deg)",
                      whiteSpace: "nowrap", maxHeight: 120, overflow: "hidden", textOverflow: "ellipsis",
                      padding: "8px 4px",
                    }}>
                      {c.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleDatasets.map((d) => {
                const dsRoles = matrix.get(d.id) ?? new Map();
                return (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--color-border-light)" }}>
                    <td style={{
                      ...tdStyle, position: "sticky", left: 0, background: "var(--color-surface)",
                      borderRight: "1px solid var(--color-border)", fontWeight: 600, whiteSpace: "nowrap",
                    }}>
                      <Link to={`/datasets/${d.id}`} style={{ color: "var(--color-primary)" }}>{d.name}</Link>
                    </td>
                    {columns.map((c) => {
                      const role = dsRoles.get(c.id);
                      if (!role || role === "none") {
                        return <td key={c.id} style={{ ...tdStyle, textAlign: "center", color: "var(--color-border)" }}>·</td>;
                      }
                      return (
                        <td key={c.id} style={{ ...tdStyle, textAlign: "center", padding: "4px" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 22, height: 22, borderRadius: 4,
                            background: ROLE_BG[role], color: "#fff", fontWeight: 700, fontSize: 11,
                          }} title={role}>
                            {ROLE_LABEL[role]}
                          </span>
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
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700,
  color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border)",
};
const tdStyle: React.CSSProperties = {
  padding: "6px 10px", verticalAlign: "middle",
};

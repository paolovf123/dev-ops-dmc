import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../api/client";
import {
  getWorkspaceMembers, addWorkspaceMember, updateMemberRole, removeWorkspaceMember,
} from "../../api/workspaces";
import { useToast } from "../Toast";
import { useConfirm } from "../ConfirmDialog";
import { SearchInput, EmptyState } from "../ui";
import { IcUsers, IcTrash } from "../ui/icons";

interface Props {
  workspaceId: string;
  workspaceName: string;
  /** admin global / owner pueden asignar el rol owner; admin_ws no. */
  canAssignOwner?: boolean;
}

const WS_ROLE = {
  owner:    { label: "Owner",    bg: "#EDE9FE", color: "#7C3AED" },
  admin_ws: { label: "Admin WS", bg: "#E0F2FE", color: "#0284C7" },
  member:   { label: "Member",   bg: "#F0FDF4", color: "#15803D" },
} as const;

/** Gestión de miembros de un workspace: agregar, cambiar rol, remover. */
export default function MembersManager({ workspaceId, workspaceName, canAssignOwner = true }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState("member");

  const { data: members = [] } = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => getWorkspaceMembers(workspaceId),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users-list"],
    queryFn: () => api.get<{ id: string; username: string; email: string }[]>("/auth/users?list_all=true").then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["workspace-members", workspaceId] });

  const addMut = useMutation({
    mutationFn: () => addWorkspaceMember(workspaceId, selectedUserId, role),
    onSuccess: () => { invalidate(); toast("Miembro agregado", "success"); setSelectedUserId(""); setUserSearch(""); },
    onError: () => toast("El usuario ya es miembro o no existe", "error"),
  });
  const roleMut = useMutation({
    mutationFn: ({ userId, r }: { userId: string; r: string }) => updateMemberRole(workspaceId, userId, r),
    onSuccess: () => { invalidate(); toast("Rol actualizado", "success"); },
  });
  const removeMut = useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember(workspaceId, userId),
    onSuccess: () => { invalidate(); toast("Miembro removido", "success"); },
    onError: () => toast("Error al remover miembro", "error"),
  });

  const memberIds = new Set(members.map((m) => m.user_id));
  const q = userSearch.toLowerCase();
  const candidates = allUsers.filter((u) =>
    !memberIds.has(u.id) && (u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));

  const roleOrder: Record<string, number> = { owner: 0, admin_ws: 1, member: 2 };
  const sorted = [...members].sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Agregar miembro */}
      <div className="dk-card dk-card-pad">
        <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14 }}>Agregar miembro a {workspaceName}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 240px", position: "relative" }}>
            <SearchInput value={userSearch} onChange={(v) => { setUserSearch(v); setSelectedUserId(""); }}
              placeholder="Buscar usuario por nombre o email…" style={{ width: "100%" }} />
            {userSearch && !selectedUserId && candidates.length > 0 && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30,
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 10, maxHeight: 220, overflowY: "auto", boxShadow: "var(--shadow-md)",
              }}>
                {candidates.slice(0, 8).map((u) => (
                  <button key={u.id} onClick={() => { setSelectedUserId(u.id); setUserSearch(`${u.username} (${u.email})`); }}
                    style={{ width: "100%", padding: "9px 13px", background: "none", border: "none", textAlign: "left", cursor: "pointer" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{u.username}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{u.email}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <select className="dk-select" value={role} onChange={(e) => setRole(e.target.value)} style={{ minWidth: 180 }}>
            <option value="member">Member — accede a los datos</option>
            <option value="admin_ws">Admin WS — gestiona equipo y grupos</option>
            {canAssignOwner && <option value="owner">Owner — control total</option>}
          </select>
          <button className="btn btn-primary" style={{ fontSize: 13 }}
            disabled={!selectedUserId || addMut.isPending} onClick={() => addMut.mutate()}>
            {addMut.isPending ? "Agregando…" : "Agregar"}
          </button>
        </div>
      </div>

      {/* Lista de miembros */}
      {members.length === 0 ? (
        <div className="dk-card">
          <EmptyState icon={<IcUsers size={22} />} title="Sin miembros aún"
            subtitle="Agregá el primero con el buscador de arriba." />
        </div>
      ) : (
        <div className="dk-table-wrap">
          <table className="dk-table">
            <thead><tr><th>Miembro</th><th>Email</th><th>Rol</th><th></th></tr></thead>
            <tbody>
              {sorted.map((m) => {
                const badge = WS_ROLE[m.role as keyof typeof WS_ROLE] ?? { label: m.role, bg: "#F1F5F9", color: "#64748B" };
                return (
                  <tr key={m.user_id}>
                    <td className="dk-td-primary">{m.username}</td>
                    <td className="dk-td-muted">{m.email}</td>
                    <td>
                      <select value={m.role} onChange={(e) => roleMut.mutate({ userId: m.user_id, r: e.target.value })}
                        className="dk-select" style={{
                          fontSize: 12, fontWeight: 600, padding: "4px 26px 4px 10px",
                          background: badge.bg, color: badge.color, border: `1px solid ${badge.color}40`,
                        }}>
                        <option value="member">Member</option>
                        <option value="admin_ws">Admin WS</option>
                        {canAssignOwner && <option value="owner">Owner</option>}
                      </select>
                    </td>
                    <td className="dk-td-right">
                      <button className="dk-row-action" style={{ color: "#DC2626", padding: "5px 9px" }}
                        title="Remover del workspace"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Remover miembro",
                            message: `¿Quitar a ${m.username} del workspace "${workspaceName}"?`,
                            confirmLabel: "Remover", variant: "danger",
                          });
                          if (ok) removeMut.mutate(m.user_id);
                        }}>
                        <IcTrash />
                      </button>
                    </td>
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

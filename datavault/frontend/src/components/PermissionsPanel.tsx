import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDatasetPermissions, setDatasetPermission, removeDatasetPermission,
  getDatasetGroupPermissions, setDatasetGroupPermission, removeDatasetGroupPermission,
} from "../api/datasets";
import { getGroups } from "../api/groups";
import api from "../api/client";
import { useToast } from "./Toast";

const ROLES = [
  { value: "admin",  label: "Admin",      color: "#DC2626" },
  { value: "editor", label: "Editor",     color: "#D97706" },
  { value: "viewer", label: "Visualizar", color: "#2563EB" },
  { value: "none",   label: "Sin acceso", color: "#6B7280" },
];


interface Props {
  datasetId: string;
  onClose: () => void;
}

export default function PermissionsPanel({ datasetId, onClose }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<"users" | "groups">("users");
  const [addingUser, setAddingUser] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [newRole, setNewRole] = useState("viewer");

  const { data: userPerms = [], isLoading: loadingPerms } = useQuery({
    queryKey: ["dataset-permissions", datasetId],
    queryFn: () => getDatasetPermissions(datasetId),
  });

  const { data: groupPerms = [], isLoading: loadingGroupPerms } = useQuery({
    queryKey: ["dataset-group-permissions", datasetId],
    queryFn: () => getDatasetGroupPermissions(datasetId),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => getGroups(),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ id: string; email: string; username: string; role: string }[]>("/auth/users").then((r) => r.data),
  });

  const filteredUsers = allUsers.filter((u) =>
    !userPerms.find((p) => p.user_id === u.id) &&
    (u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
     u.username.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const availableGroups = groups.filter((g) => !groupPerms.find((p) => p.group_id === g.id));

  const setPermMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      setDatasetPermission(datasetId, userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dataset-permissions", datasetId] });
      toast("Permiso actualizado", "success");
      setAddingUser(false);
      setUserSearch("");
      setSelectedUserId("");
    },
    onError: () => toast("Error actualizando permiso", "error"),
  });

  const removePermMut = useMutation({
    mutationFn: (userId: string) => removeDatasetPermission(datasetId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dataset-permissions", datasetId] });
      toast("Permiso eliminado", "success");
    },
    onError: () => toast("Error eliminando permiso", "error"),
  });

  const setGroupPermMut = useMutation({
    mutationFn: ({ groupId, role }: { groupId: string; role: string }) =>
      setDatasetGroupPermission(datasetId, groupId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dataset-group-permissions", datasetId] });
      toast("Permiso de grupo actualizado", "success");
      setAddingGroup(false);
      setSelectedGroupId("");
    },
    onError: () => toast("Error actualizando permiso de grupo", "error"),
  });

  const removeGroupPermMut = useMutation({
    mutationFn: (groupId: string) => removeDatasetGroupPermission(datasetId, groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dataset-group-permissions", datasetId] });
      toast("Permiso de grupo eliminado", "success");
    },
    onError: () => toast("Error eliminando permiso de grupo", "error"),
  });

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: "var(--color-surface)", borderRadius: 12, width: 560,
        maxHeight: "80vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Gestionar acceso</h3>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              Controla quién puede ver y editar este dataset
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 18, padding: "4px 8px" }}>×</button>
        </div>

        {/* Info box */}
        <div style={{
          margin: "14px 24px 0",
          padding: "10px 14px",
          background: "var(--color-primary-bg)",
          borderRadius: 8,
          border: "1px solid var(--color-primary-border)",
          fontSize: 12,
          color: "var(--pm-green-700)",
        }}>
          <strong>Prioridad:</strong> Permiso directo de usuario &gt; Permiso de grupo &gt; Rol global.<br />
          Rol <strong>Sin acceso</strong> oculta el dataset completamente para ese usuario/grupo.
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, padding: "16px 24px 0", borderBottom: "1px solid var(--color-border-light)" }}>
          {(["users", "groups"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 16px", fontSize: 13, fontWeight: tab === t ? 700 : 400,
              background: "none", border: "none", cursor: "pointer",
              borderBottom: tab === t ? "2px solid var(--color-primary)" : "2px solid transparent",
              color: tab === t ? "var(--color-primary)" : "var(--color-text-secondary)",
            }}>
              {t === "users" ? "Usuarios" : "Grupos"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {tab === "users" && (
            <>
              {loadingPerms ? (
                <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Cargando...</p>
              ) : userPerms.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                  Sin permisos explícitos — todos los usuarios usan su rol global.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {userPerms.map((perm) => (
                    <PermissionRow
                      key={perm.id}
                      label={perm.user_name ?? perm.user_email ?? "—"}
                      sublabel={perm.user_email}
                      role={perm.role}
                      onChangeRole={(role) => setPermMut.mutate({ userId: perm.user_id, role })}
                      onRemove={() => removePermMut.mutate(perm.user_id)}
                    />
                  ))}
                </div>
              )}

              {addingUser ? (
                <div style={{ background: "var(--color-bg-subtle)", borderRadius: 8, padding: 14 }}>
                  <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Agregar usuario</p>
                  <input
                    placeholder="Buscar por email o nombre..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    autoFocus
                    style={{ marginBottom: 8 }}
                  />
                  {userSearch.length >= 1 && (
                    <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 8 }}>
                      {filteredUsers.slice(0, 8).map((u) => (
                        <button key={u.id} onClick={() => setSelectedUserId(u.id)} style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "7px 10px", fontSize: 13, borderRadius: 6,
                          background: selectedUserId === u.id ? "var(--color-primary-bg)" : "transparent",
                          border: selectedUserId === u.id ? "1px solid var(--color-primary-border)" : "1px solid transparent",
                          cursor: "pointer",
                        }}>
                          <span style={{ fontWeight: 600 }}>{u.username}</span>
                          <span style={{ color: "var(--color-text-muted)", marginLeft: 8 }}>{u.email}</span>
                        </button>
                      ))}
                      {filteredUsers.length === 0 && (
                        <p style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "4px 8px" }}>Sin resultados</p>
                      )}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ flex: 1 }}>
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <button className="btn btn-primary" style={{ fontSize: 13 }}
                      disabled={!selectedUserId || setPermMut.isPending}
                      onClick={() => setPermMut.mutate({ userId: selectedUserId, role: newRole })}>
                      Agregar
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => { setAddingUser(false); setUserSearch(""); setSelectedUserId(""); }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-secondary" onClick={() => setAddingUser(true)} style={{ fontSize: 13 }}>
                  + Agregar usuario
                </button>
              )}
            </>
          )}

          {tab === "groups" && (
            <>
              {loadingGroupPerms ? (
                <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Cargando...</p>
              ) : groupPerms.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                  Sin grupos asignados a este dataset.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {groupPerms.map((perm) => (
                    <PermissionRow
                      key={perm.id}
                      label={perm.group_name ?? "Grupo"}
                      role={perm.role}
                      icon=""
                      onChangeRole={(role) => setGroupPermMut.mutate({ groupId: perm.group_id, role })}
                      onRemove={() => removeGroupPermMut.mutate(perm.group_id)}
                    />
                  ))}
                </div>
              )}

              {addingGroup ? (
                <div style={{ background: "var(--color-bg-subtle)", borderRadius: 8, padding: 14 }}>
                  <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Agregar grupo</p>
                  <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} style={{ marginBottom: 8 }}>
                    <option value="">Seleccionar grupo...</option>
                    {availableGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name} ({g.member_count} miembros)</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ flex: 1 }}>
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <button className="btn btn-primary" style={{ fontSize: 13 }}
                      disabled={!selectedGroupId || setGroupPermMut.isPending}
                      onClick={() => setGroupPermMut.mutate({ groupId: selectedGroupId, role: newRole })}>
                      Agregar
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => { setAddingGroup(false); setSelectedGroupId(""); }}>
                      Cancelar
                    </button>
                  </div>
                  {availableGroups.length === 0 && (
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
                      Todos los grupos ya tienen permisos asignados.
                    </p>
                  )}
                </div>
              ) : (
                <button className="btn btn-secondary" onClick={() => setAddingGroup(true)} style={{ fontSize: 13 }}>
                  + Agregar grupo
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionRow({
  label, sublabel, role, icon, onChangeRole, onRemove,
}: {
  label: string;
  sublabel?: string;
  role: string;
  icon?: string;
  onChangeRole: (role: string) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px", borderRadius: 8,
      border: "1px solid var(--color-border-light)",
      background: "var(--color-surface)",
    }}>
      <span style={{ fontSize: 18 }}>{icon ?? ""}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</p>
        {sublabel && sublabel !== label && (
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>{sublabel}</p>
        )}
      </div>
      <select
        value={role}
        onChange={(e) => onChangeRole(e.target.value)}
        style={{ fontSize: 12, padding: "3px 6px", width: 110 }}
      >
        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <button className="btn btn-danger-ghost" onClick={onRemove} style={{ padding: "3px 7px", fontSize: 13 }} title="Quitar permiso explícito">×</button>
    </div>
  );
}

import api from "./client";
import type { Workspace } from "../workspace/WorkspaceContext";

export interface WorkspaceMember {
  user_id: string;
  username: string;
  email: string;
  role: string;
  joined_at: string;
}

export const getWorkspaces = () =>
  api.get<Workspace[]>("/workspaces").then((r) => r.data);

export const createWorkspace = (body: { name: string; description?: string | null }) =>
  api.post<Workspace>("/workspaces", body).then((r) => r.data);

export const updateWorkspace = (id: string, body: { name?: string; description?: string }) =>
  api.patch<Workspace>(`/workspaces/${id}`, body).then((r) => r.data);

export const deleteWorkspace = (id: string) =>
  api.delete(`/workspaces/${id}`);

export const getWorkspaceMembers = (workspaceId: string) =>
  api.get<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`).then((r) => r.data);

export const addWorkspaceMember = (workspaceId: string, userId: string, role: string) =>
  api.post<WorkspaceMember>(`/workspaces/${workspaceId}/members`, { user_id: userId, role }).then((r) => r.data);

export const updateMemberRole = (workspaceId: string, userId: string, role: string) =>
  api.patch<WorkspaceMember>(`/workspaces/${workspaceId}/members/${userId}`, { user_id: userId, role }).then((r) => r.data);

export const removeWorkspaceMember = (workspaceId: string, userId: string) =>
  api.delete(`/workspaces/${workspaceId}/members/${userId}`);

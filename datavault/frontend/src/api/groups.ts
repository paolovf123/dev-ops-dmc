import api from "./client";
import type { UserGroup, GroupMember } from "../types";

export const getGroups = () =>
  api.get<UserGroup[]>("/groups").then((r) => r.data);

export const createGroup = (name: string, description?: string) =>
  api.post<UserGroup>("/groups", { name, description }).then((r) => r.data);

export const updateGroup = (id: string, body: { name?: string; description?: string }) =>
  api.patch<UserGroup>(`/groups/${id}`, body).then((r) => r.data);

export const deleteGroup = (id: string) =>
  api.delete(`/groups/${id}`);

export const getGroupMembers = (groupId: string) =>
  api.get<GroupMember[]>(`/groups/${groupId}/members`).then((r) => r.data);

export const addGroupMember = (groupId: string, userId: string) =>
  api.post(`/groups/${groupId}/members`, { user_id: userId });

export const removeGroupMember = (groupId: string, userId: string) =>
  api.delete(`/groups/${groupId}/members/${userId}`);

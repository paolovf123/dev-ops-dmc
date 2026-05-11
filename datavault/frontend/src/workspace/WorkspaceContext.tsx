import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  my_role: string | null;
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  current: Workspace | null;
  setCurrent: (ws: Workspace | null) => void;
  reload: () => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [current, setCurrent] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Workspace[]>("/workspaces");
      setWorkspaces(res.data);
      if (!isAdmin && res.data.length > 0) {
        const isManager = res.data.some((w) => w.my_role === "owner" || w.my_role === "admin_ws");
        if (!isManager) {
          // Member regular → autoseleccionar workspace (usan DatasetList, no /ws/:id)
          const savedId = localStorage.getItem("dv_workspace_id");
          const found = savedId ? (res.data.find((w) => w.id === savedId) ?? res.data[0]) : res.data[0];
          setCurrent(found);
        }
        // Owner/admin_ws → navegan a /ws/:id manualmente via WorkspaceSwitcher
      }
      // Admin global → el workspace activo lo maneja la URL /ws/:id
    } catch {
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSetCurrent = (ws: Workspace | null) => {
    setCurrent(ws);
    if (ws) localStorage.setItem("dv_workspace_id", ws.id);
    else localStorage.removeItem("dv_workspace_id");
  };

  return (
    <WorkspaceContext.Provider value={{ workspaces, current, setCurrent: handleSetCurrent, reload, loading }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace debe usarse dentro de WorkspaceProvider");
  return ctx;
}

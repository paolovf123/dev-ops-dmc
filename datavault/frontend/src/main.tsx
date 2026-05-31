import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { ToastProvider } from "./components/Toast";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { WorkspaceProvider } from "./workspace/WorkspaceContext";
import DatasetList from "./pages/DatasetList";
import WorkspaceView from "./pages/WorkspaceView";
import DatasetView from "./pages/DatasetView";
import RecordForm from "./pages/RecordForm";
import CreateDataset from "./pages/CreateDataset";
import Login from "./pages/Login";
import SetPassword from "./pages/SetPassword";
import Settings from "./pages/Settings";
import AdminAudit from "./pages/AdminAudit";
import AdminWorkspaces from "./pages/AdminWorkspaces";
import AdminPeople from "./pages/AdminPeople";
import Billing from "./pages/Billing";
import ComputedDatasetEditor from "./pages/ComputedDatasetEditor";
import ScriptsHub from "./pages/ScriptsHub";
import "./styles/tokens.css";
import "./index.css";
import "./styles/og.css";
import "./styles/og-grid.css";
import "./styles/og-kit.css";
import { bootstrapTheme } from "./utils/theme";

// Aplica tema/paleta/densidad persistidos en <html> antes del primer render
bootstrapTheme();

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        // Don't retry on 401/403
        if (axios_status(error) === 401 || axios_status(error) === 403) return false;
        return failureCount < 2;
      },
    },
  },
});

function axios_status(err: unknown): number | null {
  if (err && typeof err === "object" && "response" in err) {
    const r = (err as { response?: { status?: number } }).response;
    return r?.status ?? null;
  }
  return null;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, hydrated } = useAuth();
  // Mientras AuthContext valida la sesión vía /auth/me, no redirigir todavía
  if (!hydrated && !user) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/set-password" element={<SetPassword />} />
              <Route path="/" element={<RequireAuth><DatasetList /></RequireAuth>} />
              <Route path="/ws/:workspaceId" element={<RequireAuth><WorkspaceView /></RequireAuth>} />
              <Route path="/create" element={<RequireAuth><CreateDataset /></RequireAuth>} />
              <Route path="/datasets/:datasetId" element={<RequireAuth><DatasetView /></RequireAuth>} />
              <Route path="/datasets/:datasetId/new" element={<RequireAuth><RecordForm /></RequireAuth>} />
              <Route path="/datasets/:datasetId/computed" element={<RequireAuth><ComputedDatasetEditor /></RequireAuth>} />
              <Route path="/computed/new" element={<RequireAuth><ComputedDatasetEditor /></RequireAuth>} />
              <Route path="/scripts" element={<RequireAuth><ScriptsHub /></RequireAuth>} />
              {/* Consolidación: identidad → Personas, autorización → Accesos */}
              <Route path="/admin/personas" element={<RequireAuth><AdminPeople /></RequireAuth>} />
              <Route path="/admin/accesos" element={<RequireAuth><AdminPeople initialTab="accesos" /></RequireAuth>} />
              <Route path="/admin/workspaces" element={<RequireAuth><AdminWorkspaces /></RequireAuth>} />
              <Route path="/admin/audit" element={<RequireAuth><AdminAudit /></RequireAuth>} />
              {/* Rutas viejas → redirigen a las consolidadas */}
              <Route path="/admin/users" element={<Navigate to="/admin/personas" replace />} />
              <Route path="/admin/groups" element={<Navigate to="/admin/personas" replace />} />
              <Route path="/admin/permissions" element={<Navigate to="/admin/accesos" replace />} />
              <Route path="/billing" element={<RequireAuth><Billing /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            </Routes>
          </BrowserRouter>
        </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { ToastProvider } from "./components/Toast";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import DatasetList from "./pages/DatasetList";
import DatasetView from "./pages/DatasetView";
import RecordForm from "./pages/RecordForm";
import CreateDataset from "./pages/CreateDataset";
import Login from "./pages/Login";
import AdminUsers from "./pages/AdminUsers";
import AdminAudit from "./pages/AdminAudit";
import AdminGroups from "./pages/AdminGroups";
import ComputedDatasetEditor from "./pages/ComputedDatasetEditor";
import ScriptsHub from "./pages/ScriptsHub";
import "./index.css";

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
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
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
              <Route path="/" element={<RequireAuth><DatasetList /></RequireAuth>} />
              <Route path="/create" element={<RequireAuth><CreateDataset /></RequireAuth>} />
              <Route path="/datasets/:datasetId" element={<RequireAuth><DatasetView /></RequireAuth>} />
              <Route path="/datasets/:datasetId/new" element={<RequireAuth><RecordForm /></RequireAuth>} />
              <Route path="/datasets/:datasetId/computed" element={<RequireAuth><ComputedDatasetEditor /></RequireAuth>} />
              <Route path="/computed/new" element={<RequireAuth><ComputedDatasetEditor /></RequireAuth>} />
              <Route path="/scripts" element={<RequireAuth><ScriptsHub /></RequireAuth>} />
              <Route path="/admin/users" element={<RequireAuth><AdminUsers /></RequireAuth>} />
              <Route path="/admin/audit" element={<RequireAuth><AdminAudit /></RequireAuth>} />
              <Route path="/admin/groups" element={<RequireAuth><AdminGroups /></RequireAuth>} />
            </Routes>
          </BrowserRouter>
        </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

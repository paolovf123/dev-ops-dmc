import api from "./client";

export interface Plan {
  key: string;
  name: string;
  price_pen: number;
  max_members: number | null;
  max_datasets: number | null;
  max_records: number | null;
  scripts: boolean;
  api: boolean;
}

export interface BankInfo { bank: string; account: string; cci: string; holder: string; currency: string; }

export interface PlansResponse {
  plans: Plan[];
  mercadopago_enabled: boolean;
  bank: BankInfo;
  bank_configured: boolean;
}

export interface WorkspaceBilling {
  subscription: {
    plan: string;
    status: string;
    provider: string | null;
    trial_ends_at: string | null;
    current_period_end: string | null;
  };
  plan_key: string;
  plan: Plan;
  usage: { members: number; datasets: number; records: number };
  can_manage: boolean;
}

export interface PaymentClaim {
  id: string;
  workspace_id: string;
  workspace_name: string;
  plan: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  status: string;
  created_at: string;
}

export const getPlans = () => api.get<PlansResponse>("/billing/plans").then((r) => r.data);

export const getWorkspaceBilling = (workspaceId: string) =>
  api.get<WorkspaceBilling>(`/workspaces/${workspaceId}/billing`).then((r) => r.data);

export const reportTransfer = (workspaceId: string, body: { plan: string; reference?: string; note?: string }) =>
  api.post(`/workspaces/${workspaceId}/billing/transfer`, body).then((r) => r.data);

export const mpCheckout = (workspaceId: string, plan: string) =>
  api.post<{ init_point: string; preference_id: string }>(`/workspaces/${workspaceId}/billing/checkout`, { plan }).then((r) => r.data);

export const listClaims = (status = "pending") =>
  api.get<PaymentClaim[]>(`/billing/claims`, { params: { status } }).then((r) => r.data);

export const approveClaim = (id: string, note?: string) =>
  api.post(`/billing/claims/${id}/approve`, { note }).then((r) => r.data);

export const rejectClaim = (id: string, note?: string) =>
  api.post(`/billing/claims/${id}/reject`, { note }).then((r) => r.data);

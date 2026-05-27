import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWorkspaces } from "../api/workspaces";
import { getPlans, getWorkspaceBilling, reportTransfer, mpCheckout, listClaims, approveClaim, rejectClaim, type Plan } from "../api/billing";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import UserMenu from "../components/UserMenu";
import { PageHeader, Toolbar, Select, EmptyState, Badge } from "../components/ui";
import { IcCreditCard, IcUsers, IcGrid, IcTable, IcCheck, IcBank } from "../components/ui/icons";

const STATUS_TONE: Record<string, "success" | "warn" | "danger" | "neutral"> = {
  active: "success", trialing: "primary" as "neutral", past_due: "warn", canceled: "danger", pending: "warn",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Activo", trialing: "Prueba", past_due: "Pago vencido", canceled: "Cancelado", pending: "Pendiente",
};
const fmtLimit = (n: number | null) => (n === null ? "∞" : n.toLocaleString("es-PE"));

function UsageBar({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max === null ? 0 : Math.min(100, Math.round((used / Math.max(max, 1)) * 100));
  const over = max !== null && used >= max;
  return (
    <div style={{ flex: 1, minWidth: 160 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: "var(--color-text-secondary)", fontWeight: 600 }}>{label}</span>
        <span style={{ color: over ? "var(--pm-red-500)" : "var(--color-text-muted)" }}>
          {used.toLocaleString("es-PE")} / {fmtLimit(max)}
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: "var(--color-border-light)", overflow: "hidden" }}>
        <div style={{ width: max === null ? "12%" : `${pct}%`, height: "100%", borderRadius: 99,
          background: over ? "var(--pm-red-500)" : max === null ? "var(--pm-green-500)" : "var(--color-primary)" }} />
      </div>
    </div>
  );
}

export default function Billing() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: allWorkspaces = [] } = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });
  const workspaces = isAdmin ? allWorkspaces : allWorkspaces.filter((w) => w.my_role === "owner" || w.my_role === "admin_ws");
  const [wsId, setWsId] = useState("");
  const effectiveWsId = wsId || (workspaces[0]?.id ?? "");
  const selectedWs = workspaces.find((w) => w.id === effectiveWsId);

  const { data: plansData } = useQuery({ queryKey: ["billing-plans"], queryFn: getPlans });
  const { data: billing } = useQuery({
    queryKey: ["billing", effectiveWsId],
    queryFn: () => getWorkspaceBilling(effectiveWsId),
    enabled: !!effectiveWsId,
  });

  const [payPlan, setPayPlan] = useState<Plan | null>(null);
  const [reference, setReference] = useState("");

  const transferMut = useMutation({
    mutationFn: () => reportTransfer(effectiveWsId, { plan: payPlan!.key, reference: reference || undefined }),
    onSuccess: () => {
      toast("Aviso de pago enviado. Un administrador lo verificará y activará tu plan.", "success");
      setPayPlan(null); setReference("");
      qc.invalidateQueries({ queryKey: ["billing-claims"] });
    },
    onError: () => toast("No se pudo registrar el aviso de pago", "error"),
  });

  const mpMut = useMutation({
    mutationFn: () => mpCheckout(effectiveWsId, payPlan!.key),
    onSuccess: (d) => { if (d.init_point) window.location.href = d.init_point; },
    onError: () => toast("Mercado Pago no disponible. Usá transferencia bancaria.", "error"),
  });

  const canManage = billing?.can_manage ?? false;

  return (
    <>
      <header className="app-header">
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo app-header-logo--img"><img src="/opsgrid-logo.svg" alt="OpsGrid" /></div>
          <span className="app-header-name">Ops<em>Grid</em></span>
        </button>
        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Facturación</span>
        <div className="app-header-spacer" />
        <nav style={{ display: "flex", gap: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 13, gap: 6 }} onClick={() => navigate("/admin/workspaces")}>
            <IcGrid size={15} /> Workspaces
          </button>
        </nav>
        <UserMenu />
      </header>

      <div className="dk-page">
        <PageHeader
          icon={<span style={{ fontSize: 20, lineHeight: 1 }}>💳</span>}
          title="Planes y facturación"
          subtitle="Elegí el plan de cada workspace y gestioná el pago por Mercado Pago o transferencia bancaria."
        />

        {workspaces.length === 0 ? (
          <div className="dk-card">
            <EmptyState icon={<IcCreditCard size={24} />} title="Sin workspaces"
              subtitle="Necesitás ser owner/admin_ws de un workspace para gestionar su plan." />
          </div>
        ) : (
          <>
            <Toolbar style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <IcGrid size={15} /> Workspace
              </span>
              <Select value={effectiveWsId} onChange={setWsId} aria-label="Workspace" style={{ flex: 1, maxWidth: 420 }}>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Toolbar>

            {/* Plan actual + uso */}
            {billing && (
              <div className="dk-card dk-card-pad" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>Plan {billing.plan.name}</span>
                    <Badge tone={STATUS_TONE[billing.subscription.status] ?? "neutral"}>
                      {STATUS_LABEL[billing.subscription.status] ?? billing.subscription.status}
                    </Badge>
                  </div>
                  <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                    {billing.plan.price_pen > 0 ? `S/ ${billing.plan.price_pen} / mes` : "Gratis"}
                    {billing.subscription.status === "trialing" && billing.subscription.trial_ends_at &&
                      ` · prueba hasta ${new Date(billing.subscription.trial_ends_at).toLocaleDateString("es-PE")}`}
                    {billing.subscription.current_period_end && billing.subscription.status === "active" &&
                      ` · renueva ${new Date(billing.subscription.current_period_end).toLocaleDateString("es-PE")}`}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <UsageBar label="Miembros" used={billing.usage.members} max={billing.plan.max_members} />
                  <UsageBar label="Datasets" used={billing.usage.datasets} max={billing.plan.max_datasets} />
                  <UsageBar label="Registros" used={billing.usage.records} max={billing.plan.max_records} />
                </div>
              </div>
            )}

            {/* Comparativa de planes */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 16 }}>
              {plansData?.plans.map((p) => {
                const current = billing?.plan_key === p.key;
                return (
                  <div key={p.key} className="dk-card dk-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10, border: current ? "1.5px solid var(--color-primary)" : undefined }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</span>
                      {current && <Badge tone="primary">Actual</Badge>}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
                      {p.price_pen > 0 ? <>S/ {p.price_pen}<span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-muted)" }}> /mes</span></> : "Gratis"}
                    </div>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: "var(--color-text-secondary)" }}>
                      <Feat ok>{fmtLimit(p.max_members)} miembros</Feat>
                      <Feat ok>{fmtLimit(p.max_datasets)} datasets</Feat>
                      <Feat ok>{fmtLimit(p.max_records)} registros</Feat>
                      <Feat ok={p.scripts}>Scripts / datasets calculados</Feat>
                      <Feat ok={p.api}>API tokens y webhooks</Feat>
                    </ul>
                    {!current && p.price_pen > 0 && canManage && (
                      <button className="btn btn-primary" style={{ marginTop: "auto", justifyContent: "center" }}
                        onClick={() => setPayPlan(p)}>
                        Elegir {p.name}
                      </button>
                    )}
                    {current && <div style={{ marginTop: "auto", fontSize: 12, color: "var(--color-text-muted)", textAlign: "center" }}>Plan vigente</div>}
                  </div>
                );
              })}
            </div>

            {/* Panel de pago */}
            {payPlan && (
              <div className="dk-card dk-card-pad" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Pagar plan {payPlan.name} — S/ {payPlan.price_pen}/mes</p>
                  <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setPayPlan(null)}>Cancelar</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                  {/* Mercado Pago */}
                  <div style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 16 }}>
                    <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                      <IcCreditCard size={16} /> Mercado Pago
                    </p>
                    {plansData?.mercadopago_enabled ? (
                      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}
                        disabled={mpMut.isPending} onClick={() => mpMut.mutate()}>
                        {mpMut.isPending ? "Redirigiendo…" : "Pagar con Mercado Pago"}
                      </button>
                    ) : (
                      <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-text-muted)" }}>
                        Aún no configurado. Configurá <code>MERCADOPAGO_ACCESS_TOKEN</code> para habilitarlo.
                      </p>
                    )}
                  </div>
                  {/* Transferencia */}
                  <div style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 16 }}>
                    <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                      <IcBank size={16} /> Transferencia bancaria
                    </p>
                    {plansData?.bank_configured ? (
                      <div style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 10 }}>
                        <div><strong>{plansData.bank.bank}</strong></div>
                        <div>Cuenta: {plansData.bank.account}</div>
                        {plansData.bank.cci && <div>CCI: {plansData.bank.cci}</div>}
                        {plansData.bank.holder && <div>Titular: {plansData.bank.holder}</div>}
                      </div>
                    ) : (
                      <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--color-text-muted)" }}>
                        Datos bancarios aún no configurados (<code>BILLING_BANK_*</code>). Igual podés avisar el pago.
                      </p>
                    )}
                    <input placeholder="N° de operación / referencia (opcional)" value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 8 }} />
                    <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center" }}
                      disabled={transferMut.isPending} onClick={() => transferMut.mutate()}>
                      {transferMut.isPending ? "Enviando…" : "Ya transferí — avisar pago"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Admin: avisos de pago pendientes */}
            {isAdmin && <AdminClaims />}
          </>
        )}
      </div>
    </>
  );
}

function Feat({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 7, opacity: ok ? 1 : 0.45 }}>
      <span style={{ display: "inline-flex", color: ok ? "var(--pm-green-600)" : "var(--color-text-muted)" }}>
        {ok ? <IcCheck size={14} /> : <span style={{ fontSize: 14, lineHeight: 1 }}>·</span>}
      </span>
      {children}
    </li>
  );
}

function AdminClaims() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: claims = [] } = useQuery({ queryKey: ["billing-claims"], queryFn: () => listClaims("pending") });

  const approve = useMutation({
    mutationFn: (id: string) => approveClaim(id),
    onSuccess: () => { toast("Pago aprobado y plan activado", "success"); qc.invalidateQueries({ queryKey: ["billing-claims"] }); qc.invalidateQueries({ queryKey: ["billing"] }); },
  });
  const reject = useMutation({
    mutationFn: (id: string) => rejectClaim(id),
    onSuccess: () => { toast("Aviso rechazado", "success"); qc.invalidateQueries({ queryKey: ["billing-claims"] }); },
  });

  return (
    <div className="dk-card dk-card--flush" style={{ marginTop: 8 }}>
      <div className="dk-card-pad" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Avisos de pago por transferencia <span style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>({claims.length} pendientes)</span></p>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>Verificá la transferencia en tu cuenta y aprobá para activar el plan del workspace.</p>
      </div>
      {claims.length === 0 ? (
        <EmptyState icon={<IcBank size={22} />} title="Sin avisos pendientes" subtitle="Cuando alguien reporte una transferencia aparecerá acá." />
      ) : (
        <table className="dk-table">
          <thead><tr><th>Workspace</th><th>Plan</th><th>Monto</th><th>Referencia</th><th></th></tr></thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id}>
                <td className="dk-td-primary">{c.workspace_name}</td>
                <td><Badge tone="primary">{c.plan}</Badge></td>
                <td className="dk-td-muted">S/ {c.amount}</td>
                <td className="dk-td-muted">{c.reference || "—"}</td>
                <td className="dk-td-right">
                  <div style={{ display: "inline-flex", gap: 6 }}>
                    <button className="dk-row-action dk-row-action--primary" disabled={approve.isPending} onClick={() => approve.mutate(c.id)}>
                      <IcCheck /> Aprobar
                    </button>
                    <button className="dk-row-action" style={{ color: "#DC2626" }} disabled={reject.isPending} onClick={() => reject.mutate(c.id)}>
                      Rechazar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

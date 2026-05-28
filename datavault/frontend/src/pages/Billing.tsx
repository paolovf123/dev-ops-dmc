import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Hourglass, ShieldCheck, CreditCard } from "lucide-react";
import { getWorkspaces } from "../api/workspaces";
import { getPlans, getWorkspaceBilling, reportTransfer, mpCheckout, listClaims, approveClaim, rejectClaim, type Plan } from "../api/billing";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import AppShell from "../components/chrome/AppShell";

const STATUS_LABEL: Record<string, string> = {
  active: "Activo", trialing: "Prueba", past_due: "Pago vencido", canceled: "Cancelado", pending: "Pendiente",
};
const STATUS_BADGE: Record<string, string> = {
  active: "badge--success", trialing: "badge--pri", past_due: "badge--danger", canceled: "badge--danger", pending: "badge--danger",
};

const fmtLimit = (n: number | null) => (n === null ? "ilimitados" : n.toLocaleString("es-PE"));

/** Barra de uso con modificadores warn/danger según porcentaje. */
function UsageCard({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max === null ? 12 : Math.min(100, Math.round((used / Math.max(max, 1)) * 100));
  const tone = max === null ? "" : pct >= 95 ? " usage--danger" : pct >= 80 ? " usage--warn" : "";
  const remaining = max === null ? null : Math.max(0, max - used);
  return (
    <div className="ds-card" style={{ marginBottom: 0 }}>
      <div className={`usage${tone}`}>
        <div className="usage__head">
          <span className="usage__label">{label}</span>
          <span className="usage__val">
            {used.toLocaleString("es-PE")} <em>/ {fmtLimit(max)}</em>
          </span>
        </div>
        <div className="usage__bar"><div className="usage__fill" style={{ width: `${pct}%` }} /></div>
        {max !== null && (
          <p
            style={{
              margin: "var(--sp-2) 0 0",
              fontSize: "var(--fs-11)",
              color: pct >= 95 ? "var(--danger)" : pct >= 80 ? "color-mix(in oklab, var(--warning) 70%, var(--text))" : "var(--text-mute)",
            }}
          >
            {pct >= 95
              ? `⚠ Estás casi al tope (${remaining!.toLocaleString("es-PE")} disponibles).`
              : pct >= 80
                ? `⚠ ${remaining!.toLocaleString("es-PE")} ${label.toLowerCase()} antes del tope.`
                : `${remaining!.toLocaleString("es-PE")} disponibles.`}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Billing() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: allWorkspaces = [] } = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });
  const workspaces = isAdmin ? allWorkspaces : allWorkspaces.filter((w) => w.my_role === "owner" || w.my_role === "admin_ws");
  const [wsId, setWsId] = useState("");
  const effectiveWsId = wsId || (workspaces[0]?.id ?? "");

  const { data: plansData } = useQuery({ queryKey: ["billing-plans"], queryFn: getPlans });
  const { data: billing } = useQuery({
    queryKey: ["billing", effectiveWsId],
    queryFn: () => getWorkspaceBilling(effectiveWsId),
    enabled: !!effectiveWsId,
  });

  // Plan seleccionado para pagar + referencia de transferencia.
  const [payPlan, setPayPlan] = useState<Plan | null>(null);
  const [method, setMethod] = useState<"mp" | "transfer">("mp");
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
  const plans = plansData?.plans ?? [];
  // Plan recomendado = el más caro que no sea el actual (típicamente Business).
  const recommendedKey = plans
    .filter((p) => p.key !== billing?.plan_key)
    .reduce<Plan | null>((best, p) => (!best || p.price_pen > best.price_pen ? p : best), null)?.key;

  const pay = () => {
    if (method === "mp") mpMut.mutate();
    else transferMut.mutate();
  };

  return (
    <>
      <AppShell active="billing">
        <main className="page page-main" style={{ overflowY: "auto", maxWidth: "none", width: "100%" }}>
          <div className="page-header">
            <div>
              <h1>Planes y facturación</h1>
              <p>Pago en soles peruanos · Mercado Pago o transferencia bancaria. Sin contratos, cancela cuando quieras.</p>
            </div>
            <div className="page-header__actions">
              {workspaces.length > 1 && (
                <select
                  className="btn btn--secondary"
                  value={effectiveWsId}
                  onChange={(e) => { setWsId(e.target.value); setPayPlan(null); }}
                  aria-label="Workspace"
                  style={{ minWidth: 200 }}
                >
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              )}
            </div>
          </div>

          {workspaces.length === 0 ? (
            <div className="ds-card" style={{ textAlign: "center", color: "var(--text-mute)" }}>
              <CreditCard style={{ width: 24, height: 24, margin: "0 auto var(--sp-2)" }} />
              <p style={{ margin: 0, fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>Sin workspaces</p>
              <p style={{ margin: "var(--sp-1) 0 0", fontSize: "var(--fs-13)" }}>
                Necesitás ser owner o admin de un workspace para gestionar su plan.
              </p>
            </div>
          ) : (
            <>
              {/* ─── Uso del plan actual ─── */}
              {billing && (
                <>
                  <h3 className="t-h4" style={{ margin: "0 0 var(--sp-3)" }}>
                    Uso del plan actual · <span style={{ color: "var(--accent-pri)" }}>{billing.plan.name}</span>
                    {billing.subscription.status !== "active" && (
                      <span className={`badge ${STATUS_BADGE[billing.subscription.status] ?? "badge--pri"}`} style={{ marginLeft: "var(--sp-2)" }}>
                        {STATUS_LABEL[billing.subscription.status] ?? billing.subscription.status}
                      </span>
                    )}
                  </h3>
                  <div className="bill-usage-grid">
                    <UsageCard label="Miembros" used={billing.usage.members} max={billing.plan.max_members} />
                    <UsageCard label="Datasets" used={billing.usage.datasets} max={billing.plan.max_datasets} />
                    <UsageCard label="Registros totales" used={billing.usage.records} max={billing.plan.max_records} />
                  </div>
                </>
              )}

              {/* ─── Elegir plan ─── */}
              <h3 className="t-h4" style={{ margin: "var(--sp-6) 0 var(--sp-3)" }}>Elegir plan</h3>
              <div className="bill-grid">
                {plans.map((p) => {
                  const current = billing?.plan_key === p.key;
                  const recommended = !current && p.key === recommendedKey;
                  const selected = payPlan?.key === p.key;
                  return (
                    <div key={p.key} className={`bill-card${current ? " is-current" : ""}${recommended ? " is-recommended" : ""}`}>
                      {current && <span className="bill-card__pill">PLAN ACTUAL</span>}
                      <div>
                        <div className="bill-card__name" style={recommended ? { color: "var(--accent-rel)" } : current ? undefined : { color: "var(--text-mute)" }}>
                          {p.name}
                        </div>
                        <div className="bill-card__price">
                          S/ {p.price_pen} <small>/ mes</small>
                        </div>
                      </div>
                      <ul className="bill-card__features">
                        <li><Check /> <b>{fmtLimit(p.max_members)}</b> miembros</li>
                        <li><Check /> <b>{fmtLimit(p.max_datasets)}</b> datasets · <b>{fmtLimit(p.max_records)}</b> registros</li>
                        <li style={{ opacity: p.scripts ? 1 : 0.45 }}>
                          <Check /> Scripts / datasets calculados
                        </li>
                        <li style={{ opacity: p.api ? 1 : 0.45 }}>
                          <Check /> API tokens y webhooks
                        </li>
                      </ul>
                      <div className="bill-card__cta">
                        {current ? (
                          <button className="btn btn--ghost" style={{ width: "100%" }} disabled>Tu plan actual</button>
                        ) : canManage ? (
                          <button
                            className={recommended ? "btn btn--primary" : "btn btn--secondary"}
                            style={recommended
                              ? { width: "100%", background: "var(--accent-rel)", borderColor: "var(--accent-rel)" }
                              : { width: "100%" }}
                            onClick={() => { setPayPlan(p); setReference(""); }}
                          >
                            {p.price_pen > 0 ? `Subir a ${p.name}` : `Cambiar a ${p.name}`}
                          </button>
                        ) : (
                          <button className="btn btn--ghost" style={{ width: "100%" }} disabled>Solo admin</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ─── Método de pago (aparece al elegir un plan) ─── */}
              {payPlan && (
                <>
                  <h3 className="t-h4" style={{ margin: "var(--sp-6) 0 var(--sp-3)", display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                    Método de pago · {payPlan.name} — S/ {payPlan.price_pen}/mes
                    <button className="btn btn--ghost btn--sm" style={{ marginLeft: "auto" }} onClick={() => { setPayPlan(null); setReference(""); }}>
                      <X /> Cancelar
                    </button>
                  </h3>
                  <div className="bill-pay">
                    <p style={{ margin: "0 0 var(--sp-3)", fontSize: "var(--fs-13)", color: "var(--text-soft)" }}>
                      Elige cómo quieres pagar. Te enviamos la factura electrónica SUNAT en automático.
                    </p>
                    <div className="bill-pay-methods">
                      {/* Mercado Pago */}
                      <div className={`bill-method${method === "mp" ? " is-on" : ""}`} onClick={() => setMethod("mp")}>
                        <span className="bill-method__radio" />
                        <span className="bill-method__logo is-mp">MP</span>
                        <div style={{ flex: 1 }}>
                          <div className="bill-method__name">Mercado Pago</div>
                          <div className="bill-method__desc">Tarjeta, Yape, Plin o efectivo en agente · cargo automático mensual</div>
                        </div>
                        {plansData?.mercadopago_enabled
                          ? <span className="badge badge--success">DISPONIBLE</span>
                          : <span className="badge badge--danger">NO CONFIGURADO</span>}
                      </div>
                      {/* Transferencia bancaria */}
                      <div className={`bill-method${method === "transfer" ? " is-on" : ""}`} onClick={() => setMethod("transfer")}>
                        <span className="bill-method__radio" />
                        <span className="bill-method__logo is-bcp">BCP</span>
                        <div style={{ flex: 1 }}>
                          <div className="bill-method__name">Transferencia bancaria</div>
                          <div className="bill-method__desc">
                            {plansData?.bank_configured
                              ? `${plansData.bank.bank} · sube el voucher y aprobamos en 24h`
                              : "BCP, BBVA, Interbank · sube el voucher y aprobamos en 24h"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Detalle del método elegido */}
                    {method === "transfer" && (
                      <div style={{ marginTop: "var(--sp-4)" }}>
                        {plansData?.bank_configured && (
                          <div style={{ fontSize: "var(--fs-13)", color: "var(--text-soft)", lineHeight: 1.6, marginBottom: "var(--sp-3)" }}>
                            <div><strong>{plansData.bank.bank}</strong></div>
                            <div>Cuenta: {plansData.bank.account}</div>
                            {plansData.bank.cci && <div>CCI: {plansData.bank.cci}</div>}
                            {plansData.bank.holder && <div>Titular: {plansData.bank.holder}</div>}
                          </div>
                        )}
                        <input
                          placeholder="N° de operación / referencia (opcional)"
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                          style={{
                            width: "100%", maxWidth: 360, fontSize: "var(--fs-13)", padding: "8px 10px",
                            border: "1px solid var(--border)", borderRadius: "var(--r-2)", marginBottom: "var(--sp-3)",
                            background: "var(--surface)", color: "var(--text)",
                          }}
                        />
                      </div>
                    )}

                    <div style={{ marginTop: "var(--sp-4)", display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
                      {method === "mp" ? (
                        <button
                          className="btn btn--primary"
                          disabled={mpMut.isPending || !plansData?.mercadopago_enabled}
                          onClick={pay}
                        >
                          {mpMut.isPending ? "Redirigiendo…" : "Pagar con Mercado Pago"}
                        </button>
                      ) : (
                        <button className="btn btn--primary" disabled={transferMut.isPending} onClick={pay}>
                          {transferMut.isPending ? "Enviando…" : "Ya transferí — avisar pago"}
                        </button>
                      )}
                    </div>

                    <p style={{ margin: "var(--sp-4) 0 0", fontSize: "var(--fs-11)", color: "var(--text-mute)", display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                      <ShieldCheck style={{ width: 12, height: 12, color: "var(--success)" }} />
                      Datos protegidos · pago procesado en infraestructura PCI-DSS. No guardamos tu tarjeta directamente.
                    </p>
                  </div>
                </>
              )}

              {/* ─── Admin: solicitudes de pago pendientes ─── */}
              {isAdmin && <AdminClaims />}
            </>
          )}
        </main>
      </AppShell>
    </>
  );
}

function AdminClaims() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: claims = [] } = useQuery({ queryKey: ["billing-claims"], queryFn: () => listClaims("pending") });

  const approve = useMutation({
    mutationFn: (id: string) => approveClaim(id),
    onSuccess: () => {
      toast("Pago aprobado y plan activado", "success");
      qc.invalidateQueries({ queryKey: ["billing-claims"] });
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
  });
  const reject = useMutation({
    mutationFn: (id: string) => rejectClaim(id),
    onSuccess: () => { toast("Aviso rechazado", "success"); qc.invalidateQueries({ queryKey: ["billing-claims"] }); },
  });

  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

  return (
    <>
      <h3 className="t-h4" style={{ margin: "var(--sp-6) 0 var(--sp-3)", display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
        <Hourglass style={{ width: 16, height: 16, color: "var(--warning)" }} />
        Solicitudes de pago pendientes
        {claims.length > 0 && <span className="badge badge--danger">{claims.length}</span>}
        <span style={{ fontSize: "var(--fs-11)", color: "var(--text-mute)", fontWeight: "var(--fw-regular)", marginLeft: "auto" }}>
          vista admin
        </span>
      </h3>

      {claims.length === 0 ? (
        <div className="ds-card" style={{ textAlign: "center", color: "var(--text-mute)", fontSize: "var(--fs-13)" }}>
          Cuando alguien reporte una transferencia aparecerá acá.
        </div>
      ) : (
        <div className="bill-pending">
          {claims.map((c) => (
            <div className="bill-pending__row" key={c.id}>
              <div className="who">
                <span className="avatar avatar--sm avatar--violet">{initials(c.workspace_name)}</span>
                <div>
                  <b>{c.workspace_name}</b>
                  <div style={{ fontSize: "var(--fs-11)", color: "var(--text-mute)" }}>{c.plan}</div>
                </div>
              </div>
              <div>
                <span className="amount">S/ {Number(c.amount).toFixed(2)}</span>
                <div className="meta">
                  {c.method === "transfer" ? "Transferencia" : c.method}
                  {c.reference ? ` · ${c.reference}` : ""}
                </div>
              </div>
              <div>
                <div className="meta">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString("es-PE") : "—"}
                </div>
                <span className="status-pill status-pill--due"><span className="status-pill__dot" />Esperando aprobación</span>
              </div>
              <div className="actions">
                <button className="btn btn--danger btn--sm" disabled={reject.isPending} onClick={() => reject.mutate(c.id)}>
                  <X />
                </button>
                <button className="btn btn--primary btn--sm" disabled={approve.isPending} onClick={() => approve.mutate(c.id)}>
                  <Check /> Aprobar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

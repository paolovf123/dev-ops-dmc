import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check, X, Hourglass, ShieldCheck, CreditCard, Bell, Upload, ChevronDown,
} from "lucide-react";
import { getWorkspaces } from "../api/workspaces";
import { getPlans, getWorkspaceBilling, reportTransfer, mpCheckout, listClaims, approveClaim, rejectClaim, type Plan } from "../api/billing";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import AppShell from "../components/chrome/AppShell";
import { Avatar, Badge, Btn } from "../components/ui/kit";

const STATUS_LABEL: Record<string, string> = {
  active: "Activo", trialing: "Prueba", past_due: "Pago vencido", canceled: "Cancelado", pending: "Pendiente",
};
const STATUS_TONE: Record<string, "success" | "primary" | "danger"> = {
  active: "success", trialing: "primary", past_due: "danger", canceled: "danger", pending: "danger",
};

const fmtLimit = (n: number | null) => (n === null ? "ilimitados" : n.toLocaleString("es-PE"));

const sectionTitle: React.CSSProperties = {
  font: "600 15px/1 var(--font-sans)", color: "var(--text)", display: "flex", alignItems: "center", gap: 8,
};

/** Barra de uso con tono warn/danger y aviso al 80/95%. */
function UsageCard({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max === null ? 12 : Math.min(100, Math.round((used / Math.max(max, 1)) * 100));
  const tone = max === null
    ? "var(--accent-pri)"
    : pct >= 95 ? "var(--danger)" : pct >= 80 ? "var(--warning)" : "var(--accent-pri)";
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
      padding: 18, boxShadow: "var(--shadow-1)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ font: "500 13px var(--font-sans)", color: "var(--text-soft)" }}>{label}</span>
        {max !== null && pct >= 80 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "600 11px var(--font-sans)", color: tone }}>
            <Bell size={12} /> {pct >= 95 ? "casi al tope" : "uso alto"}
          </span>
        )}
      </div>
      <div style={{ margin: "8px 0 12px", display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="mono" style={{ font: "700 24px var(--font-mono)", color: "var(--text)" }}>
          {used.toLocaleString("es-PE")}
        </span>
        <span className="mono" style={{ font: "500 14px var(--font-mono)", color: "var(--text-mute)" }}>
          / {fmtLimit(max)}
        </span>
      </div>
      <div style={{ height: 8, background: "var(--surface-alt)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: tone, borderRadius: 999, transition: "width var(--t-mid)" }} />
      </div>
      <div style={{ font: "400 11.5px var(--font-mono)", color: "var(--text-mute)", marginTop: 6 }}>
        {max === null ? "límite ilimitado" : `${pct}% usado`}
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
  const activeWs = workspaces.find((w) => w.id === effectiveWsId);

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

  const status = billing?.subscription.status ?? "active";
  const statusActive = status === "active";

  return (
    <AppShell active="billing">
      <main className="home-main" style={{ overflowY: "auto", padding: 0 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 80px" }}>
          {/* ─── Header ─── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, font: "700 28px/1.1 var(--font-sans)", letterSpacing: "-.02em", color: "var(--text)", display: "flex", alignItems: "center", gap: 10 }}>
                <CreditCard size={25} style={{ color: "var(--accent-pri)" }} /> Planes y facturación
              </h1>
              <p style={{ margin: "7px 0 0", font: "400 15px var(--font-sans)", color: "var(--text-soft)" }}>
                {billing ? (
                  <>
                    Workspace <strong style={{ color: "var(--text)" }}>{activeWs?.name ?? "—"}</strong>
                    {" · "}plan <strong style={{ color: "var(--text)" }}>{billing.plan.name}</strong>{" "}
                    <span style={{ color: statusActive ? "var(--success)" : "var(--warning)" }}>
                      ● {STATUS_LABEL[status]?.toLowerCase() ?? status}
                    </span>
                  </>
                ) : (
                  "Pago en soles peruanos · Mercado Pago o transferencia bancaria. Sin contratos, cancela cuando quieras."
                )}
              </p>
            </div>
            {workspaces.length > 1 && (
              <label style={{
                position: "relative", display: "flex", alignItems: "center", gap: 9, padding: "8px 12px",
                borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)",
                cursor: "pointer", color: "var(--text)", boxShadow: "var(--shadow-1)",
              }}>
                <span style={{ font: "400 13px var(--font-sans)", color: "var(--text-mute)" }}>Workspace</span>
                <Avatar name={activeWs?.name ?? ""} size={22} square />
                <span style={{ font: "600 14px var(--font-sans)" }}>{activeWs?.name ?? "—"}</span>
                <ChevronDown size={15} style={{ color: "var(--text-mute)" }} />
                <select
                  value={effectiveWsId}
                  onChange={(e) => { setWsId(e.target.value); setPayPlan(null); }}
                  aria-label="Workspace"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
                >
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
            )}
          </div>

          {workspaces.length === 0 ? (
            <div style={{
              marginTop: 28, textAlign: "center", color: "var(--text-mute)",
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
              padding: "34px 24px", boxShadow: "var(--shadow-1)",
            }}>
              <CreditCard size={26} style={{ margin: "0 auto 10px", display: "block" }} />
              <p style={{ margin: 0, font: "600 15px var(--font-sans)", color: "var(--text)" }}>Sin workspaces</p>
              <p style={{ margin: "6px 0 0", font: "400 13px var(--font-sans)" }}>
                Necesitás ser owner o admin de un workspace para gestionar su plan.
              </p>
            </div>
          ) : (
            <>
              {/* ─── Uso del plan actual ─── */}
              {billing && (
                <>
                  <div style={{ ...sectionTitle, margin: "28px 0 14px" }}>
                    Uso del plan actual
                    {!statusActive && (
                      <Badge tone={STATUS_TONE[status] ?? "primary"} dot>{STATUS_LABEL[status] ?? status}</Badge>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                    <UsageCard label="Miembros" used={billing.usage.members} max={billing.plan.max_members} />
                    <UsageCard label="Datasets" used={billing.usage.datasets} max={billing.plan.max_datasets} />
                    <UsageCard label="Registros" used={billing.usage.records} max={billing.plan.max_records} />
                  </div>
                </>
              )}

              {/* ─── Elegir plan ─── */}
              <div style={{ ...sectionTitle, margin: "32px 0 18px" }}>Elegir plan</div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(plans.length, 1)}, 1fr)`, gap: 16 }}>
                {plans.map((p) => {
                  const current = billing?.plan_key === p.key;
                  const recommended = !current && p.key === recommendedKey;
                  return (
                    <div key={p.key} style={{
                      position: "relative",
                      background: "var(--surface)",
                      border: `1.5px solid ${current ? "var(--accent-pri)" : recommended ? "var(--accent-rel)" : "var(--border)"}`,
                      borderRadius: "var(--r-3)", padding: 22,
                      boxShadow: current || recommended ? "var(--shadow-2)" : "var(--shadow-1)",
                    }}>
                      {current ? (
                        <span style={{
                          position: "absolute", top: -11, left: 22, padding: "3px 10px", borderRadius: "var(--r-pill)",
                          background: "var(--accent-pri)", color: "#fff", font: "700 10.5px var(--font-sans)", letterSpacing: ".04em",
                        }}>PLAN ACTUAL</span>
                      ) : recommended ? (
                        <span style={{
                          position: "absolute", top: -11, left: 22, padding: "3px 10px", borderRadius: "var(--r-pill)",
                          background: "var(--accent-rel)", color: "#fff", font: "700 10.5px var(--font-sans)", letterSpacing: ".04em",
                        }}>RECOMENDADO</span>
                      ) : null}

                      <div style={{ font: "700 17px var(--font-sans)", color: "var(--text)" }}>{p.name}</div>
                      <div style={{ margin: "10px 0 18px", display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span className="mono" style={{ font: "800 30px var(--font-mono)", color: "var(--text)" }}>S/ {p.price_pen}</span>
                        <span style={{ font: "400 13px var(--font-sans)", color: "var(--text-mute)" }}>/mes</span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
                        <Feature ok>{fmtLimit(p.max_members)} miembros</Feature>
                        <Feature ok>{fmtLimit(p.max_datasets)} datasets</Feature>
                        <Feature ok>{fmtLimit(p.max_records)} registros</Feature>
                        <Feature ok={p.scripts}>Scripts / datasets calculados</Feature>
                        <Feature ok={p.api}>API tokens y webhooks</Feature>
                      </div>

                      {current ? (
                        <Btn variant="tint" full>Plan actual</Btn>
                      ) : canManage ? (
                        <Btn
                          variant={recommended ? "primary" : "soft"}
                          tone={recommended ? "rel" : "primary"}
                          full
                          onClick={() => { setPayPlan(p); setReference(""); }}
                        >
                          {p.price_pen > 0 ? `Cambiar a ${p.name}` : `Bajar a ${p.name}`}
                        </Btn>
                      ) : (
                        <Btn variant="ghost" full disabled>Solo admin</Btn>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ─── Método de pago (aparece al elegir un plan) ─── */}
              {payPlan && (
                <>
                  <div style={{ ...sectionTitle, margin: "32px 0 14px" }}>
                    Método de pago
                    <span style={{ font: "400 13px var(--font-sans)", color: "var(--text-soft)" }}>
                      · {payPlan.name} — <span className="mono">S/ {payPlan.price_pen}</span>/mes
                    </span>
                    <Btn variant="ghost" size="sm" icon={<X size={14} />} style={{ marginLeft: "auto" }} onClick={() => { setPayPlan(null); setReference(""); }}>
                      Cancelar
                    </Btn>
                  </div>

                  <p style={{ margin: "0 0 14px", font: "400 13px var(--font-sans)", color: "var(--text-soft)" }}>
                    Elige cómo quieres pagar. Te enviamos la factura electrónica SUNAT en automático.
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {/* Mercado Pago */}
                    <button
                      onClick={() => setMethod("mp")}
                      style={{
                        textAlign: "left", display: "flex", gap: 12, padding: 16, borderRadius: "var(--r-3)",
                        border: `1.5px solid ${method === "mp" ? "var(--accent-pri)" : "var(--border)"}`,
                        background: method === "mp" ? "var(--pri-soft)" : "var(--surface)",
                        cursor: "pointer", boxShadow: "var(--shadow-1)",
                      }}
                    >
                      <span style={{
                        display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: "var(--r-2)",
                        background: "var(--surface)", border: "1px solid var(--border)", color: "var(--accent-pri)", flex: "none",
                      }}><CreditCard size={19} /></span>
                      <span style={{ flex: 1 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, font: "600 14px var(--font-sans)", color: "var(--text)" }}>
                          Mercado Pago
                          {method === "mp" && <Check size={15} style={{ color: "var(--accent-pri)" }} />}
                          {plansData && (
                            <Badge tone={plansData.mercadopago_enabled ? "success" : "danger"} style={{ marginLeft: "auto" }}>
                              {plansData.mercadopago_enabled ? "DISPONIBLE" : "NO CONFIGURADO"}
                            </Badge>
                          )}
                        </span>
                        <span style={{ display: "block", font: "400 12.5px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 4 }}>
                          Tarjeta, Yape, Plin o efectivo en agente · cargo automático mensual.
                        </span>
                      </span>
                    </button>

                    {/* Transferencia bancaria */}
                    <button
                      onClick={() => setMethod("transfer")}
                      style={{
                        textAlign: "left", display: "flex", gap: 12, padding: 16, borderRadius: "var(--r-3)",
                        border: `1.5px solid ${method === "transfer" ? "var(--accent-pri)" : "var(--border)"}`,
                        background: method === "transfer" ? "var(--pri-soft)" : "var(--surface)",
                        cursor: "pointer", boxShadow: "var(--shadow-1)",
                      }}
                    >
                      <span style={{
                        display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: "var(--r-2)",
                        background: "var(--surface)", border: "1px solid var(--border)", color: "var(--accent-pri)", flex: "none",
                      }}><Upload size={19} /></span>
                      <span style={{ flex: 1 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, font: "600 14px var(--font-sans)", color: "var(--text)" }}>
                          Transferencia bancaria
                          {method === "transfer" && <Check size={15} style={{ color: "var(--accent-pri)" }} />}
                        </span>
                        <span style={{ display: "block", font: "400 12.5px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 4 }}>
                          {plansData?.bank_configured
                            ? `${plansData.bank.bank} · sube el voucher y aprobamos en 24h.`
                            : "Sube tu comprobante; un admin lo aprueba en 24h."}
                        </span>
                      </span>
                    </button>
                  </div>

                  {/* Detalle del método elegido (transferencia) */}
                  {method === "transfer" && (
                    <div style={{
                      marginTop: 12, padding: 16, borderRadius: "var(--r-3)", background: "var(--surface-alt)",
                      border: "1px dashed var(--border-strong)", font: "400 13px/1.7 var(--font-sans)", color: "var(--text-soft)",
                    }}>
                      {plansData?.bank_configured ? (
                        <>
                          <div className="mono" style={{ color: "var(--text)" }}>
                            {plansData.bank.bank} · {plansData.bank.account}
                            {plansData.bank.holder ? ` · ${plansData.bank.holder}` : ""}
                          </div>
                          {plansData.bank.cci && <div>CCI: <span className="mono">{plansData.bank.cci}</span></div>}
                          <div>
                            Monto <strong className="mono" style={{ color: "var(--accent-pri)" }}>S/ {payPlan.price_pen}.00</strong>
                          </div>
                        </>
                      ) : (
                        <div className="mono" style={{ color: "var(--text)" }}>BCP, BBVA o Interbank · sube el voucher y aprobamos en 24h.</div>
                      )}
                      <input
                        placeholder="N° de operación / referencia (opcional)"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        style={{
                          width: "100%", maxWidth: 360, font: "400 13px var(--font-sans)", padding: "8px 10px",
                          border: "1px solid var(--border)", borderRadius: "var(--r-2)", marginTop: 10,
                          background: "var(--surface)", color: "var(--text)",
                        }}
                      />
                    </div>
                  )}

                  <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
                    {method === "mp" ? (
                      <Btn variant="primary" disabled={mpMut.isPending || !plansData?.mercadopago_enabled} onClick={pay}>
                        {mpMut.isPending ? "Redirigiendo…" : "Pagar con Mercado Pago"}
                      </Btn>
                    ) : (
                      <Btn variant="primary" disabled={transferMut.isPending} onClick={pay}>
                        {transferMut.isPending ? "Enviando…" : "Ya transferí — avisar pago"}
                      </Btn>
                    )}
                  </div>

                  <p style={{ margin: "16px 0 0", font: "400 11px var(--font-sans)", color: "var(--text-mute)", display: "flex", alignItems: "center", gap: 7 }}>
                    <ShieldCheck size={12} style={{ color: "var(--success)" }} />
                    Datos protegidos · pago procesado en infraestructura PCI-DSS. No guardamos tu tarjeta directamente.
                  </p>
                </>
              )}

              {/* ─── Admin: solicitudes de pago pendientes ─── */}
              {isAdmin && <AdminClaims />}
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function Feature({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9,
      font: "400 13px var(--font-sans)", color: ok ? "var(--text)" : "var(--text-mute)",
    }}>
      <span style={{
        display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: 999,
        background: ok ? "var(--success-soft)" : "var(--surface-alt)",
        color: ok ? "var(--success)" : "var(--text-mute)", flex: "none",
      }}>
        {ok ? <Check size={12} /> : <X size={12} />}
      </span>
      {children}
    </div>
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

  return (
    <>
      <div style={{ ...sectionTitle, margin: "32px 0 14px" }}>
        <Hourglass size={16} style={{ color: "var(--warning)" }} />
        Avisos de pago
        <Badge tone="warn">solo admin</Badge>
        {claims.length > 0 && <Badge tone="danger" solid>{claims.length}</Badge>}
      </div>

      {claims.length === 0 ? (
        <div style={{
          textAlign: "center", color: "var(--text-mute)", font: "400 13px var(--font-sans)",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
          padding: "26px 24px", boxShadow: "var(--shadow-1)",
        }}>
          Cuando alguien reporte una transferencia aparecerá acá.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {claims.map((c) => (
            <div key={c.id} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: "var(--r-3)",
              background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-1)", flexWrap: "wrap",
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "500 13px var(--font-sans)", color: "var(--text)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 9, background: "var(--warning)" }} /> Pendiente
              </span>
              <Avatar name={c.workspace_name} size={24} square />
              <span style={{ font: "600 13.5px var(--font-sans)", color: "var(--text)" }}>{c.workspace_name}</span>
              <span style={{ font: "400 13px var(--font-sans)", color: "var(--text-soft)" }}>
                {c.plan} · <span className="mono">S/ {Number(c.amount).toFixed(2)}</span> ·{" "}
                {c.method === "transfer" ? "transferencia" : c.method}
                {c.reference ? <> <span className="mono">#{c.reference}</span></> : ""}
              </span>
              <span style={{ font: "400 12px var(--font-mono)", color: "var(--text-mute)" }}>
                {c.created_at ? new Date(c.created_at).toLocaleDateString("es-PE") : "—"}
              </span>
              <div style={{ flex: 1 }} />
              <Btn variant="danger" size="sm" icon={<X size={14} />} disabled={reject.isPending} onClick={() => reject.mutate(c.id)}>
                Rechazar
              </Btn>
              <Btn variant="primary" size="sm" icon={<Check size={14} />} disabled={approve.isPending} onClick={() => approve.mutate(c.id)}>
                Aprobar
              </Btn>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

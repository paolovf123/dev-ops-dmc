// billing.jsx — Billing: usage + plans (S/) + payment method + claims

function UsageCard({ label, used, limit, fmt }) {
  const pct = Math.round((used / limit) * 100);
  const tone = pct >= 95 ? "var(--danger)" : pct >= 80 ? "var(--warning)" : "var(--accent-pri)";
  const f = fmt || ((n) => n.toLocaleString("es-PE"));
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", padding: 18, boxShadow: "var(--shadow-1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ font: "500 13px var(--font-sans)", color: "var(--text-soft)" }}>{label}</span>
        {pct >= 80 && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "600 11px var(--font-sans)", color: tone }}><Icon name="bell" size={12} /> {pct >= 95 ? "casi al tope" : "uso alto"}</span>}
      </div>
      <div style={{ margin: "8px 0 12px", display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="mono" style={{ font: "700 24px var(--font-mono)", color: "var(--text)" }}>{f(used)}</span>
        <span className="mono" style={{ font: "500 14px var(--font-mono)", color: "var(--text-mute)" }}>/ {f(limit)}</span>
      </div>
      <div style={{ height: 8, background: "var(--surface-alt)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: tone, borderRadius: 999 }} />
      </div>
      <div style={{ font: "400 11.5px var(--font-mono)", color: "var(--text-mute)", marginTop: 6 }}>{pct}% usado</div>
    </div>
  );
}

const PLANS = [
  { key: "free", name: "Free", price: 0, feats: [["3 miembros", true], ["3 datasets", true], ["2,000 registros", true], ["Scripts / API", false], ["Webhooks", false]], cur: false },
  { key: "pro", name: "Pro", price: 490, feats: [["50 miembros", true], ["50 datasets", true], ["200,000 registros", true], ["Scripts / API", true], ["Webhooks", true]], cur: true, pop: true },
  { key: "biz", name: "Business", price: 980, feats: [["100 miembros", true], ["100 datasets", true], ["400,000 registros", true], ["Scripts / API", true], ["Webhooks", true]], cur: false },
];

function PlanCard({ p }) {
  return (
    <div style={{ position: "relative", background: "var(--surface)", border: `1.5px solid ${p.cur ? "var(--accent-pri)" : "var(--border)"}`, borderRadius: "var(--r-3)", padding: 22, boxShadow: p.cur ? "var(--shadow-2)" : "var(--shadow-1)" }}>
      {p.pop && <span style={{ position: "absolute", top: -11, left: 22, padding: "3px 10px", borderRadius: "var(--r-pill)", background: "var(--accent-pri)", color: "#fff", font: "700 10.5px var(--font-sans)", letterSpacing: ".04em" }}>RECOMENDADO</span>}
      <div style={{ font: "700 17px var(--font-sans)" }}>{p.name}</div>
      <div style={{ margin: "10px 0 18px", display: "flex", alignItems: "baseline", gap: 4 }}>
        <span className="mono" style={{ font: "800 30px var(--font-mono)", color: "var(--text)" }}>S/ {p.price}</span>
        <span style={{ font: "400 13px var(--font-sans)", color: "var(--text-mute)" }}>/mes</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
        {p.feats.map(([f, ok], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, font: "400 13px var(--font-sans)", color: ok ? "var(--text)" : "var(--text-mute)" }}>
            <span style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: 999, background: ok ? "var(--success-soft)" : "var(--surface-alt)", color: ok ? "var(--success)" : "var(--text-mute)" }}>
              <Icon name={ok ? "check" : "x"} size={12} />
            </span>{f}
          </div>
        ))}
      </div>
      {p.cur ? <Btn variant="tint" full>Plan actual</Btn> : <Btn variant={p.price > 490 ? "primary" : "soft"} full>{p.price > 490 ? "Cambiar a Business" : "Bajar a Free"}</Btn>}
    </div>
  );
}

function Billing() {
  const [method, setMethod] = useState("mp");
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 80px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, font: "700 28px/1.1 var(--font-sans)", letterSpacing: "-.02em", display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="billing" size={25} color="var(--accent-pri)" /> Planes y facturación
          </h1>
          <p style={{ margin: "7px 0 0", font: "400 15px var(--font-sans)", color: "var(--text-soft)" }}>Workspace <strong style={{ color: "var(--text)" }}>Ventas</strong> · plan <strong style={{ color: "var(--text)" }}>Pro</strong> <span style={{ color: "var(--success)" }}>● activo</span></p>
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--text)", boxShadow: "var(--shadow-1)" }}>
          <span style={{ font: "400 13px var(--font-sans)", color: "var(--text-mute)" }}>Workspace</span>
          <Avatar name="Ventas" size={22} square /><span style={{ font: "600 14px var(--font-sans)" }}>Ventas</span>
          <Icon name="chevronD" size={15} color="var(--text-mute)" />
        </button>
      </div>

      {/* usage */}
      <div style={{ font: "600 15px var(--font-sans)", margin: "28px 0 14px" }}>Uso del plan actual</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <UsageCard label="Miembros" used={18} limit={50} />
        <UsageCard label="Datasets" used={12} limit={50} />
        <UsageCard label="Registros" used={184300} limit={200000} />
      </div>

      {/* plans */}
      <div style={{ font: "600 15px var(--font-sans)", margin: "32px 0 18px" }}>Elegir plan</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {PLANS.map(p => <PlanCard key={p.key} p={p} />)}
      </div>

      {/* payment method */}
      <div style={{ font: "600 15px var(--font-sans)", margin: "32px 0 14px" }}>Método de pago</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {[["mp", "Mercado Pago", "billing", "Pago inmediato con tarjeta o saldo."], ["transfer", "Transferencia bancaria", "upload", "Sube tu comprobante; un admin lo aprueba."]].map(([k, t, ic, d]) => (
          <button key={k} onClick={() => setMethod(k)} style={{ textAlign: "left", display: "flex", gap: 12, padding: 16, borderRadius: "var(--r-3)", border: `1.5px solid ${method === k ? "var(--accent-pri)" : "var(--border)"}`, background: method === k ? "var(--pri-soft)" : "var(--surface)", cursor: "pointer", boxShadow: "var(--shadow-1)" }}>
            <span style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: "var(--r-2)", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--accent-pri)", flex: "none" }}><Icon name={ic} size={19} /></span>
            <span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, font: "600 14px var(--font-sans)", color: "var(--text)" }}>{t} {method === k && <Icon name="check" size={15} color="var(--accent-pri)" />}</span>
              <span style={{ display: "block", font: "400 12.5px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 4 }}>{d}</span>
            </span>
          </button>
        ))}
      </div>
      {method === "transfer" && (
        <div style={{ marginTop: 12, padding: 16, borderRadius: "var(--r-3)", background: "var(--surface-alt)", border: "1px dashed var(--border-strong)", font: "400 13px/1.7 var(--font-sans)", color: "var(--text-soft)" }}>
          <div className="mono" style={{ color: "var(--text)" }}>BCP · 191-2345678-0-90 · OpsGrid SAC</div>
          Referencia: <strong className="mono" style={{ color: "var(--accent-pri)" }}>OG-VENTAS-PRO</strong> · monto <strong className="mono">S/ 490.00</strong>
        </div>
      )}

      {/* admin claim */}
      <div style={{ font: "600 15px var(--font-sans)", margin: "32px 0 14px", display: "flex", alignItems: "center", gap: 8 }}>Avisos de pago <Badge tone="warn">solo admin</Badge></div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: "var(--r-3)", background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-1)", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "500 13px var(--font-sans)" }}><span style={{ width: 8, height: 8, borderRadius: 9, background: "var(--warning)" }} /> Pendiente</span>
        <Avatar name="Ventas" size={24} square /><span style={{ font: "600 13.5px var(--font-sans)" }}>Ventas</span>
        <span style={{ font: "400 13px var(--font-sans)", color: "var(--text-soft)" }}>Pro · <span className="mono">S/ 490</span> · transferencia <span className="mono">#0012</span></span>
        <div style={{ flex: 1 }} />
        <Btn variant="danger" size="sm" icon="x">Rechazar</Btn>
        <Btn variant="primary" size="sm" icon="check">Aprobar</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { Billing });

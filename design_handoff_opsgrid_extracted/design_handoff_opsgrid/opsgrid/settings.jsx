// settings.jsx — Integraciones (API tokens + Webhooks)

const TOKENS = [
  { name: "CI deploy", prefix: "og_live_a3f…", scope: "write", created: "2026-04-12", last: "hace 1 d" },
  { name: "Lectura BI", prefix: "og_live_9c2…", scope: "read", created: "2026-03-01", last: "hace 3 h" },
];
const HOOKS = [
  { url: "https://hooks.empresa.pe/opsgrid", events: ["record.create", "record.update"], status: 200, fails: 0 },
  { url: "https://n8n.empresa.pe/webhook/x", events: ["dataset.create"], status: 500, fails: 3 },
];

function FieldBox({ label, ph, w }) {
  return (
    <label style={{ display: "block", width: w || "100%" }}>
      <div style={{ font: "500 13px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>{label}</div>
      <div style={{ height: 38, padding: "0 12px", display: "flex", alignItems: "center", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", font: "400 14px var(--font-sans)", color: "var(--text-mute)" }}>{ph}</div>
    </label>
  );
}

function Settings() {
  const [pane, setPane] = useState("tokens");
  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 32px 80px" }}>
      <PageHead icon="settings" title="Integraciones" subtitle="Tokens de API personales y webhooks por workspace." />
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24, alignItems: "start" }}>
        {/* side nav */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {[["tokens", "API tokens", "lock"], ["webhooks", "Webhooks", "link"]].map(([k, l, ic]) => (
            <button key={k} onClick={() => setPane(k)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--r-2)", border: "none", cursor: "pointer", textAlign: "left", background: pane === k ? "var(--pri-soft)" : "transparent", color: pane === k ? "var(--accent-pri)" : "var(--text-soft)", font: "600 13.5px var(--font-sans)" }}>
              <Icon name={ic} size={17} />{l}
            </button>
          ))}
        </div>

        {/* panel */}
        {pane === "tokens" ? (
          <div>
            {/* just-created (shown once) */}
            <div style={{ padding: 16, borderRadius: "var(--r-3)", background: "var(--success-soft)", border: "1px solid color-mix(in srgb, var(--success) 32%, transparent)", marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, font: "600 13.5px var(--font-sans)", color: "var(--success)" }}><Icon name="check" size={16} /> Token creado — cópialo ahora, no se vuelve a mostrar</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <code className="mono" style={{ flex: 1, padding: "10px 12px", borderRadius: "var(--r-2)", background: "var(--surface)", border: "1px solid var(--border)", font: "500 13px var(--font-mono)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>og_live_a3f7c9d2e1b4_8k2m5p9q1w3e6r8t</code>
                <Btn variant="soft" size="sm" icon="columns" onClick={() => ogToast("Token copiado")}>Copiar</Btn>
              </div>
            </div>

            {/* create form */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", padding: 18, boxShadow: "var(--shadow-1)", marginBottom: 22 }}>
              <div style={{ font: "600 14px var(--font-sans)", marginBottom: 14 }}>Crear token</div>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                <FieldBox label="Nombre" ph="p.ej. CI deploy" />
                <label style={{ width: 220 }}>
                  <div style={{ font: "500 13px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Permisos</div>
                  <div style={{ display: "flex", padding: 3, borderRadius: "var(--r-2)", background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
                    {["Solo lectura", "Lectura + escritura"].map((o, i) => (
                      <span key={i} style={{ flex: 1, textAlign: "center", font: "600 12px var(--font-sans)", padding: "7px 6px", borderRadius: 6, background: i === 0 ? "var(--surface)" : "transparent", color: i === 0 ? "var(--text)" : "var(--text-soft)", boxShadow: i === 0 ? "var(--shadow-1)" : "none", cursor: "pointer" }}>{o}</span>
                    ))}
                  </div>
                </label>
                <Btn variant="primary" icon="plus" onClick={() => ogToast("Token creado")}>Crear</Btn>
              </div>
            </div>

            {/* list */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 110px 1fr 90px", padding: "10px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", font: "600 12px var(--font-sans)", color: "var(--text-mute)" }}>
                <span>Nombre</span><span>Prefijo</span><span>Permisos</span><span>Último uso</span><span></span>
              </div>
              {TOKENS.map((t, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 110px 1fr 90px", alignItems: "center", padding: "12px 16px", borderBottom: i < TOKENS.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <span style={{ font: "600 13.5px var(--font-sans)" }}>{t.name}</span>
                  <span className="mono" style={{ font: "400 12.5px var(--font-mono)", color: "var(--text-soft)" }}>{t.prefix}</span>
                  <span><Badge tone={t.scope === "write" ? "primary" : "neutral"}>{t.scope === "write" ? "escritura" : "lectura"}</Badge></span>
                  <span style={{ font: "400 12.5px var(--font-mono)", color: "var(--text-mute)" }}>{t.last}</span>
                  <span style={{ textAlign: "right" }}><Btn variant="danger" size="sm" onClick={() => confirmDialog({ title: "Revocar token", message: `El token "${t.name}" dejará de funcionar de inmediato.`, confirmLabel: "Revocar", danger: true, onConfirm: () => ogToast("Token revocado", "danger") })}>Revocar</Btn></span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Badge tone="primary" dot>Pro+</Badge>
              <span style={{ font: "400 13px var(--font-sans)", color: "var(--text-soft)" }}>Los webhooks requieren plan Pro y rol owner/admin_ws.</span>
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", padding: 18, boxShadow: "var(--shadow-1)", marginBottom: 22 }}>
              <div style={{ font: "600 14px var(--font-sans)", marginBottom: 14 }}>Nuevo webhook</div>
              <FieldBox label="URL de destino" ph="https://…" />
              <div style={{ font: "500 13px var(--font-sans)", color: "var(--text-soft)", margin: "14px 0 8px" }}>Eventos</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {["record.create", "record.update", "record.delete", "dataset.create", "dataset.delete"].map((e, i) => (
                  <span key={e} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: "var(--r-pill)", border: `1px solid ${i < 2 ? "color-mix(in srgb, var(--accent-pri) 35%, transparent)" : "var(--border)"}`, background: i < 2 ? "var(--pri-soft)" : "var(--surface)", font: "500 12.5px var(--font-mono)", color: i < 2 ? "var(--accent-pri)" : "var(--text-soft)", cursor: "pointer" }}>
                    {i < 2 && <Icon name="check" size={13} />}{e}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 16 }}><Btn variant="primary" icon="plus" onClick={() => ogToast("Webhook creado")}>Crear webhook</Btn></div>
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
              {HOOKS.map((h, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderBottom: i < HOOKS.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="mono" style={{ display: "block", font: "500 13px var(--font-mono)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.url}</span>
                    <span style={{ display: "flex", gap: 5, marginTop: 6 }}>{h.events.map(e => <span key={e} className="mono" style={{ font: "400 10.5px var(--font-mono)", padding: "2px 6px", borderRadius: 5, background: "var(--surface-alt)", color: "var(--text-soft)" }}>{e}</span>)}</span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "600 12px var(--font-mono)", color: h.status === 200 ? "var(--success)" : "var(--danger)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 9, background: h.status === 200 ? "var(--success)" : "var(--danger)" }} />{h.status}{h.fails > 0 && <span style={{ color: "var(--text-mute)" }}>· {h.fails} fallos</span>}
                  </span>
                  <Btn variant="soft" size="sm" onClick={() => ogToast(`Test enviado · ${h.status}`, h.status === 200 ? "success" : "danger")}>Test</Btn>
                  <Btn variant="danger" size="sm" icon="trash" onClick={() => confirmDialog({ title: "Eliminar webhook", message: "Dejará de recibir eventos.", confirmLabel: "Eliminar", danger: true, onConfirm: () => ogToast("Webhook eliminado", "danger") })}>Eliminar</Btn>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Settings });

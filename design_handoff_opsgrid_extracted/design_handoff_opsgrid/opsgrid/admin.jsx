// admin.jsx — ScriptsHub · AdminWorkspaces · AdminAudit

function PageHead({ icon, title, subtitle, actions }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 22 }}>
      <div>
        <h1 style={{ margin: 0, font: "700 28px/1.1 var(--font-sans)", letterSpacing: "-.02em", display: "flex", alignItems: "center", gap: 10 }}>
          {icon && <Icon name={icon} size={25} color="var(--accent-pri)" />}{title}
        </h1>
        {subtitle && <p style={{ margin: "7px 0 0", font: "400 15px var(--font-sans)", color: "var(--text-soft)" }}>{subtitle}</p>}
      </div>
      <div style={{ display: "flex", gap: 10 }}>{actions}</div>
    </div>
  );
}

// ---------- ScriptsHub ----------
const SCRIPTS = [
  { name: "Ventas por mes", sources: ["Pedidos", "Detalle"], last: "hace 2 h", ok: true },
  { name: "Top productos", sources: ["Detalle", "Producto"], last: "ayer", ok: true },
  { name: "Limpieza clientes", sources: [], last: "—", noSrc: true },
  { name: "Margen por cliente", sources: ["Pedidos", "Clientes"], last: "hace 5 d", ok: true, noCode: true },
];

function ScriptsHub({ onEdit }) {
  const [running, setRunning] = useState(null);
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 80px" }}>
      <PageHead title={<span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "var(--r-2)", background: "var(--calc-soft)", color: "var(--accent-calc)", font: "700 16px var(--font-mono)" }}>ƒ</span>Scripts calculados</span>}
        subtitle="Cada script es su propio dataset Python independiente."
        actions={<Btn variant="primary" icon="plus" onClick={() => onEdit()}>Nuevo script</Btn>} />

      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.4fr 1fr 1fr 150px", padding: "11px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", font: "600 12px var(--font-sans)", color: "var(--text-mute)" }}>
          <span>Script</span><span>Fuentes</span><span>Programación</span><span>Última corrida</span><span style={{ textAlign: "right" }}>Acciones</span>
        </div>
        {SCRIPTS.map((s, i) => {
          const isRun = running === i;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 1.4fr 1fr 1fr 150px", alignItems: "center", padding: "13px 16px", borderBottom: i < SCRIPTS.length - 1 ? "1px solid var(--border)" : "none", opacity: isRun ? .6 : 1 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, background: "var(--calc-soft)", color: "var(--accent-calc)", font: "700 14px var(--font-mono)" }}>ƒ</span>
                <span>
                  <span style={{ display: "block", font: "600 14px var(--font-sans)" }}>{s.name}</span>
                  <span style={{ display: "flex", gap: 5, marginTop: 4 }}>
                    {s.noCode && <Badge tone="warn">sin código</Badge>}
                    {s.noSrc && <Badge tone="danger">sin fuentes</Badge>}
                  </span>
                </span>
              </span>
              <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {s.sources.length ? s.sources.map(src => <Chip key={src} tone="rel">{src}</Chip>) : <span style={{ color: "var(--text-mute)", font: "400 13px var(--font-sans)" }}>—</span>}
              </span>
              <span style={{ font: "400 13px var(--font-sans)", color: "var(--text-soft)" }}>manual</span>
              <span style={{ font: "400 13px var(--font-mono)", color: "var(--text-soft)" }}>{isRun ? "ejecutando…" : s.last}</span>
              <span style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                <button title="Ejecutar" onClick={() => { setRunning(i); setTimeout(() => setRunning(null), 1400); }} className="og-iconbtn" style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--success)" }}><Icon name="scripts" size={16} /></button>
                <button title="Editar" onClick={() => onEdit()} className="og-iconbtn" style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-mute)" }}><Icon name="edit" size={16} /></button>
                <button title="Ver resultados" onClick={() => onEdit()} className="og-iconbtn" style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-mute)" }}><Icon name="arrowR" size={16} /></button>
                <button title="Eliminar" className="og-iconbtn" style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-mute)" }}><Icon name="trash" size={16} /></button>
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12, font: "400 12.5px var(--font-sans)", color: "var(--text-mute)" }}>Ejecutar requiere plan <strong style={{ color: "var(--text-soft)" }}>Pro o superior</strong>.</div>
    </div>
  );
}

// ---------- AdminWorkspaces ----------
const WS_LIST = [
  { name: "Ventas", desc: "Equipo comercial", datasets: 6, members: 8, sandbox: false },
  { name: "Operaciones", desc: "Logística y soporte", datasets: 4, members: 5, sandbox: false },
  { name: "Finanzas", desc: "Cobranzas", datasets: 3, members: 4, sandbox: false },
  { name: "Sandbox demo", desc: "Pruebas", datasets: 4, members: 1, sandbox: true },
];

function AdminWorkspaces() {
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState("datasets");
  const w = WS_LIST[sel];
  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 32px 80px" }}>
      <PageHead icon="workspaces" title="Workspaces" subtitle="Crea y configura los equipos y sus datasets." />
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18, alignItems: "start" }}>
        {/* list */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", boxShadow: "var(--shadow-1)", overflow: "hidden" }}>
          {WS_LIST.map((ws, i) => (
            <button key={i} onClick={() => setSel(i)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 14px", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", background: i === sel ? "var(--pri-soft)" : "transparent", borderLeft: i === sel ? "3px solid var(--accent-pri)" : "3px solid transparent" }}>
              <Avatar name={ws.name} size={30} square />
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", font: "600 13.5px var(--font-sans)", color: "var(--text)" }}>{ws.name}</span>
                <span style={{ display: "block", font: "400 11.5px var(--font-sans)", color: "var(--text-mute)" }}>{ws.datasets} datasets · {ws.members} miembros</span>
              </span>
              {ws.sandbox && <Badge tone="violet">sandbox</Badge>}
            </button>
          ))}
          <button style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "12px 14px", border: "none", background: "transparent", cursor: "pointer", color: "var(--accent-pri)", font: "600 13.5px var(--font-sans)" }}>
            <Icon name="plus" size={16} /> Nuevo workspace
          </button>
        </div>
        {/* panel */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <Avatar name={w.name} size={44} square />
            <div style={{ flex: 1 }}>
              <div style={{ font: "700 20px var(--font-sans)" }}>{w.name}</div>
              <div style={{ font: "400 13px var(--font-sans)", color: "var(--text-soft)" }}>{w.desc}</div>
            </div>
            <Btn variant="soft" size="sm" icon="edit">Editar</Btn>
            <Btn variant="danger" size="sm" icon="trash">Borrar</Btn>
          </div>
          <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: 18 }}>
            {[["datasets", "Datasets"], ["config", "Configuración"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ font: `${tab === k ? 600 : 500} 13.5px var(--font-sans)`, padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", color: tab === k ? "var(--text)" : "var(--text-soft)", borderBottom: tab === k ? "2px solid var(--accent-pri)" : "2px solid transparent", marginBottom: -1 }}>{l}</button>
            ))}
          </div>
          {tab === "datasets" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {["Clientes", "Pedidos", "Detalle", "Producto", "Ventas x mes", "Pedido ↔ Prod"].slice(0, w.datasets).map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: 13, borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
                  <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, background: "var(--pri-soft)", color: "var(--accent-pri)" }}><Icon name="datasets" size={16} /></span>
                  <span style={{ font: "600 13.5px var(--font-sans)" }}>{d}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 460 }}>
              <label><div style={{ font: "500 13px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Nombre</div><div style={{ height: 38, padding: "0 12px", display: "flex", alignItems: "center", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", font: "400 14px var(--font-sans)" }}>{w.name}</div></label>
              <label><div style={{ font: "500 13px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Descripción</div><div style={{ height: 38, padding: "0 12px", display: "flex", alignItems: "center", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", font: "400 14px var(--font-sans)", color: "var(--text-soft)" }}>{w.desc}</div></label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: "var(--r-2)", background: "var(--surface-alt)" }}>
                <Toggle on={w.sandbox} onChange={() => {}} /><span style={{ font: "500 13px var(--font-sans)" }}>Workspace sandbox (pre-puebla 4 plantillas)</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- AdminAudit ----------
const ACTION_TONE = { "CREÓ": "success", "EDITÓ": "primary", "ELIMINÓ": "danger", "INVITÓ": "violet" };
const AUDIT = [
  { when: "hace 5 min", who: "Ana García", act: "EDITÓ", target: "Pedidos · total", change: "980 → 1,240" },
  { when: "hace 12 min", who: "Carlos Mendoza", act: "CREÓ", target: "Clientes", change: "vacío → (nuevo registro)" },
  { when: "14:02", who: "Lucía Paredes", act: "ELIMINÓ", target: "Detalle · fila 88", change: "—" },
  { when: "13:40", who: "Ana García", act: "INVITÓ", target: "diego@empresa.pe", change: "viewer · pendiente" },
  { when: "11:18", who: "Carlos Mendoza", act: "EDITÓ", target: "Producto · precio", change: "45.00 → 52.00" },
  { when: "ayer", who: "Ana García", act: "CREÓ", target: "Ventas x mes", change: "script calculado" },
];

function AdminAudit() {
  const [view, setView] = useState("table");
  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 32px 80px" }}>
      <PageHead icon="audit" title="Registro de auditoría" subtitle="Historial inmutable de cambios · solo admin global."
        actions={<>
          <div style={{ display: "inline-flex", padding: 3, borderRadius: "var(--r-2)", background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
            {[["table", "Tabla", "listV"], ["timeline", "Línea", "audit"]].map(([k, l, ic]) => (
              <button key={k} onClick={() => setView(k)} style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "600 12.5px var(--font-sans)", padding: "7px 11px", borderRadius: 6, border: "none", cursor: "pointer", background: view === k ? "var(--surface)" : "transparent", color: view === k ? "var(--text)" : "var(--text-soft)", boxShadow: view === k ? "var(--shadow-1)" : "none" }}><Icon name={ic} size={14} />{l}</button>
            ))}
          </div>
          <Btn variant="soft" icon="upload">Exportar</Btn>
        </>} />

      {/* filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {["Acción", "Workspace", "Dataset", "Persona"].map(f => (
          <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 11px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", font: "500 12.5px var(--font-sans)", color: "var(--text-soft)", cursor: "pointer" }}>{f} <Icon name="chevronD" size={13} color="var(--text-mute)" /></span>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ font: "400 13px var(--font-mono)", color: "var(--text-mute)" }}>142 eventos</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 6px 5px 10px", borderRadius: "var(--r-pill)", background: "var(--surface-alt)", border: "1px solid var(--border)", font: "500 12px var(--font-sans)" }}>Acción: <strong>Ediciones</strong><button style={{ display: "grid", placeItems: "center", width: 18, height: 18, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-mute)" }}><Icon name="x" size={13} /></button></span>
        <button style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--accent-pri)", font: "600 12px var(--font-sans)" }}>Limpiar todo</button>
      </div>

      {view === "table" ? (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1.2fr 110px 1.4fr 1.4fr", padding: "11px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", font: "600 12px var(--font-sans)", color: "var(--text-mute)" }}>
            <span>Cuándo</span><span>Quién</span><span>Acción</span><span>Objetivo</span><span>Cambio</span>
          </div>
          {AUDIT.map((a, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1.2fr 110px 1.4fr 1.4fr", alignItems: "center", padding: "12px 16px", borderBottom: i < AUDIT.length - 1 ? "1px solid var(--border)" : "none", font: "400 13px var(--font-sans)" }}>
              <span style={{ color: "var(--text-mute)", font: "400 12.5px var(--font-mono)" }}>{a.when}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar name={a.who} size={24} /><span style={{ font: "500 13px var(--font-sans)" }}>{a.who}</span></span>
              <span><Badge tone={ACTION_TONE[a.act]}>{a.act}</Badge></span>
              <span className="mono" style={{ font: "400 12.5px var(--font-mono)", color: "var(--text)" }}>{a.target}</span>
              <span style={{ color: "var(--text-soft)", font: "400 12.5px var(--font-mono)" }}>{a.change}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 28 }}>
          <div style={{ position: "absolute", left: 9, top: 6, bottom: 6, width: 2, background: "var(--border)" }} />
          {AUDIT.map((a, i) => (
            <div key={i} style={{ position: "relative", marginBottom: 20 }}>
              <span style={{ position: "absolute", left: -26, top: 4, width: 12, height: 12, borderRadius: 999, background: `var(--${ACTION_TONE[a.act] === "primary" ? "accent-pri" : ACTION_TONE[a.act] === "violet" ? "violet" : ACTION_TONE[a.act]})`, border: "2px solid var(--surface)", boxShadow: "0 0 0 1px var(--border)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Avatar name={a.who} size={22} /><span style={{ font: "600 13px var(--font-sans)" }}>{a.who}</span>
                <Badge tone={ACTION_TONE[a.act]}>{a.act}</Badge>
                <span className="mono" style={{ font: "400 12.5px var(--font-mono)", color: "var(--text)" }}>{a.target}</span>
                <span style={{ font: "400 12px var(--font-mono)", color: "var(--text-mute)" }}>· {a.when}</span>
              </div>
              <div style={{ font: "400 12.5px var(--font-mono)", color: "var(--text-soft)", marginTop: 4 }}>{a.change}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ScriptsHub, AdminWorkspaces, AdminAudit, PageHead });

// modals.jsx — modal system: shell, host, toasts, confirm + product modals.
// useState/useEffect/useRef are global (declared in shell.jsx classic script scope).

// ---------- imperative API (global) ----------
function openModal(name, props) { if (window.__ogOpen) window.__ogOpen(name, props || {}); }
function closeModal() { if (window.__ogClose) window.__ogClose(); }
function ogToast(msg, tone) { if (window.__ogToast) window.__ogToast(msg, tone || "success"); }
function confirmDialog(opts) { if (window.__ogConfirm) window.__ogConfirm(opts); }

// ---------- shell ----------
function Modal({ title, sub, icon, iconTone, size = 560, onClose, children, footer }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h);
  }, []);
  const [fg, bg] = (window.TONE && window.TONE[iconTone || "primary"]) || ["var(--accent-pri)", "var(--pri-soft)"];
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--overlay)", display: "grid", placeItems: "center", padding: 24, animation: "ogFade var(--t-mid)" }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: size, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-4)", boxShadow: "var(--shadow-4)", animation: "ogPop var(--t-slow)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          {icon && <span style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: "var(--r-2)", background: bg, color: fg, flex: "none" }}><Icon name={icon} size={20} /></span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>{title}</div>
            {sub && <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3 }}>{sub}</div>}
          </div>
          <button onClick={onClose} className="og-iconbtn" style={{ width: 32, height: 32, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", color: "var(--text-mute)" }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 20, overflow: "auto" }}>{children}</div>
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>{footer}</div>}
      </div>
    </div>
  );
}

function SlideOver({ title, sub, icon, onClose, children }) {
  useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }, []);
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--overlay)", animation: "ogFade var(--t-mid)" }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "92vw", display: "flex", flexDirection: "column", background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "var(--shadow-4)", animation: "ogSlide var(--t-slow)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          {icon && <Icon name={icon} size={19} color="var(--accent-pri)" />}
          <div style={{ flex: 1 }}><div style={{ font: "700 16px var(--font-sans)" }}>{title}</div>{sub && <div style={{ font: "400 12.5px var(--font-sans)", color: "var(--text-soft)" }}>{sub}</div>}</div>
          <button onClick={onClose} className="og-iconbtn" style={{ width: 32, height: 32, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", color: "var(--text-mute)" }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 20, overflow: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// reusable labeled input
function MField({ label, ph, value, mono, type, w, onChange }) {
  return (
    <label style={{ display: "block", width: w || "100%" }}>
      <div style={{ font: "500 12.5px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>{label}</div>
      <input type={type || "text"} defaultValue={value} placeholder={ph} onChange={(e) => onChange && onChange(e.target.value)}
        style={{ width: "100%", height: 38, padding: "0 11px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", font: `400 13.5px ${mono ? "var(--font-mono)" : "var(--font-sans)"}`, outline: "none" }} />
    </label>
  );
}

function Stepper({ steps, active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
      {steps.map((s, i) => {
        const on = i === active, done = i < active;
        return (
          <React.Fragment key={i}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: `${on ? 600 : 500} 12.5px var(--font-sans)`, color: on ? "var(--text)" : "var(--text-mute)", whiteSpace: "nowrap" }}>
              <span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 999, background: on || done ? "var(--accent-pri)" : "var(--surface-alt)", color: on || done ? "#fff" : "var(--text-mute)", font: "700 11px var(--font-sans)" }}>{done ? "✓" : i + 1}</span>{s}
            </span>
            {i < steps.length - 1 && <span style={{ flex: 1, height: 2, minWidth: 16, background: "var(--border)" }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------- ImportExcelModal ----------
function ImportExcelModal({ onClose }) {
  const [step, setStep] = useState(0);
  const STEPS = ["Subir", "Vista previa", "Mapear", "Confirmar"];
  const sheets = [
    { name: "Clientes", on: true, ds: "Clientes", rows: 100, cols: 7 },
    { name: "Pedidos", on: true, ds: "Pedidos", rows: 120, cols: 6 },
    { name: "Hoja3", on: false, empty: true },
  ];
  return (
    <Modal title="Importar Excel" sub="Convierte tus hojas en datasets relacionados" icon="upload" size={620} onClose={onClose}
      footer={<>
        {step > 0 && <Btn variant="ghost" onClick={() => setStep(s => s - 1)}>Atrás</Btn>}
        {step < 3 ? <Btn variant="primary" iconR="arrowR" onClick={() => setStep(s => s + 1)}>Continuar</Btn>
          : <Btn variant="primary" icon="check" onClick={() => { onClose(); ogToast("2 datasets importados · 220 filas"); }}>Importar todo</Btn>}
      </>}>
      <Stepper steps={STEPS} active={step} />
      {step === 0 && (
        <div style={{ border: "2px dashed var(--border-strong)", borderRadius: "var(--r-3)", padding: "32px 20px", textAlign: "center" }}>
          <span style={{ display: "grid", placeItems: "center", width: 48, height: 48, margin: "0 auto 12px", borderRadius: "var(--r-3)", background: "var(--pri-soft)", color: "var(--accent-pri)" }}><Icon name="upload" size={22} /></span>
          <div style={{ font: "600 14.5px var(--font-sans)" }}>ventas_2026.xlsx</div>
          <div style={{ font: "400 12.5px var(--font-sans)", color: "var(--text-mute)", marginTop: 4 }}>3 hojas detectadas · 1.4 MB · listo para previsualizar</div>
        </div>
      )}
      {(step === 1 || step === 2) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sheets.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: s.empty ? "var(--surface-2)" : "var(--surface)", opacity: s.empty ? .6 : 1 }}>
              <input type="checkbox" defaultChecked={s.on} disabled={s.empty} style={{ accentColor: "var(--accent-pri)", width: 15, height: 15 }} />
              <span style={{ font: "600 13.5px var(--font-sans)", width: 90 }}>{s.name}</span>
              {s.empty ? <span style={{ font: "400 12.5px var(--font-sans)", color: "var(--text-mute)" }}>vacía · se omite</span> : (
                <>
                  <Icon name="arrowR" size={15} color="var(--text-mute)" />
                  <span style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, height: 34, padding: "0 11px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface-2)", font: "500 13px var(--font-sans)" }}>
                    <Icon name="datasets" size={14} color="var(--accent-pri)" /> {s.ds}
                  </span>
                  <span style={{ font: "400 12px var(--font-mono)", color: "var(--text-mute)" }}>{s.rows} filas · {s.cols} col</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {step === 3 && (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {[["Clientes", "100 filas · 7 columnas"], ["Pedidos", "120 filas · 6 columnas"]].map(([n, d], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: "var(--r-2)", background: "var(--success-soft)", border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)" }}>
                <Icon name="check" size={16} color="var(--success)" /><span style={{ font: "600 13.5px var(--font-sans)" }}>{n}</span><span style={{ font: "400 12.5px var(--font-mono)", color: "var(--text-soft)" }}>{d}</span>
              </div>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 9, font: "400 13px var(--font-sans)", color: "var(--text-soft)" }}>
            <input type="checkbox" style={{ accentColor: "var(--accent-pri)", width: 15, height: 15 }} /> Dedupe por columna clave (omite filas duplicadas)
          </label>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, font: "400 12px var(--font-sans)", color: "var(--text-mute)" }}>
        <Icon name="lock" size={14} /> Cifrado en tránsito y reposo · lo eliminamos al confirmar.
      </div>
    </Modal>
  );
}

// ---------- RelationScanModal ----------
const SCAN = [
  { from: "Pedidos", col: "cliente", to: "Clientes", match: "contenido 98%", score: 0.98, strong: true },
  { from: "Detalle", col: "producto", to: "Producto", match: "contenido 91%", score: 0.91, strong: true },
  { from: "Detalle", col: "pedido", to: "Pedidos", match: "contenido 87%", score: 0.87, strong: true },
  { from: "Pedidos", col: "vendedor", to: "Empleado", match: "solo nombre · sin datos", score: 0.05 },
];
const CLEANUP = [
  { col: "Clientes · ciudad", variants: ["Lima", "LIMA", "lima"], canon: "Lima" },
  { col: "Pedidos · estado", variants: ["pagado", "Pagado", "PAGADO"], canon: "pagado" },
  { col: "Producto · categoria", variants: ["Bebidas", "bebida"], canon: "Bebidas" },
];
function RelationScanModal({ onClose }) {
  const [tab, setTab] = useState("rel");
  return (
    <Modal title="Detectar relaciones" sub="El contenido manda: score = 0.85 × contenido + 0.15 × nombre" icon="sparkles" iconTone="rel" size={680} onClose={onClose}
      footer={<><Btn variant="ghost" icon="sparkles" onClick={() => ogToast("Re-escaneando datasets…", "warn")}>Re-escanear</Btn><Btn variant="primary" icon="check" onClick={() => { onClose(); ogToast("Relaciones aplicadas"); }}>Aplicar seleccionadas</Btn></>}>
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {[["rel", `Relaciones (${SCAN.length})`], ["clean", `Limpieza sugerida (${CLEANUP.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ font: `${tab === k ? 600 : 500} 13px var(--font-sans)`, padding: "9px 13px", border: "none", background: "transparent", cursor: "pointer", color: tab === k ? "var(--text)" : "var(--text-soft)", borderBottom: tab === k ? "2px solid var(--accent-rel)" : "2px solid transparent", marginBottom: -1 }}>{l}</button>
        ))}
      </div>
      {tab === "rel" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {SCAN.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, flexWrap: "wrap" }}>
                <Chip tone="rel">{s.from}</Chip>
                <span className="mono" style={{ font: "400 11.5px var(--font-mono)", color: "var(--text-mute)" }}>.{s.col}</span>
                <Icon name="arrowR" size={14} color="var(--text-mute)" />
                <Chip tone="primary">{s.to}</Chip>
              </span>
              <span style={{ font: "400 11.5px var(--font-sans)", color: s.strong ? "var(--text-soft)" : "var(--warning)", width: 130, textAlign: "right" }}>{s.match}</span>
              <span className="mono" style={{ font: "700 13px var(--font-mono)", color: s.strong ? "var(--success)" : "var(--text-mute)", width: 40, textAlign: "right" }}>{s.score.toFixed(2)}</span>
              <Btn variant={s.strong ? "primary" : "soft"} size="sm" onClick={() => ogToast(`Relación ${s.from}→${s.to} aplicada`)}>Aplicar</Btn>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {CLEANUP.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)" }}>
              <span style={{ flex: 1 }}>
                <span className="mono" style={{ display: "block", font: "500 12.5px var(--font-mono)", color: "var(--text)" }}>{c.col}</span>
                <span style={{ display: "flex", gap: 5, marginTop: 6 }}>{c.variants.map(v => <span key={v} className="mono" style={{ font: "400 10.5px var(--font-mono)", padding: "2px 6px", borderRadius: 5, background: "var(--warning-soft)", color: "var(--warning)" }}>{v}</span>)}</span>
              </span>
              <span style={{ font: "400 12px var(--font-sans)", color: "var(--text-mute)" }}>unificar como</span>
              <Chip tone="success">{c.canon}</Chip>
              <Btn variant="soft" size="sm" onClick={() => ogToast(`Valores unificados como "${c.canon}"`)}>Unificar</Btn>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------- AddColumnModal (type-aware) ----------
const COL_TYPES = ["text", "long_text", "number", "currency", "percent", "rating", "date", "enum", "multiselect", "boolean", "email", "phone", "url", "relation"];
function AddColumnModal({ onClose }) {
  const [type, setType] = useState("text");
  const [req, setReq] = useState(false);
  const [uniq, setUniq] = useState(false);
  const [opts, setOpts] = useState(["Opción A", "Opción B"]);
  return (
    <Modal title="Nueva columna" sub="Configura el tipo y sus reglas de validación" icon="columns" size={540} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="primary" icon="check" onClick={() => { onClose(); ogToast("Columna creada"); }}>Crear columna</Btn></>}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <MField label="Nombre" value="Prioridad" />
        <MField label="field_key (auto)" value="prioridad" mono />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ font: "500 12.5px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Tipo</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {COL_TYPES.map(t => (
            <button key={t} onClick={() => setType(t)} className="mono" style={{ font: "500 12px var(--font-mono)", padding: "6px 10px", borderRadius: "var(--r-pill)", cursor: "pointer", border: `1px solid ${type === t ? (t === "relation" ? "var(--accent-rel)" : "var(--accent-pri)") : "var(--border)"}`, background: type === t ? (t === "relation" ? "var(--rel-soft)" : "var(--pri-soft)") : "var(--surface)", color: type === t ? (t === "relation" ? "var(--accent-rel)" : "var(--accent-pri)") : "var(--text-soft)" }}>{t}</button>
          ))}
        </div>
      </div>
      {/* type-specific */}
      {(type === "enum" || type === "multiselect") && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: "var(--r-2)", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div style={{ font: "600 12.5px var(--font-sans)", marginBottom: 10 }}>Opciones</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {opts.map((o, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input defaultValue={o} style={{ flex: 1, height: 34, padding: "0 10px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", font: "400 13px var(--font-sans)", outline: "none" }} />
                <button onClick={() => setOpts(os => os.filter((_, j) => j !== i))} className="og-iconbtn" style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-mute)" }}><Icon name="x" size={15} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setOpts(os => [...os, "Nueva opción"])} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, border: "none", background: "transparent", cursor: "pointer", color: "var(--accent-pri)", font: "600 12.5px var(--font-sans)" }}><Icon name="plus" size={14} /> Añadir opción</button>
        </div>
      )}
      {type === "currency" && <div style={{ marginBottom: 16 }}><MField label="Símbolo de moneda" value="S/" w={140} /></div>}
      {type === "rating" && <div style={{ marginBottom: 16 }}><MField label="Máx. estrellas" value="5" type="number" w={140} mono /></div>}
      {type === "relation" && (
        <div style={{ marginBottom: 16, display: "flex", gap: 12, padding: 14, borderRadius: "var(--r-2)", background: "var(--rel-soft)", border: "1px solid color-mix(in srgb, var(--accent-rel) 30%, transparent)" }}>
          <MField label="Dataset relacionado" value="Clientes" />
          <MField label="Campo a mostrar" value="nombre" mono />
        </div>
      )}
      {(type === "text" || type === "long_text") && <div style={{ marginBottom: 16 }}><MField label="Regex (opcional)" ph="^[A-Z]{3}-\\d+$" mono /></div>}
      {/* rules */}
      <div style={{ display: "flex", gap: 20, paddingTop: 4 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}><Toggle on={req} onChange={setReq} size={0.85} /><span style={{ font: "500 13px var(--font-sans)" }}>Requerido</span></label>
        {type !== "boolean" && type !== "relation" && <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}><Toggle on={uniq} onChange={setUniq} size={0.85} /><span style={{ font: "500 13px var(--font-sans)" }}>Único</span></label>}
      </div>
    </Modal>
  );
}

// ---------- DatasetAccessModal (direct user permissions) ----------
const ACC_ROLES = [["none", "Sin acceso"], ["view", "Ver"], ["edit", "Editar"], ["admin", "Admin"]];
const ACC_C = { none: "var(--text-mute)", view: "var(--accent-pri)", edit: "var(--success)", admin: "var(--violet)" };
const ACC_USERS = [
  { name: "Ana García", email: "ana@empresa.pe", role: "admin", source: "directo", lock: true },
  { name: "Carlos Mendoza", email: "carlos@empresa.pe", role: "edit", source: "grupo" },
  { name: "Lucía Paredes", email: "lucia@empresa.pe", role: "view", source: "workspace" },
  { name: "Diego Ríos", email: "diego@empresa.pe", role: "none", source: "directo" },
];
function RoleSeg({ value, onChange, lock }) {
  return (
    <span style={{ display: "inline-flex", borderRadius: "var(--r-2)", border: "1px solid var(--border)", overflow: "hidden", opacity: lock ? .7 : 1 }}>
      {ACC_ROLES.map(([k, l], i) => {
        const on = value === k;
        return <button key={k} disabled={lock} onClick={() => onChange(k)} style={{ font: "600 11.5px var(--font-sans)", padding: "5px 9px", border: "none", borderLeft: i ? "1px solid var(--border)" : "none", cursor: lock ? "not-allowed" : "pointer", background: on ? ACC_C[k] : "var(--surface)", color: on ? "#fff" : "var(--text-soft)", whiteSpace: "nowrap" }}>{l}</button>;
      })}
    </span>
  );
}
function DatasetAccessModal({ onClose }) {
  const [users, setUsers] = useState(ACC_USERS);
  const setRole = (i, r) => setUsers(us => us.map((u, j) => j === i ? { ...u, role: r, source: "directo" } : u));
  return (
    <Modal title="Accesos directos · Pedidos" sub="Prioridad: directo › grupo › workspace › rol global" icon="lock" iconTone="violet" size={680} onClose={onClose}
      footer={<><Btn variant="soft" icon="plus" onClick={() => openModal("inviteUser")}>Invitar usuario</Btn><Btn variant="primary" icon="check" onClick={() => { onClose(); ogToast("Permisos guardados"); }}>Guardar</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {users.map((u, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 6px", borderBottom: i < users.length - 1 ? "1px solid var(--border)" : "none" }}>
            <Avatar name={u.name} size={34} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", font: "600 13.5px var(--font-sans)" }}>{u.name}</span>
              <span style={{ display: "block", font: "400 12px var(--font-mono)", color: "var(--text-mute)" }}>{u.email}</span>
            </span>
            <Badge tone={u.source === "directo" ? "rel" : "neutral"}>{u.source}</Badge>
            <RoleSeg value={u.role} onChange={(r) => setRole(i, r)} lock={u.lock} />
            {u.lock && <Icon name="lock" size={14} color="var(--text-mute)" />}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 14, font: "400 12px var(--font-sans)", color: "var(--text-mute)" }}>
        <Icon name="lock" size={13} /> No puedes quitar el rol al único admin del dataset.
      </div>
    </Modal>
  );
}

// ---------- InviteUserModal ----------
function InviteUserModal({ onClose }) {
  const [sent, setSent] = useState(false);
  return (
    <Modal title="Invitar usuario" sub="Genera un link de un solo uso para activar la cuenta" icon="people" size={500} onClose={onClose}
      footer={sent ? <Btn variant="primary" icon="check" onClick={onClose}>Listo</Btn> : <><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="primary" icon="arrowR" onClick={() => setSent(true)}>Generar invitación</Btn></>}>
      {!sent ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <MField label="Email" ph="persona@empresa.pe" type="email" />
          <MField label="Usuario (opcional)" ph="nombre.apellido" />
          <div>
            <div style={{ font: "500 12.5px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Rol en el workspace</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["member", "admin_ws", "owner"].map((r, i) => (
                <span key={r} style={{ flex: 1, textAlign: "center", font: "600 12.5px var(--font-sans)", padding: "9px", borderRadius: "var(--r-2)", border: `1px solid ${i === 0 ? "var(--accent-pri)" : "var(--border)"}`, background: i === 0 ? "var(--pri-soft)" : "var(--surface)", color: i === 0 ? "var(--accent-pri)" : "var(--text-soft)", cursor: "pointer" }}>{r}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 16, borderRadius: "var(--r-3)", background: "var(--success-soft)", border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, font: "600 13.5px var(--font-sans)", color: "var(--success)" }}><Icon name="check" size={16} /> Invitación creada</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <code className="mono" style={{ flex: 1, padding: "10px 12px", borderRadius: "var(--r-2)", background: "var(--surface)", border: "1px solid var(--border)", font: "500 12px var(--font-mono)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>opsgrid.app/set-password?t=8f3a…d21</code>
            <Btn variant="soft" size="sm" icon="columns" onClick={() => ogToast("Link copiado")}>Copiar</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- RecordHistoryPanel (slide-over) ----------
const HISTORY = [
  { field: "total", from: "980", to: "1,240", who: "Ana García", when: "hace 5 min", act: "EDITÓ" },
  { field: "estado", from: "pendiente", to: "pagado", who: "Carlos Mendoza", when: "hace 2 h", act: "EDITÓ" },
  { field: "cliente", from: "—", to: "Ana García", who: "Ana García", when: "ayer", act: "EDITÓ" },
  { field: "(registro)", from: "vacío", to: "creado", who: "Ana García", when: "12 may", act: "CREÓ" },
];
function RecordHistoryPanel({ onClose }) {
  return (
    <SlideOver title="Historial · PED-0001" sub="Cada cambio queda registrado" icon="history" onClose={onClose}>
      <div style={{ position: "relative", paddingLeft: 26 }}>
        <div style={{ position: "absolute", left: 8, top: 6, bottom: 6, width: 2, background: "var(--border)" }} />
        {HISTORY.map((h, i) => (
          <div key={i} style={{ position: "relative", marginBottom: 22 }}>
            <span style={{ position: "absolute", left: -24, top: 3, width: 11, height: 11, borderRadius: 999, background: h.act === "CREÓ" ? "var(--success)" : "var(--accent-pri)", border: "2px solid var(--surface)", boxShadow: "0 0 0 1px var(--border)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <Badge tone={h.act === "CREÓ" ? "success" : "primary"}>{h.act}</Badge>
              <span className="mono" style={{ font: "500 12.5px var(--font-mono)", color: "var(--text)" }}>{h.field}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, font: "400 12.5px var(--font-mono)" }}>
              <span style={{ padding: "2px 7px", borderRadius: 5, background: "var(--danger-soft)", color: "var(--danger)" }}>{h.from}</span>
              <Icon name="arrowR" size={13} color="var(--text-mute)" />
              <span style={{ padding: "2px 7px", borderRadius: 5, background: "var(--success-soft)", color: "var(--success)" }}>{h.to}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8 }}>
              <Avatar name={h.who} size={20} /><span style={{ font: "400 12px var(--font-sans)", color: "var(--text-soft)" }}>{h.who} · {h.when}</span>
            </div>
          </div>
        ))}
      </div>
    </SlideOver>
  );
}

// ---------- ConfirmDialog + Toasts ----------
function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }) {
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 220, background: "var(--overlay)", display: "grid", placeItems: "center", padding: 24, animation: "ogFade var(--t-mid)" }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-4)", boxShadow: "var(--shadow-4)", padding: 22, animation: "ogPop var(--t-slow)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
          <span style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: "var(--r-2)", background: danger ? "var(--danger-soft)" : "var(--pri-soft)", color: danger ? "var(--danger)" : "var(--accent-pri)" }}><Icon name={danger ? "trash" : "bell"} size={19} /></span>
          <div style={{ font: "700 16px var(--font-sans)" }}>{title}</div>
        </div>
        <p style={{ margin: "0 0 18px", font: "400 13.5px/1.5 var(--font-sans)", color: "var(--text-soft)" }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant={danger ? "primary" : "primary"} icon={danger ? "trash" : "check"} onClick={() => { onClose(); onConfirm && onConfirm(); }} style={danger ? { background: "var(--danger)" } : {}}>{confirmLabel || "Confirmar"}</Btn>
        </div>
      </div>
    </div>
  );
}

function ToastStack({ toasts }) {
  const C = { success: "var(--success)", warn: "var(--warning)", danger: "var(--danger)", info: "var(--accent-pri)" };
  return (
    <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 240, display: "flex", flexDirection: "column", gap: 10 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 15px", minWidth: 240, maxWidth: 360, borderRadius: "var(--r-3)", background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-3)", animation: "ogSlide var(--t-slow)" }}>
          <span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 999, background: C[t.tone] || C.success, color: "#fff", flex: "none" }}><Icon name={t.tone === "danger" ? "x" : "check"} size={13} /></span>
          <span style={{ font: "500 13px var(--font-sans)", color: "var(--text)" }}>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- EditColumnModal ----------
function EditColumnModal({ onClose }) {
  const [req, setReq] = useState(true);
  return (
    <Modal title="Editar columna · cliente" sub="Columna de tipo relación (solo lectura en la grilla)" icon="link" iconTone="rel" size={540} onClose={onClose}
      footer={<><Btn variant="danger" icon="trash" onClick={() => { onClose(); confirmDialog({ title: "Eliminar columna", message: "Se borrará 'cliente' y sus valores en todas las filas.", confirmLabel: "Eliminar", danger: true, onConfirm: () => ogToast("Columna eliminada", "danger") }); }} style={{ marginRight: "auto" }}>Eliminar</Btn><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="primary" icon="check" onClick={() => { onClose(); ogToast("Columna actualizada"); }}>Guardar</Btn></>}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <MField label="Nombre" value="cliente" />
        <MField label="field_key" value="cliente" mono />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, padding: 14, borderRadius: "var(--r-2)", background: "var(--rel-soft)", border: "1px solid color-mix(in srgb, var(--accent-rel) 30%, transparent)" }}>
        <MField label="Dataset relacionado" value="Clientes" />
        <MField label="Campo a mostrar" value="nombre" mono />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}><Toggle on={req} onChange={setReq} size={0.85} /><span style={{ font: "500 13px var(--font-sans)" }}>Requerido</span></label>
    </Modal>
  );
}

// ---------- ConditionalFormattingModal ----------
const CF_COLORS = ["var(--success)", "var(--warning)", "var(--danger)", "var(--accent-pri)", "var(--accent-calc)"];
function ConditionalFormattingModal({ onClose }) {
  const [rules, setRules] = useState([
    { col: "total", op: "mayor que", val: "2000", color: 0 },
    { col: "estado", op: "es", val: "anulado", color: 2 },
  ]);
  const upd = (i, p) => setRules(rs => rs.map((r, j) => j === i ? { ...r, ...p } : r));
  const sel = "height:34px;border-radius:var(--r-2);border:1px solid var(--border);background:var(--surface);color:var(--text);font:500 12.5px var(--font-sans);padding:0 9px;outline:none";
  return (
    <Modal title="Formato condicional" sub="Colorea filas o celdas según reglas" icon="sparkles" size={620} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="primary" icon="check" onClick={() => { onClose(); ogToast("Formato aplicado"); }}>Aplicar</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rules.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <span style={{ font: "500 12px var(--font-sans)", color: "var(--text-mute)" }}>Si</span>
            <select defaultValue={r.col} onChange={(e) => upd(i, { col: e.target.value })} style={{ width: 104, height: 34, borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", font: "500 12.5px var(--font-sans)", padding: "0 8px", outline: "none" }}>
              {["total", "estado", "fecha", "margen"].map(c => <option key={c}>{c}</option>)}
            </select>
            <select defaultValue={r.op} style={{ width: 116, height: 34, borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", font: "500 12.5px var(--font-sans)", padding: "0 8px", outline: "none" }}>
              {["es", "no es", "mayor que", "menor que", "contiene"].map(o => <option key={o}>{o}</option>)}
            </select>
            <input defaultValue={r.val} style={{ flex: 1, height: 34, borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", font: "400 13px var(--font-mono)", padding: "0 10px", outline: "none" }} />
            <span style={{ display: "flex", gap: 4 }}>{CF_COLORS.map((c, ci) => (
              <button key={ci} onClick={() => upd(i, { color: ci })} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: r.color === ci ? "2px solid var(--text)" : "2px solid transparent", cursor: "pointer" }} />
            ))}</span>
            <button onClick={() => setRules(rs => rs.filter((_, j) => j !== i))} className="og-iconbtn" style={{ width: 28, height: 28, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-mute)" }}><Icon name="x" size={15} /></button>
          </div>
        ))}
      </div>
      <button onClick={() => setRules(rs => [...rs, { col: "total", op: "es", val: "", color: 3 }])} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, border: "none", background: "transparent", cursor: "pointer", color: "var(--accent-pri)", font: "600 12.5px var(--font-sans)" }}><Icon name="plus" size={14} /> Añadir regla</button>
    </Modal>
  );
}

// ---------- SearchReplaceModal ----------
function SearchReplaceModal({ onClose }) {
  return (
    <Modal title="Buscar y reemplazar" sub="En toda la tabla o una columna" icon="search" size={500} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cerrar</Btn><Btn variant="soft" onClick={() => ogToast("1 valor reemplazado")}>Reemplazar</Btn><Btn variant="primary" icon="check" onClick={() => { onClose(); ogToast("8 valores reemplazados"); }}>Reemplazar todo</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <MField label="Buscar" value="pendiente" mono />
        <MField label="Reemplazar con" value="en proceso" mono />
        <div>
          <div style={{ font: "500 12.5px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Ámbito</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["Toda la tabla", "Columna: estado"].map((o, i) => (
              <span key={o} style={{ flex: 1, textAlign: "center", font: "600 12.5px var(--font-sans)", padding: "9px", borderRadius: "var(--r-2)", border: `1px solid ${i === 0 ? "var(--accent-pri)" : "var(--border)"}`, background: i === 0 ? "var(--pri-soft)" : "var(--surface)", color: i === 0 ? "var(--accent-pri)" : "var(--text-soft)", cursor: "pointer" }}>{o}</span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, font: "400 12.5px var(--font-sans)", color: "var(--text-soft)" }}><Icon name="check" size={14} color="var(--success)" /> <strong className="mono" style={{ color: "var(--text)" }}>8</strong> coincidencias en la columna estado</div>
      </div>
    </Modal>
  );
}

// ---------- SchemaDiagramModal ----------
function SchemaDiagramModal({ onClose }) {
  const nodes = [
    { id: "cli", label: "Clientes", x: 40, y: 60, k: "pri" },
    { id: "ped", label: "Pedidos", x: 260, y: 60, k: "rel" },
    { id: "det", label: "Detalle", x: 260, y: 190, k: "rel" },
    { id: "prd", label: "Producto", x: 480, y: 190, k: "pri" },
    { id: "vxm", label: "Ventas x mes", x: 40, y: 190, k: "calc" },
  ];
  const col = (k) => k === "rel" ? "var(--accent-rel)" : k === "calc" ? "var(--accent-calc)" : "var(--accent-pri)";
  const soft = (k) => k === "rel" ? "var(--rel-soft)" : k === "calc" ? "var(--calc-soft)" : "var(--pri-soft)";
  const NW = 150, NH = 46;
  return (
    <Modal title="Diagrama de esquema" sub="Relaciones entre todos los datasets del workspace" icon="diagram" iconTone="rel" size={720} onClose={onClose}
      footer={<Btn variant="primary" icon="check" onClick={onClose}>Cerrar</Btn>}>
      <div style={{ background: "var(--surface-2)", borderRadius: "var(--r-3)", border: "1px solid var(--border)", padding: 16, overflowX: "auto" }}>
        <svg width="660" height="280" style={{ display: "block" }}>
          <path d="M190 83 C 230 83 220 83 260 83" fill="none" stroke="var(--accent-rel)" strokeWidth="2" />
          <path d="M335 106 C 335 148 335 148 335 190" fill="none" stroke="var(--accent-rel)" strokeWidth="2" />
          <path d="M410 213 C 450 213 440 213 480 213" fill="none" stroke="var(--accent-rel)" strokeWidth="2" />
          <path d="M115 160 C 160 160 215 130 260 100" fill="none" stroke="var(--accent-calc)" strokeWidth="1.6" strokeDasharray="4 4" />
          {[[260,83],[335,190],[480,213]].map(([x,y],i)=>(<circle key={i} cx={x} cy={y} r="3.5" fill="var(--accent-rel)" />))}
          <text x="212" y="75" fontFamily="var(--font-mono)" fontSize="10" fill="var(--accent-rel)">1:N</text>
          <text x="341" y="150" fontFamily="var(--font-mono)" fontSize="10" fill="var(--accent-rel)">N:N</text>
          {nodes.map(n => (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={NW} height={NH} rx="10" fill={soft(n.k)} stroke={col(n.k)} strokeWidth="1.5" />
              <text x={n.x + 16} y={n.y + 21} fontFamily="var(--font-sans)" fontWeight="600" fontSize="13.5" fill="var(--text)">{n.label}</text>
              <text x={n.x + 16} y={n.y + 36} fontFamily="var(--font-mono)" fontSize="10" fill="var(--text-mute)">{n.k === "calc" ? "ƒ calculado" : n.k === "rel" ? "con relaciones" : "tabla"}</text>
            </g>
          ))}
        </svg>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
        {[["var(--accent-pri)", "tabla"], ["var(--accent-rel)", "relación"], ["var(--accent-calc)", "calculada"]].map(([c, l]) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "500 12.5px var(--font-sans)", color: "var(--text-soft)" }}><span style={{ width: 12, height: 12, borderRadius: 4, background: c }} />{l}</span>
        ))}
      </div>
    </Modal>
  );
}

// ---------- CsvMappingModal ----------
function CsvMappingModal({ onClose }) {
  const cols = [
    { csv: "Codigo Pedido", to: "codigo", type: "text" },
    { csv: "Cliente", to: "cliente", type: "relation" },
    { csv: "Fecha Emision", to: "fecha", type: "date" },
    { csv: "Monto Total", to: "total", type: "currency" },
    { csv: "Estado", to: "estado", type: "enum" },
    { csv: "Notas", to: "— ignorar —", type: "skip" },
  ];
  return (
    <Modal title="Mapear columnas del CSV" sub="pedidos_mayo.csv · 6 columnas · 138 filas" icon="columns" size={600} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="primary" icon="check" onClick={() => { onClose(); ogToast("138 filas importadas · 2 duplicadas omitidas"); }}>Importar</Btn></>}>
      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-2)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", padding: "9px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", font: "600 11.5px var(--font-sans)", color: "var(--text-mute)" }}>
          <span>Columna del CSV</span><span></span><span>Campo del dataset</span>
        </div>
        {cols.map((c, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", alignItems: "center", padding: "9px 12px", borderBottom: i < cols.length - 1 ? "1px solid var(--border)" : "none", opacity: c.type === "skip" ? .55 : 1 }}>
            <span className="mono" style={{ font: "500 12.5px var(--font-mono)", color: "var(--text)" }}>{c.csv}</span>
            <Icon name="arrowR" size={14} color="var(--text-mute)" />
            <span style={{ display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 10px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)" }}>
              {c.type === "relation" && <Icon name="link" size={13} color="var(--accent-rel)" />}
              <span style={{ flex: 1, font: "500 12.5px var(--font-sans)", color: c.type === "skip" ? "var(--text-mute)" : "var(--text)" }}>{c.to}</span>
              {c.type !== "skip" && <span className="mono" style={{ font: "400 10.5px var(--font-mono)", color: "var(--text-mute)" }}>{c.type}</span>}
              <Icon name="chevronD" size={13} color="var(--text-mute)" />
            </span>
          </div>
        ))}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 14, font: "400 13px var(--font-sans)", color: "var(--text-soft)" }}>
        <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent-pri)", width: 15, height: 15 }} /> Dedupe por <span className="mono" style={{ color: "var(--text)" }}>codigo</span> (omite filas duplicadas)
      </label>
    </Modal>
  );
}

// ---------- TemplatePickerModal ----------
const TPL = [
  { e: "\uD83D\uDCC7", n: "Clientes", d: "Contactos y empresas", c: 7 },
  { e: "\uD83E\uDDFE", n: "Facturas", d: "Emitidas y por cobrar", c: 8 },
  { e: "\uD83D\uDCE6", n: "Inventario", d: "Productos y stock", c: 6 },
  { e: "\uD83D\uDC65", n: "Empleados", d: "RR.HH. básico", c: 9 },
  { e: "\uD83D\uDCB0", n: "Gastos", d: "Control de gastos", c: 5 },
  { e: "\uD83D\uDCCA", n: "Proyectos", d: "Tareas e hitos", c: 7 },
  { e: "\uD83D\uDCDE", n: "Leads", d: "Pipeline de ventas", c: 8 },
  { e: "\uD83C\uDFAB", n: "Tickets", d: "Soporte al cliente", c: 6 },
  { e: "\uD83D\uDCC5", n: "Reservas", d: "Citas y agenda", c: 7 },
];
function TemplatePickerModal({ onClose }) {
  return (
    <Modal title="Galería de plantillas" sub="Empieza con columnas y datos de ejemplo" icon="sparkles" size={680} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {TPL.map((t, i) => (
          <button key={i} className="og-card" onClick={() => { onClose(); ogToast(`Plantilla "${t.n}" lista para configurar`); }} style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 8, padding: 15, borderRadius: "var(--r-3)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", boxShadow: "var(--shadow-1)" }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>{t.e}</span>
            <span style={{ font: "600 14px var(--font-sans)" }}>{t.n}</span>
            <span style={{ font: "400 12px var(--font-sans)", color: "var(--text-mute)" }}>{t.d}</span>
            <span style={{ font: "500 11px var(--font-mono)", color: "var(--accent-pri)", marginTop: 2 }}>{t.c} columnas</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------- RelationsManagerModal ----------
const RELS = [
  { from: "Pedidos", col: "cliente", to: "Clientes", kind: "1:N" },
  { from: "Detalle", col: "pedido", to: "Pedidos", kind: "1:N" },
  { from: "Detalle", col: "producto", to: "Producto", kind: "N:N", bridge: "Pedido ↔ Prod" },
];
function RelationsManagerModal({ onClose }) {
  return (
    <Modal title="Gestor de relaciones" sub="Relaciones existentes entre datasets del workspace" icon="link" iconTone="rel" size={640} onClose={onClose}
      footer={<><Btn variant="soft" icon="sparkles" onClick={() => { onClose(); openModal("relationScan"); }}>Detectar nuevas</Btn><Btn variant="primary" icon="plus" onClick={() => { onClose(); openModal("linkTable"); }}>Vincular tablas</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {RELS.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, flexWrap: "wrap" }}>
              <Chip tone="rel">{r.from}</Chip>
              <span className="mono" style={{ font: "400 11.5px var(--font-mono)", color: "var(--text-mute)" }}>.{r.col}</span>
              <Icon name="arrowR" size={14} color="var(--text-mute)" />
              <Chip tone="primary">{r.to}</Chip>
              {r.bridge && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "400 11px var(--font-mono)", color: "var(--text-mute)" }}>vía <Chip tone="neutral">{r.bridge}</Chip></span>}
            </span>
            <Badge tone={r.kind === "N:N" ? "calc" : "neutral"}>{r.kind}</Badge>
            <button onClick={() => confirmDialog({ title: "Quitar relación", message: `¿Desvincular ${r.from}.${r.col} → ${r.to}? Los datos no se borran.`, confirmLabel: "Quitar", danger: true, onConfirm: () => ogToast("Relación eliminada", "danger") })} className="og-iconbtn" style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-mute)" }}><Icon name="trash" size={15} /></button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ---------- LinkTableModal ----------
function LinkTableModal({ onClose }) {
  const [kind, setKind] = useState("1:N");
  const selSt = { width: "100%", height: 38, borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", font: "500 13.5px var(--font-sans)", padding: "0 10px", outline: "none" };
  return (
    <Modal title="Vincular tabla" sub="Crea una relación desde Pedidos hacia otro dataset" icon="link" iconTone="rel" size={520} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="primary" icon="check" onClick={() => { onClose(); ogToast("Tabla vinculada"); }}>Vincular</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label><div style={{ font: "500 12.5px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Dataset destino</div>
          <select style={selSt}>{["Clientes", "Producto", "Empleado", "Detalle"].map(o => <option key={o}>{o}</option>)}</select></label>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ flex: 1 }}><div style={{ font: "500 12.5px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Columna en Pedidos</div>
            <select style={selSt}>{["cliente", "vendedor", "(nueva columna)"].map(o => <option key={o}>{o}</option>)}</select></label>
          <label style={{ flex: 1 }}><div style={{ font: "500 12.5px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Campo a mostrar</div>
            <select style={selSt}>{["nombre", "codigo", "email"].map(o => <option key={o}>{o}</option>)}</select></label>
        </div>
        <div>
          <div style={{ font: "500 12.5px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Cardinalidad</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["1:N", "Uno a muchos"], ["N:N", "Muchos a muchos (tabla intermedia)"]].map(([k, l]) => (
              <button key={k} onClick={() => setKind(k)} style={{ flex: 1, textAlign: "left", padding: "10px 12px", borderRadius: "var(--r-2)", border: `1px solid ${kind === k ? "var(--accent-rel)" : "var(--border)"}`, background: kind === k ? "var(--rel-soft)" : "var(--surface)", cursor: "pointer" }}>
                <span style={{ display: "block", font: "700 13px var(--font-mono)", color: kind === k ? "var(--accent-rel)" : "var(--text)" }}>{k}</span>
                <span style={{ display: "block", font: "400 11.5px var(--font-sans)", color: "var(--text-mute)", marginTop: 2 }}>{l}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Host ----------
function renderModal(m, onClose) {
  switch (m.name) {
    case "importExcel":   return <ImportExcelModal onClose={onClose} />;
    case "relationScan":  return <RelationScanModal onClose={onClose} />;
    case "addColumn":     return <AddColumnModal onClose={onClose} />;
    case "datasetAccess": return <DatasetAccessModal onClose={onClose} />;
    case "inviteUser":    return <InviteUserModal onClose={onClose} />;
    case "recordHistory": return <RecordHistoryPanel onClose={onClose} />;
    case "editColumn":    return <EditColumnModal onClose={onClose} />;
    case "conditionalFormat": return <ConditionalFormattingModal onClose={onClose} />;
    case "searchReplace": return <SearchReplaceModal onClose={onClose} />;
    case "schema":        return <SchemaDiagramModal onClose={onClose} />;
    case "csvMapping":    return <CsvMappingModal onClose={onClose} />;
    case "templatePicker": return <TemplatePickerModal onClose={onClose} />;
    case "relationsManager": return <RelationsManagerModal onClose={onClose} />;
    case "linkTable":     return <LinkTableModal onClose={onClose} />;
    default: return null;
  }
}
function ModalHost() {
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    window.__ogOpen = (name, props) => setModal({ name, props });
    window.__ogClose = () => setModal(null);
    window.__ogConfirm = (opts) => setConfirm(opts);
    window.__ogToast = (msg, tone) => { const id = Date.now() + Math.random(); setToasts(t => [...t, { id, msg, tone }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200); };
  }, []);
  return (
    <React.Fragment>
      {modal && renderModal(modal, () => setModal(null))}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
      <ToastStack toasts={toasts} />
    </React.Fragment>
  );
}

Object.assign(window, { openModal, closeModal, ogToast, confirmDialog, ModalHost });

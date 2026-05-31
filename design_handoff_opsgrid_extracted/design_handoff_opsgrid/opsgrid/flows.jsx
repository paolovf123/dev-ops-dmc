// flows.jsx — CreateDataset + RecordForm

const TEMPLATES = [
  { emoji: "📇", name: "Clientes", desc: "Contactos y empresas", cols: 7 },
  { emoji: "🧾", name: "Facturas", desc: "Emitidas y por cobrar", cols: 8 },
  { emoji: "📦", name: "Inventario", desc: "Productos y stock", cols: 6 },
  { emoji: "👥", name: "Empleados", desc: "RR.HH. básico", cols: 9 },
  { emoji: "💰", name: "Gastos", desc: "Control de gastos", cols: 5 },
  { emoji: "📊", name: "Proyectos", desc: "Tareas e hitos", cols: 7 },
];
const TYPES = ["text", "long_text", "number", "currency", "percent", "rating", "date", "enum", "multiselect", "boolean", "email", "phone", "url", "relation"];

function CreateDataset({ onBack }) {
  const [step, setStep] = useState(1);
  const [cols, setCols] = useState([
    { name: "Código", key: "codigo", type: "text", req: true },
    { name: "Cliente", key: "cliente", type: "relation", req: true },
    { name: "Total", key: "total", type: "currency", req: true },
    { name: "Estado", key: "estado", type: "enum", req: false },
  ]);
  const upd = (i, patch) => setCols(cs => cs.map((c, j) => j === i ? { ...c, ...patch } : c));

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "28px 32px 80px" }}>
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-soft)", font: "500 13px var(--font-sans)", padding: 0, marginBottom: 14 }}><Icon name="chevronL" size={16} /> Volver a Datasets</button>
      <h1 style={{ margin: 0, font: "700 26px/1.1 var(--font-sans)", letterSpacing: "-.02em" }}>Nuevo dataset</h1>

      {/* steps */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 24px" }}>
        {["Elegir origen", "Configurar columnas"].map((s, i) => {
          const n = i + 1, on = step === n, done = step > n;
          return (
            <React.Fragment key={i}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, font: `${on ? 600 : 500} 13px var(--font-sans)`, color: on ? "var(--text)" : "var(--text-mute)" }}>
                <span style={{ display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 999, background: on || done ? "var(--accent-pri)" : "var(--surface-alt)", color: on || done ? "#fff" : "var(--text-mute)", font: "700 12px var(--font-sans)" }}>{done ? "✓" : n}</span>{s}
              </span>
              {i === 0 && <span style={{ flex: "0 0 40px", height: 2, background: "var(--border)" }} />}
            </React.Fragment>
          );
        })}
      </div>

      {step === 1 ? (
        <>
          <div onClick={() => openModal("importExcel")} style={{ border: "2px dashed var(--border-strong)", borderRadius: "var(--r-3)", padding: "36px 20px", textAlign: "center", background: "var(--surface)", cursor: "pointer" }}>
            <span style={{ display: "grid", placeItems: "center", width: 52, height: 52, margin: "0 auto 14px", borderRadius: "var(--r-3)", background: "var(--pri-soft)", color: "var(--accent-pri)" }}><Icon name="upload" size={24} /></span>
            <div style={{ font: "600 15px var(--font-sans)" }}>Arrastra un Excel o CSV aquí</div>
            <div style={{ font: "400 13px var(--font-sans)", color: "var(--text-mute)", marginTop: 5 }}>.xlsx · .xls · .csv · hasta 10 MB · detección de tipos automática</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "26px 0 16px" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ font: "500 12px var(--font-sans)", color: "var(--text-mute)" }}>o elige una plantilla</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {TEMPLATES.map((t, i) => (
              <button key={i} onClick={() => setStep(2)} style={{ textAlign: "left", display: "flex", gap: 11, padding: 14, borderRadius: "var(--r-3)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", boxShadow: "var(--shadow-1)" }} className="og-card">
                <span style={{ fontSize: 26, lineHeight: 1 }}>{t.emoji}</span>
                <span><span style={{ display: "block", font: "600 14px var(--font-sans)" }}>{t.name}</span><span style={{ display: "block", font: "400 12px var(--font-sans)", color: "var(--text-mute)", marginTop: 2 }}>{t.desc} · {t.cols} col</span></span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 22, flexWrap: "wrap" }}>
            <button onClick={() => setStep(2)} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "none", background: "transparent", cursor: "pointer", color: "var(--accent-pri)", font: "600 14px var(--font-sans)" }}>o empieza desde cero <Icon name="arrowR" size={16} /></button>
            <button onClick={() => openModal("templatePicker")} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-soft)", font: "600 14px var(--font-sans)" }}><Icon name="sparkles" size={15} /> Ver galería completa</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
            <label style={{ flex: 1 }}><div style={{ font: "500 13px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Nombre *</div><div style={{ height: 40, padding: "0 12px", display: "flex", alignItems: "center", borderRadius: "var(--r-2)", border: "1px solid var(--accent-pri)", background: "var(--surface)", boxShadow: "var(--shadow-focus)", font: "500 14px var(--font-sans)" }}>Pedidos</div></label>
            <label style={{ flex: 1 }}><div style={{ font: "500 13px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Descripción</div><div style={{ height: 40, padding: "0 12px", display: "flex", alignItems: "center", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", font: "400 14px var(--font-sans)", color: "var(--text-mute)" }}>Órdenes de venta</div></label>
          </div>
          <div style={{ font: "600 14px var(--font-sans)", marginBottom: 10 }}>Columnas</div>
          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1.1fr 1.2fr 90px 44px", padding: "10px 14px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", font: "600 12px var(--font-sans)", color: "var(--text-mute)" }}>
              <span>Nombre</span><span>field_key</span><span>Tipo</span><span>Requerido</span><span></span>
            </div>
            {cols.map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.3fr 1.1fr 1.2fr 90px 44px", alignItems: "center", padding: "9px 14px", borderBottom: i < cols.length - 1 ? "1px solid var(--border)" : "none", gap: 8 }}>
                <span style={{ font: "500 13.5px var(--font-sans)" }}>{c.name}</span>
                <span className="mono" style={{ font: "400 12px var(--font-mono)", color: "var(--text-mute)" }}>{c.key}</span>
                <select value={c.type} onChange={(e) => upd(i, { type: e.target.value })} style={{ height: 32, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: c.type === "relation" ? "var(--accent-rel)" : "var(--text)", font: "500 12.5px var(--font-mono)", padding: "0 8px" }}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <Toggle on={c.req} onChange={(v) => upd(i, { req: v })} size={0.85} />
                <button onClick={() => setCols(cs => cs.filter((_, j) => j !== i))} className="og-iconbtn" style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-mute)" }}><Icon name="trash" size={15} /></button>
              </div>
            ))}
            <button onClick={() => setCols(cs => [...cs, { name: "Nueva columna", key: "nueva_columna", type: "text", req: false }])} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "11px 14px", border: "none", borderTop: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--accent-pri)", font: "600 13px var(--font-sans)" }}><Icon name="plus" size={15} /> Añadir columna</button>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
            <Btn variant="ghost" onClick={() => setStep(1)}>Atrás</Btn>
            <Btn variant="primary" icon="check" onClick={() => { onBack(); ogToast("Dataset creado"); }}>Crear dataset</Btn>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- RecordForm ----------
function RecordForm({ onBack }) {
  const [child, setChild] = useState(true);
  const Sec = ({ icon, color, title, count, children }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", padding: 18, boxShadow: "var(--shadow-1)", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Icon name={icon} size={17} color={color} /><span style={{ font: "600 14px var(--font-sans)" }}>{title}</span>
        <span style={{ font: "400 12px var(--font-sans)", color: "var(--text-mute)" }}>· {count}</span>
      </div>
      {children}
    </div>
  );
  const F = ({ label, val, req, mono, rel }) => (
    <label style={{ flex: 1, minWidth: 180 }}>
      <div style={{ font: "500 12.5px var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>{label}{req && <span style={{ color: "var(--danger)" }}> *</span>}</div>
      <div style={{ height: 38, padding: "0 11px", display: "flex", alignItems: "center", justifyContent: rel ? "space-between" : "flex-start", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", font: `400 13.5px ${mono ? "var(--font-mono)" : "var(--font-sans)"}`, color: val ? "var(--text)" : "var(--text-mute)" }}>
        {val || "—"}{rel && <Icon name="chevronD" size={14} color="var(--text-mute)" />}
      </div>
    </label>
  );
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 32px 110px" }}>
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-soft)", font: "500 13px var(--font-sans)", padding: 0, marginBottom: 14 }}><Icon name="chevronL" size={16} /> Volver a Pedidos</button>
      <h1 style={{ margin: "0 0 22px", font: "700 24px/1.1 var(--font-sans)", letterSpacing: "-.02em" }}>Nuevo registro · Pedidos</h1>

      <Sec icon="datasets" color="var(--accent-pri)" title="Pedidos" count="4 campos">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <F label="Código" req val="PED-0011" mono />
          <F label="Fecha" val="2026-05-30" mono />
          <F label="Total" req val="1,540.00" mono />
          <F label="Estado" val="pendiente" rel />
        </div>
      </Sec>

      <Sec icon="link" color="var(--accent-rel)" title="Relaciones" count="1 campo">
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <F label="Cliente" req val="— Seleccionar —" rel />
          <Btn variant="tint" size="md" icon="plus" tone="rel" style={{ background: "var(--rel-soft)", color: "var(--accent-rel)" }}>Crear nuevo</Btn>
        </div>
      </Sec>

      <div style={{ font: "400 13px var(--font-sans)", color: "var(--text-soft)", margin: "4px 4px 12px" }}>Puedes crear registros vinculados al mismo tiempo (la FK se asigna sola):</div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", boxShadow: "var(--shadow-1)", overflow: "hidden", marginBottom: 16 }}>
        <button onClick={() => setChild(c => !c)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 18px", border: "none", background: "transparent", cursor: "pointer" }}>
          <Icon name={child ? "chevronD" : "chevronR"} size={16} color="var(--text-mute)" />
          <Icon name="link" size={16} color="var(--accent-rel)" />
          <span style={{ font: "600 14px var(--font-sans)" }}>Detalle</span>
          <div style={{ flex: 1 }} />
          <Badge tone="success">Se creará</Badge>
        </button>
        {child && (
          <div style={{ padding: "0 18px 18px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 14, borderRadius: "var(--r-2)", background: "var(--surface-alt)" }}>
              <F label="Producto" val="— Seleccionar —" rel />
              <F label="Cantidad" val="3" mono />
              <F label="Precio" val="320.00" mono />
            </div>
            <button style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, border: "none", background: "transparent", cursor: "pointer", color: "var(--accent-pri)", font: "600 13px var(--font-sans)" }}><Icon name="plus" size={14} /> Añadir línea de Detalle</button>
          </div>
        )}
      </div>

      {/* sticky footer */}
      <div style={{ position: "sticky", bottom: 0, marginTop: 8, display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: "var(--r-3)", background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-3)" }}>
        <span style={{ font: "400 13px var(--font-sans)", color: "var(--text-soft)" }}>Guardando en <strong style={{ color: "var(--text)" }}>Pedidos</strong> · cambios sin guardar</span>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onBack}>Cancelar</Btn>
        <Btn variant="primary" icon="check" onClick={() => { onBack(); ogToast("Registro guardado"); }}>Guardar registro</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { CreateDataset, RecordForm });

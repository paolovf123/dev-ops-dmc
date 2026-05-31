// computed.jsx — ComputedDatasetEditor (script editor: sources · Monaco-like · output)

const SOURCES = [
  { name: "Pedidos", on: true, cols: ["codigo", "cliente", "fecha", "total", "estado"] },
  { name: "Detalle", on: true, cols: ["pedido", "producto", "cantidad", "precio"] },
  { name: "Producto", on: false, cols: ["nombre", "categoria", "precio"] },
  { name: "Clientes", on: false, cols: ["nombre", "ciudad", "segmento"] },
];

// fake-colored python lines (kw=calc, str=success, num=warning, fn=pri, com=mute)
const K = (c) => ({ color: c });
function Code() {
  const kw = "var(--accent-calc)", str = "var(--success)", num = "var(--warning)", fn = "var(--accent-pri)", com = "var(--text-mute)", t = "#c8d3e6";
  const L = [
    [["import ", kw], ["duckdb", t]],
    [["import ", kw], ["pandas ", t], ["as ", kw], ["pd", t]],
    [],
    [["# agrega ventas por mes desde Pedidos", com]],
    [["df ", t], ["= ", t], ["duckdb", t], [".", t], ["query", fn], ["(", t], ['"""', str]],
    [["  SELECT", str], [" strftime(fecha, ", str], ["'%Y-%m'", str], [") AS mes,", str]],
    [["         SUM(total) AS ventas,", str]],
    [["         COUNT(*)   AS pedidos", str]],
    [["  FROM pedidos", str]],
    [["  GROUP BY mes", str]],
    [["  ORDER BY mes", str]],
    [['"""', str], [").df()", t]],
    [],
    [["df", t], ["[", t], ["'ticket'", str], ["] ", t], ["= ", t], ["df", t], [".ventas ", t], ["/ ", t], ["df", t], [".pedidos", t]],
    [["return ", kw], ["df", t]],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", font: "400 13px/1.85 var(--font-mono)" }}>
      <div style={{ textAlign: "right", paddingRight: 12, color: "#4a5568", userSelect: "none", borderRight: "1px solid #232a3a" }}>
        {L.map((_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <div style={{ paddingLeft: 14, whiteSpace: "pre", overflowX: "auto" }}>
        {L.map((line, i) => (
          <div key={i} style={{ minHeight: "1.85em" }}>{line.length ? line.map(([txt, c], j) => <span key={j} style={K(c)}>{txt}</span>) : "\u00a0"}</div>
        ))}
      </div>
    </div>
  );
}

function OutputPanel() {
  const [tab, setTab] = useState("resumen");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface)" }}>
      <div style={{ display: "flex", gap: 2, padding: "10px 12px 0", borderBottom: "1px solid var(--border)" }}>
        {[["resumen", "Resumen"], ["logs", "Logs"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ font: `${tab === k ? 600 : 500} 13px var(--font-sans)`, padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer", color: tab === k ? "var(--text)" : "var(--text-soft)", borderBottom: tab === k ? "2px solid var(--accent-pri)" : "2px solid transparent", marginBottom: -1 }}>{l}</button>
        ))}
      </div>
      <div style={{ padding: 16, flex: 1, overflow: "auto" }}>
        {tab === "resumen" ? (
          <>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: "var(--r-pill)", background: "var(--success-soft)", color: "var(--success)", font: "600 12px var(--font-sans)", marginBottom: 16 }}>
              <Icon name="check" size={14} /> Ejecutado en 0.42s
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["filas", "12", "var(--accent-pri)"], ["columnas", "4", "var(--accent-pri)"], ["errores", "0", "var(--success)"], ["warnings", "0", "var(--text-soft)"]].map(([l, v, c], i) => (
                <div key={i} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-2)", padding: "12px 14px" }}>
                  <div className="mono" style={{ font: "700 22px var(--font-mono)", color: c }}>{v}</div>
                  <div style={{ font: "400 12px var(--font-sans)", color: "var(--text-mute)" }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ font: "500 12px var(--font-sans)", color: "var(--text-mute)", margin: "18px 0 8px" }}>Vista previa</div>
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-2)", overflow: "hidden", font: "400 11.5px var(--font-mono)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", color: "var(--text-mute)" }}>
                {["mes", "ventas", "ticket"].map(h => <span key={h} style={{ padding: "6px 9px" }}>{h}</span>)}
              </div>
              {[["2026-03", "S/ 18,400", "S/ 920"], ["2026-04", "S/ 22,150", "S/ 845"], ["2026-05", "S/ 14,070", "S/ 1,005"]].map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: i < 2 ? "1px solid var(--border)" : "none" }}>
                  {r.map((c, j) => <span key={j} style={{ padding: "6px 9px", color: j === 0 ? "var(--text-soft)" : "var(--text)" }}>{c}</span>)}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}><Btn variant="tint" size="sm" iconR="arrowR" full>Ver dataset Ventas x mes</Btn></div>
          </>
        ) : (
          <pre className="mono" style={{ font: "400 12px/1.7 var(--font-mono)", color: "var(--text-soft)", margin: 0, whiteSpace: "pre-wrap" }}>
{`[12:04:31] iniciando runtime python 3.11
[12:04:31] cargando fuentes: pedidos (120), detalle (200)
[12:04:31] duckdb 0.10 · pandas 2.2 · numpy 1.26
[12:04:32] query OK → 12 filas, 4 columnas
[12:04:32] columna derivada 'ticket' calculada
[12:04:32] ✓ compute finalizado en 0.42s`}
          </pre>
        )}
      </div>
    </div>
  );
}

function ComputedEditor() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 340px", height: "100%", minHeight: 0 }}>
      {/* left: sources */}
      <div style={{ borderRight: "1px solid var(--border)", background: "var(--surface)", overflow: "auto", padding: 16 }}>
        <div style={{ font: "600 13px var(--font-sans)", marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="datasets" size={16} color="var(--accent-pri)" /> Fuentes de datos
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SOURCES.map((s, i) => (
            <div key={i} style={{ border: `1px solid ${s.on ? "color-mix(in srgb, var(--accent-pri) 35%, transparent)" : "var(--border)"}`, background: s.on ? "var(--pri-soft)" : "var(--surface)", borderRadius: "var(--r-2)", padding: "10px 11px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" defaultChecked={s.on} style={{ accentColor: "var(--accent-pri)", width: 15, height: 15 }} />
                <span style={{ font: "600 13px var(--font-sans)", flex: 1 }}>{s.name}</span>
              </div>
              {s.on && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>{s.cols.map(c => <span key={c} className="mono" style={{ font: "400 10.5px var(--font-mono)", padding: "2px 6px", borderRadius: 5, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-soft)" }}>{c}</span>)}</div>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, padding: 13, borderRadius: "var(--r-2)", background: "var(--calc-soft)", border: "1px solid color-mix(in srgb, var(--accent-calc) 30%, transparent)" }}>
          <div style={{ font: "600 12.5px var(--font-sans)", color: "var(--accent-calc)", display: "flex", alignItems: "center", gap: 6 }}><span className="mono">ƒ</span> Salida del script</div>
          <div style={{ font: "400 12px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 5 }}>Ventas x mes · 12 filas · 4 columnas</div>
        </div>
      </div>

      {/* center: editor */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, background: "#0f1320" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid #232a3a", background: "#121728" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: "var(--r-pill)", background: "color-mix(in srgb, var(--accent-calc) 22%, transparent)", color: "var(--accent-calc)", font: "600 12px var(--font-sans)" }}><span className="mono">ƒ</span> Computed dataset</span>
          <span style={{ font: "500 13px var(--font-sans)", color: "#c8d3e6" }}>Ventas por mes</span>
          <div style={{ flex: 1 }} />
          <Btn variant="ghost" size="sm" icon="sparkles" style={{ color: "#9aa6b5" }}>Plantilla</Btn>
          <Btn variant="soft" size="sm" icon="check" style={{ background: "#1b2336", borderColor: "#2a3550", color: "#c8d3e6" }}>Guardar</Btn>
          <Btn variant="primary" size="sm" icon="scripts">Ejecutar <Kbd>⌃↵</Kbd></Btn>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "14px 6px" }}><Code /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "7px 16px", borderTop: "1px solid #232a3a", background: "#121728", font: "400 11.5px var(--font-mono)", color: "#6b7689" }}>
          <span>Python 3.11</span><span>pandas</span><span>numpy</span><span>duckdb</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: "var(--success)" }}>● OK</span>
          <span>Ln 15, Col 11</span>
        </div>
      </div>

      {/* right: output */}
      <div style={{ borderLeft: "1px solid var(--border)" }}><OutputPanel /></div>
    </div>
  );
}

function ScriptsEditor() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "16px 32px", borderBottom: "1px solid var(--border)", background: "var(--bg)", flex: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "var(--r-2)", background: "var(--calc-soft)", color: "var(--accent-calc)", font: "700 16px var(--font-mono)" }}>ƒ</span>
          <h1 style={{ margin: 0, font: "700 22px/1 var(--font-sans)", letterSpacing: "-.02em" }}>Editor de script calculado</h1>
          <span style={{ font: "400 13px var(--font-sans)", color: "var(--text-mute)" }}>· Python · ejecuta sobre tus tablas fuente</span>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}><ComputedEditor /></div>
    </div>
  );
}

Object.assign(window, { ScriptsEditor });

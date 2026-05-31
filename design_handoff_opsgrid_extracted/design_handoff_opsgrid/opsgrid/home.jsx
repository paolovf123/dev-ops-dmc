// home.jsx — DatasetList (variant A: relation badges + relation map)

const DSETS = [
  { icon: "datasets", name: "Clientes",     code: "CLI", cols: 7, rows: 100, rel: 0, kind: "real",   desc: "Empresas y contactos" },
  { icon: "datasets", name: "Pedidos",      code: "PED", cols: 6, rows: 120, rel: 2, kind: "real",   desc: "Órdenes de venta" },
  { icon: "scripts",  name: "Ventas x mes", code: "VXM", cols: 3, rows: 12,  rel: 0, kind: "calc",   desc: "Agregado mensual" },
  { icon: "datasets", name: "Detalle",      code: "DET", cols: 5, rows: 200, rel: 1, kind: "real",   desc: "Líneas de pedido" },
  { icon: "datasets", name: "Producto",     code: "PRD", cols: 4, rows: 45,  rel: 0, kind: "real",   desc: "Catálogo" },
  { icon: "link",     name: "Pedido ↔ Prod", code: "PXP", cols: 3, rows: 200, rel: 2, kind: "bridge", desc: "Tabla intermedia" },
];

function kindMeta(k) {
  if (k === "calc")   return { tone: "calc", color: "var(--accent-calc)", soft: "var(--calc-soft)" };
  if (k === "bridge") return { tone: "rel",  color: "var(--accent-rel)",  soft: "var(--rel-soft)" };
  return { tone: "primary", color: "var(--accent-pri)", soft: "var(--pri-soft)" };
}

function DatasetCard({ d, onOpen, i }) {
  const m = kindMeta(d.kind);
  return (
    <div className="og-card og-rise" tabIndex={0} onClick={onOpen} style={{
      animationDelay: (i || 0) * 55 + "ms",
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
      padding: 16, cursor: "pointer", transition: "all var(--t-fast)", boxShadow: "var(--shadow-1)",
      display: "flex", flexDirection: "column", gap: 0, minHeight: 132,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "var(--r-2)", background: m.soft, color: m.color, border: `1px solid color-mix(in srgb, ${m.color} 26%, transparent)` }}>
          <Icon name={d.icon} size={21} />
        </span>
        <button className="og-iconbtn" style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "var(--r-2)", border: "none", background: "transparent", color: "var(--text-mute)", cursor: "pointer" }}>
          <Icon name="dots" size={18} />
        </button>
      </div>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ font: "600 16px/1.2 var(--font-sans)", color: "var(--text)" }}>{d.name}</span>
        <span className="mono" style={{ font: "500 10.5px/1 var(--font-mono)", color: "var(--text-mute)", padding: "3px 5px", borderRadius: 5, background: "var(--surface-alt)" }}>{d.code}</span>
      </div>
      <div style={{ font: "400 12.5px/1.3 var(--font-sans)", color: "var(--text-mute)", marginTop: 3 }}>{d.desc}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 13 }}>
        <Badge tone="neutral">{d.cols} col</Badge>
        <Badge tone="neutral">{d.rows.toLocaleString("es-PE")} filas</Badge>
        {d.kind === "calc"   && <Badge tone="calc" dot>calculado</Badge>}
        {d.kind === "bridge" && <Badge tone="rel">intermedia</Badge>}
        {d.rel > 0 && d.kind !== "bridge" && <Badge tone="rel" dot>{d.rel} rel</Badge>}
      </div>
    </div>
  );
}

// mini relation map (SVG)
function RelationMap() {
  const nodes = [
    { id: "cli", label: "Clientes", x: 24,  y: 54, kind: "real" },
    { id: "ped", label: "Pedidos",  x: 224, y: 54, kind: "rel" },
    { id: "det", label: "Detalle",  x: 224, y: 132, kind: "rel" },
    { id: "prd", label: "Producto", x: 424, y: 132, kind: "real" },
  ];
  const NW = 132, NH = 40;
  const col = (k) => k === "rel" ? "var(--accent-rel)" : "var(--accent-pri)";
  const soft = (k) => k === "rel" ? "var(--rel-soft)" : "var(--pri-soft)";
  return (
    <div style={{ position: "relative", width: "100%", overflowX: "auto" }}>
      <svg width="588" height="196" style={{ display: "block" }}>
        {/* edges */}
        <path d="M156 74 C 196 74 184 74 224 74" fill="none" stroke="var(--accent-rel)" strokeWidth="2" />
        <path d="M290 94 C 290 113 290 113 290 132" fill="none" stroke="var(--accent-rel)" strokeWidth="2" />
        <path d="M356 152 C 396 152 384 152 424 152" fill="none" stroke="var(--accent-rel)" strokeWidth="2" />
        {/* crow's foot-ish dots */}
        {[[224,74],[290,132],[424,152]].map(([x,y],i)=>(<circle key={i} cx={x} cy={y} r="3.5" fill="var(--accent-rel)" />))}
        <text x="180" y="66" fontFamily="var(--font-mono)" fontSize="10" fill="var(--accent-rel)">1:N</text>
        <text x="296" y="116" fontFamily="var(--font-mono)" fontSize="10" fill="var(--accent-rel)">N:N</text>
        {nodes.map(n => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={NW} height={NH} rx="9"
              fill={soft(n.kind)} stroke={col(n.kind)} strokeWidth="1.5" />
            <text x={n.x + 16} y={n.y + 25} fontFamily="var(--font-sans)" fontWeight="600" fontSize="13.5" fill="var(--text)">{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", padding: 16, minHeight: 132, boxShadow: "var(--shadow-1)" }}>
      <div className="og-shimmer" style={{ width: 40, height: 40, borderRadius: "var(--r-2)" }} />
      <div className="og-shimmer" style={{ width: "55%", height: 15, borderRadius: 5, marginTop: 14 }} />
      <div className="og-shimmer" style={{ width: "75%", height: 11, borderRadius: 5, marginTop: 9 }} />
      <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
        <div className="og-shimmer" style={{ width: 52, height: 20, borderRadius: 999 }} />
        <div className="og-shimmer" style={{ width: 64, height: 20, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function Home({ onOpen, onCreate }) {
  const [bridges, setBridges] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 780); return () => clearTimeout(t); }, []);
  const list = DSETS.filter(d => bridges || d.kind !== "bridge");
  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 32px 80px" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, font: "700 28px/1.1 var(--font-sans)", letterSpacing: "-.02em", color: "var(--text)" }}>Datasets</h1>
          <p style={{ margin: "7px 0 0", font: "400 15px/1.4 var(--font-sans)", color: "var(--text-soft)", maxWidth: 520 }}>Workspace <strong style={{ color: "var(--text)" }}>Ventas</strong> — convierte tus Excels en tablas relacionadas.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="soft" icon="sparkles" onClick={() => openModal("relationScan")}>Detectar relaciones</Btn>
          <Btn variant="primary" icon="plus" onClick={onCreate}>Nuevo dataset</Btn>
        </div>
      </div>

      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 18px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, height: 38, padding: "0 12px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", width: 240 }}>
          <Icon name="search" size={16} color="var(--text-mute)" />
          <input placeholder="Buscar…" style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--text)", font: "400 13.5px/1 var(--font-sans)" }} />
        </div>
        <Btn variant="soft" size="sm" icon="diagram" onClick={() => openModal("schema")}>Diagrama</Btn>
        <Btn variant="soft" size="sm" icon="link" onClick={() => openModal("relationsManager")}>Relaciones</Btn>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 9, font: "500 13px/1 var(--font-sans)", color: "var(--text-soft)" }}>
          <span>Intermedias <span className="mono" style={{ color: "var(--text-mute)" }}>(2)</span></span>
          <Toggle on={bridges} onChange={setBridges} />
        </div>
      </div>

      <div style={{ font: "400 13px/1 var(--font-sans)", color: "var(--text-mute)", marginBottom: 14 }}>
        {list.length} datasets · 1,240 filas · 38 columnas
      </div>

      {/* cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))", gap: 16 }}>
        {loading ? [0, 1, 2, 3].map(i => <SkeletonCard key={i} />) : <>
        {list.map((d, i) => <DatasetCard key={i} d={d} i={i} onOpen={onOpen} />)}
        <button className="og-newcard og-rise" onClick={onCreate} style={{
          animationDelay: list.length * 55 + "ms",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
          minHeight: 132, borderRadius: "var(--r-3)", border: "1.5px dashed var(--border-strong)",
          background: "transparent", cursor: "pointer", color: "var(--text-mute)", transition: "all var(--t-fast)",
        }}>
          <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "var(--r-2)", border: "1.5px dashed var(--border-strong)" }}><Icon name="plus" size={22} /></span>
          <span style={{ font: "600 14px/1 var(--font-sans)" }}>Nuevo dataset</span>
        </button>
        </>}
      </div>

      {/* relation map */}
      <div style={{ marginTop: 34 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Icon name="diagram" size={17} color="var(--accent-rel)" />
          <span style={{ font: "600 15px/1 var(--font-sans)", color: "var(--text)" }}>Mapa de relaciones</span>
          <span style={{ font: "400 13px/1 var(--font-sans)", color: "var(--text-mute)" }}>· contenido manda (score 0.98)</span>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", padding: "18px 20px", boxShadow: "var(--shadow-1)" }}>
          <RelationMap />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Home });

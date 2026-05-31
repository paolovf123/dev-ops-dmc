// wf-home.jsx — DatasetList / Home: 3 approaches (exploring relation/join display)

const DATASETS = [
  { g: "▦", name: "Clientes",   code: "CLI", cols: 7, rows: 100, rel: 0, kind: "real" },
  { g: "▦", name: "Pedidos",    code: "PED", cols: 6, rows: 120, rel: 2, kind: "real" },
  { g: "ƒ", name: "Ventas x mes", code: "VXM", cols: 3, rows: 12, rel: 0, kind: "calc" },
  { g: "▦", name: "Detalle",    code: "DET", cols: 5, rows: 200, rel: 1, kind: "real" },
  { g: "▦", name: "Producto",   code: "PRD", cols: 4, rows: 45, rel: 0, kind: "real" },
  { g: "⛓", name: "Pedido↔Prod", code: "PXP", cols: 3, rows: 200, rel: 2, kind: "bridge" },
];

function kindColor(k) { return k === "calc" ? CALC : k === "bridge" ? REL : PRI; }

function HomeToolbar() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
      <div>
        <div style={{ font: '700 22px "Kalam", cursive', color: INK, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <G c="▦" color={PRI} size={20} /> Ventas · 6 datasets
        </div>
        <div style={{ font: '14px "Kalam", cursive', color: INK2, marginTop: 4, whiteSpace: "nowrap" }}>6 datasets · 1,240 filas · 38 columnas</div>
      </div>
      <div style={{ display: "flex", gap: 9 }}>
        <Btn sm ghost>⌁ Detectar relaciones</Btn>
        <Btn sm solid accent={PRI}>+ Nuevo dataset</Btn>
      </div>
    </div>
  );
}

function SubToolbar({ extra }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 16px" }}>
      <Field ph="🔍 buscar…" w="220px" />
      <Btn sm ghost>◇ Diagrama</Btn>
      <Btn sm ghost>⛓ Relaciones</Btn>
      <span style={{ flex: 1 }} />
      <span style={{ font: '13.5px "Kalam", cursive', color: INK2, display: "flex", alignItems: "center", gap: 7 }}>
        Intermedias (2)
        <span style={{ width: 34, height: 18, borderRadius: 999, border: `2px solid ${INK}`, position: "relative", background: CARD }}>
          <span style={{ position: "absolute", top: 1, left: 1, width: 14, height: 14, borderRadius: 9, background: INK3 }} />
        </span>
      </span>
      {extra}
    </div>
  );
}

// ---------- Variant A: cards with relation badges + mini map ----------
function HomeA() {
  return (
    <div>
      <VariantHead letter="A" title="Cards con badges de relación"
        desc="Cada dataset es una card; las relaciones aparecen como chip naranja contable ('2 rel'), las calculadas en magenta con ƒ, y las intermedias marcadas. Debajo, un mini-mapa de relaciones opcional."
        axis="relaciones: chips + color" />
      <div style={{ position: "relative" }}>
        <Frame label="opsgrid.app /" h={560}>
          <div style={{ padding: "20px 26px", height: "100%", overflow: "hidden" }}>
            <HomeToolbar />
            <SubToolbar />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 13 }}>
              {DATASETS.map((d, i) => (
                <Box key={i} pad={13} style={{ minHeight: 104 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ width: 32, height: 32, display: "grid", placeItems: "center", border: `2px solid ${kindColor(d.kind)}`, borderRadius: "10px 7px 10px 7px", color: kindColor(d.kind) }}>{d.g}</span>
                    <G c="⋯" color={INK3} />
                  </div>
                  <div style={{ font: '600 16px "Kalam", cursive', color: INK, marginTop: 9 }}>{d.name}</div>
                  <div style={{ font: '11px "JetBrains Mono", monospace', color: INK3, marginTop: 2 }}>{d.code}</div>
                  <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}>
                    <Chip sm accent={INK2}>{d.cols} col</Chip>
                    <Chip sm accent={INK2}>{d.rows} filas</Chip>
                    {d.kind === "calc"   && <Chip sm accent={CALC} fill="#e436b614" dot>calculado</Chip>}
                    {d.kind === "bridge" && <Chip sm accent={REL} fill="#ff6a1814">intermedia</Chip>}
                    {d.rel > 0 && d.kind !== "bridge" && <Chip sm accent={REL} fill="#ff6a1814" dot>{d.rel} rel</Chip>}
                  </div>
                </Box>
              ))}
              <Box dashed accent={INK3} pad={13} style={{ minHeight: 104, display: "grid", placeItems: "center" }}>
                <div style={{ textAlign: "center", color: INK2 }}>
                  <G c="＋" size={26} color={INK3} />
                  <div style={{ font: '15px "Kalam", cursive', marginTop: 6 }}>Nuevo dataset</div>
                </div>
              </Box>
            </div>
            <div style={{ font: '14px "Kalam", cursive', color: INK2, margin: "16px 0 8px" }}>Mapa de relaciones</div>
            <Box pad={12} fill={PAPER}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, font: '14px "Kalam", cursive', color: INK }}>
                <Chip accent={PRI}>Clientes</Chip>
                <span style={{ color: REL }}>──&lt;</span>
                <Chip accent={REL} fill="#ff6a1810">Pedidos</Chip>
                <span style={{ color: REL }}>&gt;──</span>
                <Chip accent={REL} fill="#ff6a1810">Detalle</Chip>
                <span style={{ color: REL }}>──</span>
                <Chip accent={PRI}>Producto</Chip>
              </div>
            </Box>
          </div>
        </Frame>
        <Note rot={3} w={185} color={REL} style={{ position: "absolute", top: 150, right: -185 }}
          arrow={{ glyph: "↰", pos: { left: -22, top: 0 } }}>
          Naranja = relación. Lectura rápida sin abrir nada.
        </Note>
      </div>
    </div>
  );
}

// ---------- Variant B: relationship graph (cards as nodes) ----------
function HomeB() {
  const nodes = [
    { name: "Clientes", x: 60,  y: 40,  c: PRI },
    { name: "Pedidos",  x: 300, y: 40,  c: REL },
    { name: "Detalle",  x: 300, y: 170, c: REL },
    { name: "Producto", x: 540, y: 170, c: PRI },
    { name: "Ventas x mes", x: 60, y: 170, c: CALC, calc: true },
  ];
  return (
    <div>
      <VariantHead letter="B" title="Mapa-grafo (cards = nodos)"
        desc="Las relaciones SON la vista: los datasets son nodos conectados por aristas naranjas (—&lt; 1:N, &gt;—&lt; N:N). Ideal cuando el valor del producto es entender cómo se conecta todo. Las calculadas flotan aparte."
        axis="relaciones: grafo + aristas" />
      <div style={{ position: "relative" }}>
        <Frame label="opsgrid.app /" h={560}>
          <div style={{ padding: "20px 26px", height: "100%", overflow: "hidden" }}>
            <HomeToolbar />
            <SubToolbar extra={<Btn sm solid accent={PRI} style={{ marginLeft: 8 }}>◇ Vista grafo</Btn>} />
            <Box pad={0} fill={PAPER} style={{ height: 300, position: "relative", overflow: "hidden" }}>
              <svg width="100%" height="100%" viewBox="0 0 760 300" style={{ position: "absolute", inset: 0 }}>
                <defs>
                  <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1.3" fill="#cdc8bd" />
                  </pattern>
                </defs>
                <rect width="760" height="300" fill="url(#dots)" />
                {/* edges */}
                <path d="M210 70 C 260 70, 250 70, 300 70" stroke={REL} strokeWidth="2.5" fill="none" />
                <path d="M360 100 C 360 140, 360 140, 360 170" stroke={REL} strokeWidth="2.5" fill="none" strokeDasharray="1" />
                <path d="M450 200 C 500 200, 490 200, 540 200" stroke={REL} strokeWidth="2.5" fill="none" />
                <text x="250" y="60" fill={REL} fontFamily="Caveat, cursive" fontSize="17">1:N</text>
                <text x="368" y="150" fill={REL} fontFamily="Caveat, cursive" fontSize="17">N:N</text>
              </svg>
              {nodes.map((n, i) => (
                <div key={i} style={{
                  position: "absolute", left: n.x, top: n.y, width: 150,
                  border: `2px ${n.calc ? "dashed" : "solid"} ${n.c}`, borderRadius: "11px 8px 11px 8px",
                  background: CARD, padding: "10px 12px", boxShadow: "2px 3px 0 rgba(43,42,39,0.14)",
                }}>
                  <div style={{ font: '600 15px "Kalam", cursive', color: INK, display: "flex", alignItems: "center", gap: 6 }}>
                    <G c={n.calc ? "ƒ" : "▦"} color={n.c} /> {n.name}
                  </div>
                  <div style={{ font: '12px "Kalam", cursive', color: INK2, marginTop: 3 }}>{n.calc ? "calculado" : "tabla"}</div>
                </div>
              ))}
            </Box>
            <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "center" }}>
              <LegendItem color={PRI} label="tabla" />
              <LegendItem color={REL} label="relación" />
              <LegendItem color={CALC} label="calculada" />
              <span style={{ flex: 1 }} />
              <span style={{ font: '13.5px "Kalam", cursive', color: INK2 }}>Arrastra para reordenar · doble-click abre el dataset</span>
            </div>
          </div>
        </Frame>
        <Note rot={-3} w={195} color={REL} style={{ position: "absolute", top: 150, right: -195 }}
          arrow={{ glyph: "↰", pos: { left: -24, top: 2 } }}>
          Las aristas son el contenido. Genial para "¿cómo se relaciona todo?".
        </Note>
        <Note rot={2} w={185} style={{ position: "absolute", bottom: 60, right: -185 }}>
          Compromiso: peor para escanear filas/columnas de un vistazo.
        </Note>
      </div>
    </div>
  );
}

// ---------- Variant C: dense table list ----------
function HomeC() {
  return (
    <div>
      <VariantHead letter="C" title="Lista densa (tabla)"
        desc="Para workspaces con muchos datasets: una fila por tabla, con una columna 'Relaciona con' que muestra chips naranjas hacia las otras tablas. Ordenable, escaneable, y la card-grid queda como toggle."
        axis="relaciones: chips en columna" />
      <div style={{ position: "relative" }}>
        <Frame label="opsgrid.app /" h={560}>
          <div style={{ padding: "20px 26px", height: "100%", overflow: "hidden" }}>
            <HomeToolbar />
            <SubToolbar extra={
              <span style={{ display: "inline-flex", border: `2px solid ${INK}`, borderRadius: 9, overflow: "hidden", marginLeft: 8 }}>
                <span style={{ font: '13px "Kalam", cursive', padding: "6px 10px", background: CARD, color: INK2 }}>▦ Cards</span>
                <span style={{ font: '13px "Kalam", cursive', padding: "6px 10px", background: PRI, color: "#fff" }}>☰ Lista</span>
              </span>
            } />
            <Box pad={0} style={{ overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "26px 1.4fr 0.7fr 0.6fr 2fr 40px", alignItems: "center", padding: "10px 14px", borderBottom: `2px solid ${INK}`, background: PAPER, font: '13px "Kalam", cursive', color: INK2 }}>
                <span></span><span>Dataset ↑</span><span>Tipo</span><span>Filas</span><span>Relaciona con</span><span></span>
              </div>
              {DATASETS.map((d, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 1.4fr 0.7fr 0.6fr 2fr 40px", alignItems: "center", padding: "11px 14px", borderBottom: i < DATASETS.length - 1 ? `1.5px solid #e6e0d4` : "none", font: '14.5px "Kalam", cursive', color: INK }}>
                  <G c={d.g} color={kindColor(d.kind)} size={17} />
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontWeight: 600 }}>{d.name}</span>
                    <span style={{ font: '10.5px "JetBrains Mono", monospace', color: INK3 }}>{d.code}</span>
                  </span>
                  <span>
                    {d.kind === "calc" ? <Chip sm accent={CALC} fill="#e436b614" dot>ƒ calc.</Chip>
                      : d.kind === "bridge" ? <Chip sm accent={REL} fill="#ff6a1814">intermedia</Chip>
                      : <Chip sm accent={INK2}>tabla</Chip>}
                  </span>
                  <span style={{ font: '13px "JetBrains Mono", monospace', color: INK2 }}>{d.rows}</span>
                  <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {d.name === "Pedidos" && (<><Chip sm accent={REL} fill="#ff6a1810">→ Clientes</Chip><Chip sm accent={REL} fill="#ff6a1810">→ Detalle</Chip></>)}
                    {d.name === "Detalle" && (<><Chip sm accent={REL} fill="#ff6a1810">→ Producto</Chip></>)}
                    {d.name === "Pedido↔Prod" && (<><Chip sm accent={REL} fill="#ff6a1810">↔ Pedidos</Chip><Chip sm accent={REL} fill="#ff6a1810">↔ Producto</Chip></>)}
                    {(d.rel === 0 && d.kind !== "bridge") && <span style={{ color: INK3 }}>—</span>}
                  </span>
                  <G c="⋯" color={INK3} />
                </div>
              ))}
            </Box>
            <div style={{ font: '13.5px "Kalam", cursive', color: INK2, marginTop: 12 }}>6 datasets · click una fila para abrir · ⛓ = tabla intermedia</div>
          </div>
        </Frame>
        <Note rot={3} w={190} style={{ position: "absolute", top: 150, right: -190 }}
          arrow={{ glyph: "↰", pos: { left: -22, top: 0 } }}>
          Escala a 50+ datasets sin scroll infinito de cards. Las flechas indican dirección de la FK.
        </Note>
      </div>
    </div>
  );
}

Object.assign(window, { HomeA, HomeB, HomeC });

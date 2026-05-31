// wf-shell.jsx — AppShell: 3 structural approaches (exploring shell structure)

const NAV = [
  { g: "▦", label: "Datasets", on: true },
  { g: "ƒ", label: "Scripts", badge: 3, accent: CALC },
  { g: "◌", label: "Personas", mgr: true },
  { g: "▢", label: "Workspaces", mgr: true },
  { g: "◷", label: "Auditoría", adm: true },
  { g: "◉", label: "Facturación", mgr: true },
];

// faux content for the canvas so the shell reads as a real screen
function CanvasStub({ tight }) {
  return (
    <div style={{ padding: tight ? "20px 26px" : "22px 30px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ font: '700 21px "Kalam", cursive', color: INK }}>▦ Ventas · 6 datasets</div>
          <Scribble w="240px" style={{ marginTop: 8 }} />
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <Btn sm ghost>⌁ Detectar relaciones</Btn>
          <Btn sm solid accent={PRI}>+ Nuevo dataset</Btn>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 13 }}>
        {[["▦","Clientes",REL,"7 col · 0 rel"],["▦","Pedidos",REL,"6 col · 2 rel"],
          ["ƒ","Ventas x mes",CALC,"calculado"],["▦","Detalle",REL,"5 col · 1 rel"],
          ["▦","Producto",REL,"4 col · 0 rel"],["＋","Nuevo dataset",INK3,""]].map((c, i) => (
          <Box key={i} pad={13} dashed={c[1].startsWith("Nuevo")} style={{ minHeight: 78 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <G c={c[0]} color={c[2]} size={19} />
              {!c[1].startsWith("Nuevo") && <G c="⋯" color={INK3} />}
            </div>
            <div style={{ font: '600 16px "Kalam", cursive', color: INK, marginTop: 6 }}>{c[1]}</div>
            {c[3] && <div style={{ font: '13px "Kalam", cursive', color: INK2, marginTop: 3 }}>{c[3]}</div>}
          </Box>
        ))}
      </div>
    </div>
  );
}

function Topbar({ horizontalNav, showHamburger }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "0 16px", height: 54, borderBottom: `2px solid ${INK}`, background: CARD,
    }}>
      {showHamburger && <G c="☰" size={20} />}
      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 24, height: 24, border: `2px solid ${PRI}`, borderRadius: "8px 5px 8px 5px", display: "grid", placeItems: "center", color: PRI, fontWeight: 700 }}>◧</span>
        <span style={{ font: '700 18px "Kalam", cursive', color: INK }}>OpsGrid</span>
      </span>
      <WsSwitcher />
      {horizontalNav && (
        <span style={{ display: "flex", gap: 4, marginLeft: 6 }}>
          {NAV.map((n, i) => (
            <span key={i} style={{
              font: '14.5px "Kalam", cursive', padding: "6px 11px", borderRadius: 8,
              color: n.on ? PRI : INK2, background: n.on ? "#1e4cff14" : "transparent",
              border: n.on ? `1.5px solid ${PRI}` : "1.5px solid transparent",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>{n.g} {n.label}{n.badge && <Chip sm accent={n.accent}>{n.badge}</Chip>}</span>
          ))}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 20 }}>
        {!horizontalNav && (
          <Field ph="🔍  Buscar dataset, registro…" w="min(360px, 100%)" />
        )}
      </div>
      <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
        {horizontalNav && <G c="⌘K" size={13} style={{ border: `1.5px solid ${INK3}`, padding: "5px 8px", borderRadius: 7, color: INK2 }} />}
        <G c="◐" size={17} /><G c="🔔" size={15} /><G c="⚙" size={16} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `2px solid ${INK}`, borderRadius: 999, padding: "3px 10px 3px 3px" }}>
          <span style={{ width: 24, height: 24, borderRadius: 999, background: `linear-gradient(135deg,${PRI},${VIOLET})` }} />
          <span style={{ font: '14px "Kalam", cursive', color: INK }}>Ana</span>
          <Chip sm accent={VIOLET} fill="#7a5ae014">admin</Chip>
        </span>
      </span>
    </div>
  );
}

function WsSwitcher() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `2px solid ${INK}`, borderRadius: "10px 7px 10px 7px", padding: "5px 10px", background: CARD }}>
      <span style={{ width: 22, height: 22, borderRadius: 6, background: `linear-gradient(135deg,${REL},${WARN})` }} />
      <span style={{ font: '15px "Kalam", cursive', color: INK }}>Ventas</span>
      <Chip sm accent={VIOLET} fill="#7a5ae014">owner</Chip>
      <G c="▾" color={INK2} size={13} />
    </span>
  );
}

function FullSidebar() {
  return (
    <div style={{ width: 218, flex: "none", borderRight: `2px solid ${INK}`, background: PAPER, display: "flex", flexDirection: "column", padding: "16px 13px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {NAV.map((n, i) => (
          <span key={i} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "9px 11px",
            borderRadius: "9px 7px 9px 7px",
            background: n.on ? CARD : "transparent",
            border: n.on ? `2px solid ${INK}` : "2px solid transparent",
            boxShadow: n.on ? "1.5px 2px 0 rgba(43,42,39,0.13)" : "none",
            font: '15px "Kalam", cursive', color: n.on ? INK : INK2,
          }}>
            <G c={n.g} color={n.on ? PRI : INK2} size={17} />
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.badge && <Chip sm accent={n.accent} fill={`${n.accent}14`}>{n.badge}</Chip>}
            {n.mgr && <span style={{ font: '11px "Kalam", cursive', color: INK3 }}>★</span>}
            {n.adm && <span style={{ font: '11px "Kalam", cursive', color: INK3 }}>★★</span>}
          </span>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <Box dashed accent={PRI} pad={12} style={{ marginBottom: 11 }}>
        <div style={{ font: '600 14px "Kalam", cursive', color: INK }}>Plan Free</div>
        <div style={{ font: '12.5px/1.3 "Kalam", cursive', color: INK2, margin: "3px 0 8px" }}>Suscríbete a Pro para scripts y más límites.</div>
        <Btn sm solid accent={PRI} style={{ width: "100%", justifyContent: "center" }}>Ver planes</Btn>
      </Box>
      <span style={{ font: '14px "Kalam", cursive', color: DANGER, display: "flex", gap: 8, alignItems: "center", padding: "4px 11px" }}>⎋ Cerrar sesión</span>
    </div>
  );
}

function RailSidebar() {
  return (
    <div style={{ width: 60, flex: "none", borderRight: `2px solid ${INK}`, background: PAPER, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", gap: 5 }}>
      {NAV.map((n, i) => (
        <span key={i} style={{
          position: "relative", width: 42, height: 42, display: "grid", placeItems: "center",
          borderRadius: "11px 8px 11px 8px",
          background: n.on ? CARD : "transparent",
          border: n.on ? `2px solid ${INK}` : "2px solid transparent",
          boxShadow: n.on ? "1.5px 2px 0 rgba(43,42,39,0.13)" : "none",
        }}>
          <G c={n.g} color={n.on ? PRI : INK2} size={18} />
          {n.badge && <span style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: 9, background: n.accent, color: "#fff", font: '10px/16px "Kalam", cursive', textAlign: "center" }}>{n.badge}</span>}
        </span>
      ))}
      <div style={{ flex: 1 }} />
      <span style={{ width: 42, height: 42, display: "grid", placeItems: "center", border: `2px dashed ${PRI}`, borderRadius: "11px 8px 11px 8px", color: PRI }}>↑</span>
      <span style={{ width: 42, height: 42, display: "grid", placeItems: "center", color: DANGER }}>⎋</span>
    </div>
  );
}

// ---- the three variants --------------------------------------------------

function ShellA() {
  return (
    <div>
      <VariantHead letter="A" title="Sidebar fijo + topbar"
        desc="Patrón clásico de app de datos (Airtable/Linear). Nav persistente a la izquierda siempre visible; topbar con switcher de workspace, búsqueda y usuario. Predecible, fácil de orientarse."
        axis="estructura del shell" />
      <div style={{ position: "relative" }}>
        <Frame label="opsgrid.app / Datasets" h={560}>
          <Topbar />
          <div style={{ display: "flex", height: "calc(100% - 54px)" }}>
            <FullSidebar />
            <div style={{ flex: 1, overflow: "hidden" }}><CanvasStub /></div>
          </div>
        </Frame>
        <Note rot={3} w={210} style={{ position: "absolute", top: 120, right: -210 }}
          arrow={{ glyph: "↰", pos: { left: -26, top: 4 } }}>
          ★ = solo managers · ★★ = solo admin global. La nav muestra todo y atenúa lo bloqueado.
        </Note>
        <Note rot={-2} w={185} color={PRI} style={{ position: "absolute", bottom: 30, right: -185 }}>
          Tarjeta de upgrade anclada al pie del sidebar.
        </Note>
      </div>
    </div>
  );
}

function ShellB() {
  return (
    <div>
      <VariantHead letter="B" title="Rail colapsable (solo iconos)"
        desc="Sidebar reducido a un riel de iconos de 60px que se expande al pasar el cursor. Maximiza el lienzo para la grilla densa y las matrices — el contenido es el protagonista."
        axis="estructura del shell" />
      <div style={{ position: "relative" }}>
        <Frame label="opsgrid.app / Datasets" h={560}>
          <Topbar />
          <div style={{ display: "flex", height: "calc(100% - 54px)" }}>
            <RailSidebar />
            <div style={{ flex: 1, overflow: "hidden" }}><CanvasStub /></div>
          </div>
        </Frame>
        {/* hover flyout mock */}
        <div style={{ position: "absolute", left: 70, top: 150, width: 168, transform: "rotate(-1deg)", zIndex: 5 }}>
          <Box accent={PRI} pad={10} style={{ background: CARD }}>
            <div style={{ font: '12px "Caveat", cursive', color: PRI, marginBottom: 6 }}>al pasar el cursor →</div>
            {NAV.slice(0, 4).map((n, i) => (
              <div key={i} style={{ display: "flex", gap: 8, font: '14px "Kalam", cursive', color: INK, padding: "4px 0" }}>
                <G c={n.g} color={n.on ? PRI : INK2} /> {n.label}
              </div>
            ))}
          </Box>
        </div>
        <Note rot={2} w={195} style={{ position: "absolute", bottom: 40, right: -195 }}
          arrow={{ glyph: "↰", pos: { left: -24, top: 2 } }}>
          +160px de ancho útil para tablas anchas con columnas congeladas.
        </Note>
      </div>
    </div>
  );
}

function ShellC() {
  return (
    <div>
      <VariantHead letter="C" title="Topbar de ancho completo + ⌘K"
        desc="Sin sidebar: la navegación vive en una barra horizontal y todo lo demás se alcanza con la paleta de comandos (⌘K). Máximo lienzo, ideal si el workspace switcher manda el contexto."
        axis="estructura del shell" />
      <div style={{ position: "relative" }}>
        <Frame label="opsgrid.app / Datasets" h={560}>
          <Topbar horizontalNav />
          <div style={{ height: "calc(100% - 54px)", overflow: "hidden" }}><CanvasStub /></div>
        </Frame>
        <Note rot={-3} w={210} color={PRI} style={{ position: "absolute", top: 70, right: -210 }}
          arrow={{ glyph: "↑", pos: { left: 30, top: -22 } }}>
          La paleta ⌘K reemplaza enlaces poco usados (Auditoría, Facturación) sin gastar espacio.
        </Note>
        <Note rot={2} w={200} style={{ position: "absolute", bottom: 26, right: -200 }}>
          Riesgo: con muchos workspaces la nav horizontal se aprieta. Mejor para cuentas chicas.
        </Note>
      </div>
    </div>
  );
}

Object.assign(window, { ShellA, ShellB, ShellC });

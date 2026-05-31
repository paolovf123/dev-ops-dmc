// wf-matrix.jsx — AdminPeople / access matrix: 3 approaches

const ROLES = ["Sin acceso", "Ver", "Editar", "Admin"];
const ROLE_C = { "Sin acceso": INK3, "Ver": PRI, "Editar": OK, "Admin": VIOLET };
const ROLE_FILL = { "Sin acceso": "transparent", "Ver": "#1e4cff1a", "Editar": "#0fb5831f", "Admin": "#7a5ae022" };

const GROUPS = ["Ventas", "Operaciones", "Gerencia", "Finanzas"];
const DSETS = ["Clientes", "Pedidos", "Detalle", "Producto", "Ventas x mes"];
// matrix[dataset][group] = role index
const M = {
  "Clientes":     [2, 1, 3, 0],
  "Pedidos":      [2, 1, 3, 1],
  "Detalle":      [1, 2, 3, 0],
  "Producto":     [1, 1, 3, 1],
  "Ventas x mes": [1, 0, 3, 0],
};

function PeopleHead({ activeTab = "Accesos a datasets" }) {
  const tabs = ["Usuarios del sistema", "Miembros", "Grupos", "Accesos a datasets"];
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ font: '700 22px "Kalam", cursive', color: INK, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
            <G c="◌" color={PRI} size={20} /> Personas y accesos
          </div>
          <div style={{ font: '14px "Kalam", cursive', color: INK2, marginTop: 4, whiteSpace: "nowrap" }}>Gestiona quién ve y edita cada dataset.</div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `2px solid ${INK}`, borderRadius: "10px 7px 10px 7px", padding: "6px 11px", background: CARD }}>
          <span style={{ font: '13px "Kalam", cursive', color: INK2 }}>Workspace</span>
          <span style={{ font: '15px "Kalam", cursive', color: INK }}>Ventas</span>
          <G c="▾" color={INK2} size={13} />
        </span>
      </div>
      <div style={{ display: "flex", gap: 4, borderBottom: `2px solid ${INK}`, marginBottom: 16 }}>
        {tabs.map((t, i) => (
          <span key={i} style={{
            font: '14.5px "Kalam", cursive', padding: "8px 13px",
            color: t === activeTab ? INK : INK2,
            borderBottom: t === activeTab ? `3px solid ${PRI}` : "3px solid transparent",
            marginBottom: -2, fontWeight: t === activeTab ? 600 : 400, whiteSpace: "nowrap",
          }}>{t}</span>
        ))}
      </div>
    </>
  );
}

function Segmented({ active, compact }) {
  const labels = compact ? ["—", "Ver", "Editar", "Admin"] : ROLES;
  return (
    <span style={{ display: "inline-flex", border: `2px solid ${INK}`, borderRadius: 8, overflow: "hidden" }}>
      {labels.map((r, i) => (
        <span key={i} style={{
          font: `${compact ? 12 : 12.5}px "Kalam", cursive`, padding: compact ? "5px 8px" : "5px 9px", whiteSpace: "nowrap",
          color: i === active ? "#fff" : INK2,
          background: i === active ? ROLE_C[ROLES[i]] : CARD,
          borderRight: i < labels.length - 1 ? `1.5px solid ${INK}` : "none",
        }}>{r}</span>
      ))}
    </span>
  );
}

// ---------- Variant A: segmented-per-cell matrix ----------
function MatrixA() {
  const rows = ["Clientes", "Pedidos", "Detalle"];
  return (
    <div>
      <VariantHead letter="A" title="Matriz con control segmentado por celda"
        desc="Cada celda dataset × grupo es un control 'Sin acceso / Ver / Editar / Admin'. Explícito y directo de auditar; cada cambio es una mutación optimista. Funciona con pocos datasets/grupos."
        axis="permisos: segmented inline" />
      <div style={{ position: "relative" }}>
        <Frame label="opsgrid.app / admin / accesos" h={500}>
          <div style={{ padding: "20px 26px" }}>
            <PeopleHead />
            <Box pad={0} style={{ overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "150px repeat(3, 1fr)", borderBottom: `2px solid ${INK}`, background: PAPER }}>
                <span style={{ font: '13px "Kalam", cursive', color: INK2, padding: "11px 14px" }}>Dataset \ Grupo</span>
                {GROUPS.slice(0, 3).map((g, i) => (
                  <span key={i} style={{ font: '14px "Kalam", cursive', color: INK, fontWeight: 600, padding: "11px 10px", borderLeft: `1.5px solid #e6e0d4` }}>{g}</span>
                ))}
              </div>
              {rows.map((ds, ri) => (
                <div key={ri} style={{ display: "grid", gridTemplateColumns: "150px repeat(3, 1fr)", borderBottom: ri < rows.length - 1 ? `1.5px solid #e6e0d4` : "none", alignItems: "center" }}>
                  <span style={{ font: '14.5px "Kalam", cursive', color: INK, fontWeight: 600, padding: "13px 14px", display: "flex", gap: 6, alignItems: "center" }}><G c="▦" color={PRI} size={15} />{ds}</span>
                  {M[ds].slice(0, 3).map((r, ci) => (
                    <span key={ci} style={{ padding: "10px 10px", borderLeft: `1.5px solid #e6e0d4` }}><Segmented active={r} compact /></span>
                  ))}
                </div>
              ))}
            </Box>
            <div style={{ font: '13.5px "Kalam", cursive', color: INK2, marginTop: 12, display: "flex", gap: 14 }}>
              <span>— = sin acceso</span>
              <span>● cambio guardado al instante</span>
              <span style={{ color: DANGER }}>⚠ no puedes quitar el rol al único admin</span>
            </div>
          </div>
        </Frame>
        <Note rot={3} w={195} style={{ position: "absolute", top: 150, right: -195 }}
          arrow={{ glyph: "↰", pos: { left: -22, top: 0 } }}>
          Cada celda dice exactamente qué puede hacer cada grupo. Cero ambigüedad.
        </Note>
        <Note rot={-2} w={180} color={DANGER} style={{ position: "absolute", bottom: 60, right: -180 }}>
          No escala bien: con 4+ grupos o muchos datasets se aprieta enseguida.
        </Note>
      </div>
    </div>
  );
}

// ---------- Variant B: heatmap matrix ----------
function MatrixB() {
  return (
    <div>
      <VariantHead letter="B" title="Heatmap compacto"
        desc="Misma matriz pero cada celda es un solo bloque coloreado por nivel de rol (gris→azul→verde→violeta). Click cicla o abre un mini-menú. Densísimo: ves decenas de datasets × grupos de un vistazo."
        axis="permisos: intensidad de color" />
      <div style={{ position: "relative" }}>
        <Frame label="opsgrid.app / admin / accesos" h={500}>
          <div style={{ padding: "20px 26px" }}>
            <PeopleHead />
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              <Box pad={0} style={{ overflow: "hidden", flex: 1 }}>
                <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${GROUPS.length}, 1fr)`, background: PAPER, borderBottom: `2px solid ${INK}` }}>
                  <span style={{ padding: "10px 14px" }}></span>
                  {GROUPS.map((g, i) => (
                    <span key={i} style={{ font: '13.5px "Kalam", cursive', color: INK, fontWeight: 600, padding: "10px 6px", textAlign: "center", borderLeft: `1.5px solid #e6e0d4` }}>{g}</span>
                  ))}
                </div>
                {DSETS.map((ds, ri) => (
                  <div key={ri} style={{ display: "grid", gridTemplateColumns: `160px repeat(${GROUPS.length}, 1fr)`, borderBottom: ri < DSETS.length - 1 ? `1.5px solid #e6e0d4` : "none" }}>
                    <span style={{ font: '14px "Kalam", cursive', color: INK, padding: "0 14px", display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                      <G c={ds.startsWith("Ventas") ? "ƒ" : "▦"} color={ds.startsWith("Ventas") ? CALC : PRI} size={14} />{ds}
                    </span>
                    {M[ds].map((r, ci) => (
                      <span key={ci} style={{ borderLeft: `1.5px solid #e6e0d4`, padding: 6 }}>
                        <span style={{ display: "grid", placeItems: "center", height: 36, borderRadius: 7, background: ROLE_FILL[ROLES[r]], border: `1.5px solid ${r === 0 ? "#e6e0d4" : ROLE_C[ROLES[r]]}`, font: '12.5px "Kalam", cursive', color: r === 0 ? INK3 : ROLE_C[ROLES[r]] }}>
                          {r === 0 ? "—" : ROLES[r]}
                        </span>
                      </span>
                    ))}
                  </div>
                ))}
              </Box>
              <Box pad={13} fill={PAPER} style={{ width: 150, flex: "none" }}>
                <div style={{ font: '14px "Kalam", cursive', color: INK, fontWeight: 600, marginBottom: 9 }}>Leyenda</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {ROLES.map((r, i) => <LegendItem key={i} color={i === 0 ? "#e6e0d4" : ROLE_C[r]} label={r} />)}
                </div>
                <div style={{ font: '12.5px/1.3 "Caveat", cursive', color: INK2, marginTop: 12 }}>click cicla · shift-click abre menú</div>
              </Box>
            </div>
          </div>
        </Frame>
        <Note rot={-3} w={195} color={VIOLET} style={{ position: "absolute", top: 150, right: -195 }}
          arrow={{ glyph: "↑", pos: { left: 40, top: -22 } }}>
          Patrones saltan a la vista: la fila/columna que está "toda violeta" = demasiado acceso.
        </Note>
      </div>
    </div>
  );
}

// ---------- Variant C: focused per-dataset list ----------
function MatrixC() {
  const subjects = [
    { name: "Ventas", type: "grupo", role: 2 },
    { name: "Operaciones", type: "grupo", role: 1 },
    { name: "Gerencia", type: "grupo", role: 3 },
    { name: "Ana G.", type: "directo", role: 3, lock: true },
    { name: "Carlos M.", type: "directo", role: 0 },
  ];
  return (
    <div>
      <VariantHead letter="C" title="Lista enfocada por dataset"
        desc="En vez de una grilla, eliges un dataset a la izquierda y a la derecha ves la lista de sujetos (grupos y usuarios) con un dropdown de rol cada uno. Distingue permiso directo vs de grupo, y deja respirar cada decisión."
        axis="permisos: master-detail" />
      <div style={{ position: "relative" }}>
        <Frame label="opsgrid.app / admin / accesos" h={500}>
          <div style={{ padding: "20px 26px" }}>
            <PeopleHead />
            <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
              <Box pad={0} style={{ width: 175, flex: "none", overflow: "hidden" }}>
                <div style={{ font: '13px "Kalam", cursive', color: INK2, padding: "10px 13px", borderBottom: `2px solid ${INK}`, background: PAPER }}>Datasets</div>
                {DSETS.map((ds, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 7, padding: "10px 13px",
                    borderBottom: i < DSETS.length - 1 ? `1.5px solid #e6e0d4` : "none",
                    background: i === 1 ? "#1e4cff10" : "transparent",
                    borderLeft: i === 1 ? `3px solid ${PRI}` : "3px solid transparent",
                    font: '14.5px "Kalam", cursive', color: INK, fontWeight: i === 1 ? 600 : 400,
                  }}>
                    <G c={ds.startsWith("Ventas") ? "ƒ" : "▦"} color={ds.startsWith("Ventas") ? CALC : PRI} size={14} />{ds}
                  </div>
                ))}
              </Box>
              <Box pad={16} style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ font: '600 18px "Kalam", cursive', color: INK, display: "flex", gap: 7, alignItems: "center" }}><G c="▦" color={PRI} />Pedidos · accesos</div>
                  <Btn sm ghost accent={PRI}>+ Agregar sujeto</Btn>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {subjects.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, paddingBottom: 10, borderBottom: i < subjects.length - 1 ? `1.5px solid #ece6da` : "none" }}>
                      <span style={{ width: 30, height: 30, borderRadius: s.type === "grupo" ? 8 : 999, background: `linear-gradient(135deg,${PRI},${VIOLET})`, flex: "none" }} />
                      <span style={{ flex: 1 }}>
                        <span style={{ font: '15px "Kalam", cursive', color: INK, fontWeight: 600 }}>{s.name}</span>
                        <span style={{ font: '12px "Kalam", cursive', color: INK2, marginLeft: 8 }}>
                          <Chip sm accent={s.type === "grupo" ? INK2 : REL}>{s.type === "grupo" ? "grupo" : "directo"}</Chip>
                        </span>
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `2px solid ${ROLE_C[ROLES[s.role]]}`, borderRadius: 8, padding: "5px 11px", color: ROLE_C[ROLES[s.role]], background: ROLE_FILL[ROLES[s.role]], font: '13.5px "Kalam", cursive' }}>
                        {ROLES[s.role]} <G c="▾" color={ROLE_C[ROLES[s.role]]} size={12} />
                      </span>
                      {s.lock && <G c="🔒" size={13} style={{ opacity: 0.6 }} />}
                    </div>
                  ))}
                </div>
              </Box>
            </div>
          </div>
        </Frame>
        <Note rot={3} w={185} color={REL} style={{ position: "absolute", top: 155, right: -185 }}
          arrow={{ glyph: "↰", pos: { left: -22, top: 0 } }}>
          Muestra la PRIORIDAD: directo &gt; grupo. El 🔒 = único admin, no se puede quitar.
        </Note>
        <Note rot={-2} w={180} style={{ position: "absolute", bottom: 50, right: -180 }}>
          Mejor para móvil y para explicar "por qué" alguien tiene acceso.
        </Note>
      </div>
    </div>
  );
}

Object.assign(window, { MatrixA, MatrixB, MatrixC });

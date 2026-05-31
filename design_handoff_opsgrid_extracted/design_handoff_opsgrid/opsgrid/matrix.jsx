// matrix.jsx — AdminPeople · "Accesos a datasets" (variant B: interactive heatmap)

const ROLE_META = [
  { key: "none",   label: "Sin acceso", short: "—",      fg: "var(--text-mute)", bg: "var(--surface-alt)", bd: "var(--border)" },
  { key: "view",   label: "Ver",        short: "Ver",    fg: "var(--accent-pri)", bg: "var(--pri-soft)",   bd: "color-mix(in srgb, var(--accent-pri) 32%, transparent)" },
  { key: "edit",   label: "Editar",     short: "Editar", fg: "var(--success)",    bg: "var(--success-soft)", bd: "color-mix(in srgb, var(--success) 36%, transparent)" },
  { key: "admin",  label: "Admin",      short: "Admin",  fg: "var(--violet)",     bg: "var(--violet-soft)",  bd: "color-mix(in srgb, var(--violet) 36%, transparent)" },
];

const M_GROUPS = [
  { name: "Ventas", members: 8 },
  { name: "Operaciones", members: 5 },
  { name: "Gerencia", members: 3 },
  { name: "Finanzas", members: 4 },
];
const M_DSETS = [
  { name: "Clientes", kind: "real" },
  { name: "Pedidos", kind: "real" },
  { name: "Detalle", kind: "real" },
  { name: "Producto", kind: "real" },
  { name: "Ventas x mes", kind: "calc" },
];
// initial roles [dataset][group]
const INIT = [
  [2, 1, 3, 0],
  [2, 1, 3, 1],
  [1, 2, 3, 0],
  [1, 1, 3, 1],
  [1, 0, 3, 0],
];

function MTabs() {
  const tabs = [
    { label: "Usuarios del sistema", adm: true },
    { label: "Miembros" },
    { label: "Grupos" },
    { label: "Accesos a datasets", on: true },
  ];
  return (
    <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: 22 }}>
      {tabs.map((t, i) => (
        <button key={i} style={{
          font: `${t.on ? 600 : 500} 13.5px/1 var(--font-sans)`, padding: "11px 14px",
          color: t.on ? "var(--text)" : "var(--text-soft)", background: "transparent", border: "none", cursor: "pointer",
          borderBottom: t.on ? "2px solid var(--accent-pri)" : "2px solid transparent", marginBottom: -1,
          display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        }}>
          {t.label}{t.adm && <span style={{ font: "10px/1 var(--font-sans)", color: "var(--text-mute)" }}>★★</span>}
        </button>
      ))}
    </div>
  );
}

function HeatCell({ role, onClick }) {
  const m = ROLE_META[role];
  return (
    <button onClick={onClick} className="og-heatcell" style={{
      width: "100%", height: "var(--row-h)", minHeight: 34, borderRadius: "var(--r-2)", cursor: "pointer",
      background: m.bg, color: m.fg, border: `1px solid ${m.bd}`,
      font: "600 12.5px/1 var(--font-sans)", display: "grid", placeItems: "center",
      transition: "all var(--t-fast)",
    }}>{m.short}</button>
  );
}

function Matrix() {
  const [mode, setMode] = useState("groups");
  const [grid, setGrid] = useState(INIT);
  const cycle = (di, gi) => setGrid(g => g.map((row, r) => r === di ? row.map((v, c) => c === gi ? (v + 1) % 4 : v) : row));
  const cols = M_GROUPS;
  const gridTemplate = `190px repeat(${cols.length}, minmax(116px, 1fr))`;

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 32px 80px" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, font: "700 28px/1.1 var(--font-sans)", letterSpacing: "-.02em", display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="people" size={26} color="var(--accent-pri)" /> Personas y accesos
          </h1>
          <p style={{ margin: "7px 0 0", font: "400 15px/1.4 var(--font-sans)", color: "var(--text-soft)" }}>Quién ve y edita cada dataset del workspace.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Btn variant="soft" size="sm" icon="people" onClick={() => openModal("inviteUser")}>Invitar</Btn>
          <Btn variant="soft" size="sm" icon="lock" onClick={() => openModal("datasetAccess")}>Accesos directos</Btn>
          <button style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--text)", boxShadow: "var(--shadow-1)" }}>
            <span style={{ font: "400 13px/1 var(--font-sans)", color: "var(--text-mute)" }}>Workspace</span>
            <Avatar name="Ventas" size={22} square />
            <span style={{ font: "600 14px/1 var(--font-sans)" }}>Ventas</span>
            <Icon name="chevronD" size={15} color="var(--text-mute)" />
          </button>
        </div>
      </div>

      <div style={{ marginTop: 22 }}><MTabs /></div>

      {/* mode + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", padding: 3, borderRadius: "var(--r-2)", background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
          {[["groups", "Por grupos"], ["users", "Por usuarios"]].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} style={{
              font: "600 12.5px/1 var(--font-sans)", padding: "7px 13px", borderRadius: 6, border: "none", cursor: "pointer",
              background: mode === k ? "var(--surface)" : "transparent", color: mode === k ? "var(--text)" : "var(--text-soft)",
              boxShadow: mode === k ? "var(--shadow-1)" : "none",
            }}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ font: "400 12.5px/1 var(--font-sans)", color: "var(--text-mute)" }}>Click una celda para ciclar el rol · mutación optimista</span>
      </div>

      {/* heatmap */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", boxShadow: "var(--shadow-1)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 720 }}>
            {/* column headers */}
            <div style={{ display: "grid", gridTemplateColumns: gridTemplate, background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
              <div style={{ padding: "12px 16px", font: "500 12px/1 var(--font-sans)", color: "var(--text-mute)", alignSelf: "center" }}>Dataset · Grupo</div>
              {cols.map((g, i) => (
                <div key={i} style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, borderLeft: "1px solid var(--border)" }}>
                  <Avatar name={g.name} size={24} square />
                  <span>
                    <span style={{ display: "block", font: "600 13px/1.2 var(--font-sans)" }}>{g.name}</span>
                    <span style={{ display: "block", font: "400 11px/1.2 var(--font-sans)", color: "var(--text-mute)" }}>{g.members} miembros</span>
                  </span>
                </div>
              ))}
            </div>
            {/* rows */}
            {M_DSETS.map((d, di) => (
              <div key={di} style={{ display: "grid", gridTemplateColumns: gridTemplate, borderBottom: di < M_DSETS.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center" }}>
                <div style={{ padding: "0 16px", display: "flex", alignItems: "center", gap: 9, height: "calc(var(--row-h) + 16px)" }}>
                  <span style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 7, background: d.kind === "calc" ? "var(--calc-soft)" : "var(--pri-soft)", color: d.kind === "calc" ? "var(--accent-calc)" : "var(--accent-pri)" }}>
                    <Icon name={d.kind === "calc" ? "scripts" : "datasets"} size={16} />
                  </span>
                  <span style={{ font: "600 13.5px/1.2 var(--font-sans)" }}>{d.name}</span>
                </div>
                {cols.map((g, gi) => (
                  <div key={gi} style={{ padding: "8px 8px", borderLeft: "1px solid var(--border)" }}>
                    <HeatCell role={grid[di][gi]} onClick={() => cycle(di, gi)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* legend + notes */}
      <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {ROLE_META.map((m, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 16, height: 16, borderRadius: 5, background: m.bg, border: `1px solid ${m.bd}` }} />
              <span style={{ font: "500 12.5px/1 var(--font-sans)", color: "var(--text-soft)" }}>{m.label}</span>
            </span>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "400 12.5px/1 var(--font-sans)", color: "var(--text-mute)" }}>
          <Icon name="lock" size={14} /> no puedes quitar el rol al único admin
        </span>
      </div>
      <div style={{ font: "400 12.5px/1.5 var(--font-sans)", color: "var(--text-mute)", marginTop: 12, maxWidth: 640 }}>
        Prioridad del rol efectivo: <strong style={{ color: "var(--text-soft)" }}>admin global › directo › grupo › workspace › rol global</strong>. Un valor <em>Sin acceso</em> bloquea explícitamente.
      </div>
    </div>
  );
}

Object.assign(window, { Matrix });

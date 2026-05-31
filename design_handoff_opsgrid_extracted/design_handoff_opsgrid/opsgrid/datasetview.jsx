// datasetview.jsx — DatasetView: editable grid (Tabla / Kanban / Gráficos / Papelera)

const COLS = [
  { key: "codigo", name: "código",  type: "text",     w: 120 },
  { key: "cliente", name: "cliente", type: "relation", w: 190, ref: "Clientes" },
  { key: "fecha",   name: "fecha",   type: "date",     w: 130 },
  { key: "total",   name: "total",   type: "currency", w: 130 },
  { key: "estado",  name: "estado",  type: "enum",     w: 150, options: ["pendiente", "pagado", "anulado"] },
  { key: "margen",  name: "margen",  type: "formula",  w: 130 },
];
const ENUM_TONE = { pendiente: "warn", pagado: "success", anulado: "danger" };

const ROWS0 = [
  { id: 1, codigo: "PED-0001", cliente: ["Ana García"], fecha: "2026-05-01", total: 1240, estado: "pendiente", margen: 248 },
  { id: 2, codigo: "PED-0002", cliente: ["Carlos Mendoza"], fecha: "2026-05-02", total: 980, estado: "pagado", margen: 196 },
  { id: 3, codigo: "PED-0003", cliente: ["Lucía Paredes"], fecha: "2026-05-02", total: 2100, estado: "anulado", margen: "#ERROR" },
  { id: 4, codigo: "PED-0004", cliente: ["Ana García"], fecha: "2026-05-03", total: 540.5, estado: "pagado", margen: 108.1 },
  { id: 5, codigo: "PED-0005", cliente: ["Diego Ríos"], fecha: "2026-05-04", total: 3200, estado: "pendiente", margen: 640 },
  { id: 6, codigo: "PED-0006", cliente: ["María Soto"], fecha: "2026-05-05", total: 760, estado: "pagado", margen: 152 },
  { id: 7, codigo: "PED-0007", cliente: ["Carlos Mendoza"], fecha: "2026-05-06", total: 1890, estado: "pendiente", margen: 378 },
  { id: 8, codigo: "PED-0008", cliente: ["Jorge Núñez"], fecha: "2026-05-07", total: 450, estado: "pagado", margen: 90 },
  { id: 9, codigo: "PED-0009", cliente: ["Lucía Paredes"], fecha: "2026-05-08", total: 1120, estado: "pendiente", margen: 224 },
  { id: 10, codigo: "PED-0010", cliente: ["Ana García", "Diego Ríos"], fecha: "2026-05-09", total: 2750, estado: "pagado", margen: 550 },
];

const soles = (n) => "S/ " + Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ViewTabs({ view, setView }) {
  const tabs = [["tabla", "Tabla", "columns"], ["kanban", "Kanban", "workspaces"], ["chart", "Gráficos", "diagram"], ["trash", "Papelera", "trash"]];
  return (
    <div style={{ display: "flex", gap: 2, background: "var(--surface-alt)", padding: 3, borderRadius: "var(--r-2)", border: "1px solid var(--border)" }}>
      {tabs.map(([k, l, ic]) => (
        <button key={k} onClick={() => setView(k)} style={{
          display: "inline-flex", alignItems: "center", gap: 7, font: "600 13px/1 var(--font-sans)", padding: "7px 12px",
          borderRadius: 6, border: "none", cursor: "pointer",
          background: view === k ? "var(--surface)" : "transparent", color: view === k ? "var(--text)" : "var(--text-soft)",
          boxShadow: view === k ? "var(--shadow-1)" : "none",
        }}><Icon name={ic} size={15} />{l}</button>
      ))}
    </div>
  );
}

// animated number for the stats bar
function CountUp({ value, format }) {
  const [disp, setDisp] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current, to = value, start = performance.now(), dur = 360;
    let raf;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - k, 3);
      setDisp(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick); else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <React.Fragment>{format ? format(disp) : Math.round(disp)}</React.Fragment>;
}

// live validation per cell
function validateCell(col, val) {
  if (val === undefined || val === null) return null;
  if (col.type === "currency") {
    if (String(val).trim() === "" || isNaN(Number(val))) return "Debe ser un número";
    if (Number(val) < 0) return "No puede ser negativo";
  }
  if (col.key === "codigo" && !/^PED-\d{4}$/.test(val)) return "Formato: PED-0000";
  if (col.type === "date" && val && isNaN(Date.parse(val))) return "Fecha inválida";
  return null;
}

// ---- one editable cell ----
function Cell({ col, row, editing, onEdit, onCommit, selected, error, flash }) {
  const v = row[col.key];
  const ro = col.type === "relation" || col.type === "formula";
  const [val, setVal] = useState(v);
  const [shake, setShake] = useState(false);
  useEffect(() => { if (editing) setVal(v); }, [editing]);
  const base = {
    height: "var(--row-h)", padding: "0 12px", display: "flex", alignItems: "center", gap: 6,
    borderRight: "1px solid var(--border)", font: "400 13px/1 var(--font-sans)", color: "var(--text)",
    cursor: ro ? "default" : "text", position: "relative", overflow: "hidden",
    background: selected ? "var(--pri-soft)" : "transparent",
    boxShadow: error ? "inset 0 0 0 2px var(--danger)" : "none",
  };

  if (editing) {
    if (col.type === "enum") {
      return (
        <div style={{ ...base, padding: 0, boxShadow: "inset 0 0 0 2px var(--accent-pri)" }}>
          <select autoFocus defaultValue={v} onBlur={(e) => onCommit(e.target.value)} onChange={(e) => onCommit(e.target.value)}
            style={{ width: "100%", height: "100%", border: "none", background: "var(--surface)", color: "var(--text)", font: "400 13px var(--font-sans)", padding: "0 10px", outline: "none" }}>
            {col.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    const msg = validateCell(col, val);
    const doShake = () => { setShake(true); setTimeout(() => setShake(false), 420); };
    return (
      <div className={shake ? "og-shake" : ""} style={{ ...base, padding: 0, overflow: "visible", zIndex: 6, boxShadow: msg ? "inset 0 0 0 2px var(--danger)" : "inset 0 0 0 2px var(--accent-pri)" }}>
        <input autoFocus type={col.type === "currency" ? "number" : col.type === "date" ? "date" : "text"}
          value={val}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); msg ? doShake() : onCommit(val, "down"); }
            else if (e.key === "Tab") { e.preventDefault(); msg ? doShake() : onCommit(val, "right"); }
            else if (e.key === "Escape") { onCommit(undefined); }
          }}
          onBlur={() => onCommit(msg ? undefined : val)}
          style={{ width: "100%", height: "100%", border: "none", background: "var(--surface)", color: "var(--text)", font: "400 13px var(--font-mono)", padding: "0 10px", outline: "none" }} />
        {msg && <div className="og-bubble">⚠ {msg}</div>}
      </div>
    );
  }

  let content;
  if (col.type === "relation") {
    content = <span style={{ display: "flex", gap: 4, overflow: "hidden" }}>{v.map((c, i) => <Chip key={i} tone="rel">{c}</Chip>)}</span>;
  } else if (col.type === "formula") {
    const err = v === "#ERROR";
    content = <span className="mono" style={{ font: "500 12.5px var(--font-mono)", color: err ? "var(--danger)" : "var(--accent-calc)", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ opacity: .7 }}>ƒ</span>{err ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name="x" size={12} />#ERROR</span> : soles(v)}
    </span>;
  } else if (col.type === "currency") {
    content = <span className="mono" style={{ font: `${row.total > 2000 ? 600 : 400} 12.5px var(--font-mono)`, color: "var(--text)" }}>{soles(v)}</span>;
  } else if (col.type === "enum") {
    content = <Badge tone={ENUM_TONE[v]} dot>{v}</Badge>;
  } else if (col.type === "date") {
    content = <span className="mono" style={{ font: "400 12.5px var(--font-mono)", color: "var(--text-soft)" }}>{v}</span>;
  } else {
    content = <span className="mono" style={{ font: "500 12.5px var(--font-mono)" }}>{v}</span>;
  }

  return (
    <div onClick={() => !ro && onEdit()} className={flash ? "og-flash" : ""} style={base}>
      {content}
      {col.type === "relation" && <span style={{ position: "absolute", right: 6, color: "var(--accent-rel)", opacity: .45 }}><Icon name="link" size={12} /></span>}
    </div>
  );
}

function DataGrid() {
  const [rows, setRows] = useState(ROWS0);
  const [sel, setSel] = useState(new Set());
  const [edit, setEdit] = useState(null); // {rid, key}
  const [flash, setFlash] = useState(new Set());
  const EDIT_COLS = COLS.filter(c => c.type !== "relation" && c.type !== "formula");
  const allSel = sel.size === rows.length;
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const commit = (rid, key, val, dir) => {
    if (val !== undefined) {
      setRows(rs => rs.map(r => r.id === rid ? { ...r, [key]: (COLS.find(c => c.key === key).type === "currency" ? parseFloat(val) || 0 : val) } : r));
      const fk = rid + ":" + key;
      setFlash(f => new Set(f).add(fk));
      setTimeout(() => setFlash(f => { const n = new Set(f); n.delete(fk); return n; }), 650);
    }
    if (dir && val !== undefined) {
      if (dir === "down") { const idx = rows.findIndex(r => r.id === rid); const nr = rows[idx + 1]; setEdit(nr ? { rid: nr.id, key } : null); }
      else if (dir === "right") { const ci = EDIT_COLS.findIndex(c => c.key === key); const nc = EDIT_COLS[ci + 1]; setEdit(nc ? { rid, key: nc.key } : null); }
      else setEdit(null);
    } else setEdit(null);
  };
  const selRows = rows.filter(r => sel.has(r.id));
  const selSum = selRows.reduce((a, r) => a + (typeof r.total === "number" ? r.total : 0), 0);

  const template = `40px 52px ${COLS.map(c => c.w + "px").join(" ")} 80px`;

  return (
    <div>
      {/* selection bar */}
      {sel.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", marginBottom: 12, borderRadius: "var(--r-2)", background: "var(--pri-soft)", border: "1px solid color-mix(in srgb, var(--accent-pri) 30%, transparent)" }}>
          <span style={{ font: "600 13px var(--font-sans)", color: "var(--accent-pri)" }}>{sel.size} seleccionados</span>
          <span style={{ display: "flex", gap: 16, font: "400 12.5px var(--font-sans)", color: "var(--text-soft)" }}>
            <span>Cuenta <strong className="mono" style={{ color: "var(--text)" }}><CountUp value={selRows.length} /></strong></span>
            <span>Suma <strong className="mono" style={{ color: "var(--text)" }}><CountUp value={selSum} format={soles} /></strong></span>
            <span>Promedio <strong className="mono" style={{ color: "var(--text)" }}><CountUp value={selSum / (selRows.length || 1)} format={soles} /></strong></span>
          </span>
          <div style={{ flex: 1 }} />
          <Btn variant="soft" size="sm" icon="link" tone="rel">Relacionados</Btn>
          <Btn variant="danger" size="sm" icon="trash" onClick={() => confirmDialog({ title: `Eliminar ${sel.size} registros`, message: "Se moverán a la papelera. Podrás restaurarlos.", confirmLabel: `Eliminar ${sel.size}`, danger: true, onConfirm: () => { ogToast(`${sel.size} registros eliminados`, "danger"); setSel(new Set()); } })}>Eliminar ({sel.size})</Btn>
        </div>
      )}

      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 900 }}>
            {/* header */}
            <div style={{ display: "grid", gridTemplateColumns: template, background: "var(--surface-2)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 2 }}>
              <div style={{ display: "grid", placeItems: "center", borderRight: "1px solid var(--border)" }}>
                <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(rows.map(r => r.id)))} style={{ accentColor: "var(--accent-pri)", width: 15, height: 15 }} />
              </div>
              <div style={{ display: "grid", placeItems: "center", borderRight: "1px solid var(--border)", font: "500 11px var(--font-mono)", color: "var(--text-mute)" }}>#</div>
              {COLS.map(c => (
                <div key={c.key} onClick={() => openModal("editColumn")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", height: 40, borderRight: "1px solid var(--border)", cursor: "pointer" }}>
                  {c.type === "relation" && <Icon name="link" size={13} color="var(--accent-rel)" />}
                  {c.type === "formula" && <span className="mono" style={{ color: "var(--accent-calc)", font: "600 12px var(--font-mono)" }}>ƒ</span>}
                  <span style={{ font: "600 12.5px var(--font-sans)", color: "var(--text)", flex: 1 }}>{c.name}</span>
                  <Icon name="chevronD" size={13} color="var(--text-mute)" />
                </div>
              ))}
              <div style={{ display: "grid", placeItems: "center", font: "500 11px var(--font-sans)", color: "var(--text-mute)" }}>·</div>
            </div>
            {/* rows */}
            {rows.map((r, ri) => {
              const isSel = sel.has(r.id);
              return (
                <div key={r.id} className="og-gridrow" style={{ display: "grid", gridTemplateColumns: template, borderBottom: ri < rows.length - 1 ? "1px solid var(--border)" : "none", background: isSel ? "color-mix(in srgb, var(--accent-pri) 5%, transparent)" : "transparent" }}>
                  <div style={{ display: "grid", placeItems: "center", borderRight: "1px solid var(--border)" }}>
                    <input type="checkbox" checked={isSel} onChange={() => toggle(r.id)} style={{ accentColor: "var(--accent-pri)", width: 15, height: 15 }} />
                  </div>
                  <div style={{ display: "grid", placeItems: "center", borderRight: "1px solid var(--border)", font: "400 11.5px var(--font-mono)", color: "var(--text-mute)" }}>{ri + 1}</div>
                  {COLS.map(c => (
                    <Cell key={c.key} col={c} row={r}
                      editing={edit && edit.rid === r.id && edit.key === c.key}
                      onEdit={() => setEdit({ rid: r.id, key: c.key })}
                      onCommit={(val, dir) => commit(r.id, c.key, val, dir)}
                      flash={flash.has(r.id + ":" + c.key)}
                      error={c.key === "margen" && r.margen === "#ERROR"} />
                  ))}
                  <div className="og-rowact" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                    <button title="Historial" onClick={() => openModal("recordHistory", { row: r })} className="og-iconbtn" style={{ width: 28, height: 28, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-mute)" }}><Icon name="history" size={15} /></button>
                    <button title="Eliminar" onClick={() => confirmDialog({ title: "Eliminar fila", message: `¿Mover ${r.codigo} a la papelera? Podrás restaurarlo después.`, confirmLabel: "Eliminar", danger: true, onConfirm: () => ogToast(`${r.codigo} movido a la papelera`, "danger") })} className="og-iconbtn" style={{ width: 28, height: 28, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-mute)" }}><Icon name="trash" size={15} /></button>
                  </div>
                </div>
              );
            })}
            {/* add row */}
            <button style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", borderTop: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--text-soft)", font: "500 13px var(--font-sans)" }}>
              <Icon name="plus" size={15} /> fila vacía
            </button>
          </div>
        </div>
      </div>

      {/* footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, font: "400 12.5px var(--font-sans)", color: "var(--text-soft)", flexWrap: "wrap" }}>
        <span><strong className="mono" style={{ color: "var(--text)" }}>{rows.length}</strong> registros</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="filter" size={13} color="var(--accent-pri)" /> 1 filtro</span>
        <div style={{ flex: 1 }} />
        <span>Mostrando 1–{rows.length} de 120</span>
        <Btn variant="soft" size="sm" icon="chevronL">Ant</Btn>
        <Btn variant="soft" size="sm" iconR="chevronR">Sig</Btn>
      </div>

      <RelatedDatasets />
    </div>
  );
}

function RelatedDatasets() {
  return (
    <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--border)" }}>
      <div style={{ font: "600 14px var(--font-sans)", color: "var(--text)", marginBottom: 12 }}>Tablas relacionadas</div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
        <div>
          <div style={{ font: "500 12px var(--font-sans)", color: "var(--text-mute)", marginBottom: 8 }}>↑ referencia a</div>
          <Chip tone="rel" icon={<Icon name="link" size={12} />}>Clientes</Chip>
        </div>
        <div>
          <div style={{ font: "500 12px var(--font-sans)", color: "var(--text-mute)", marginBottom: 8 }}>↓ la referencian</div>
          <Chip tone="rel" icon={<Icon name="link" size={12} />}>Detalle · 200</Chip>
        </div>
      </div>
    </div>
  );
}

// ---- Kanban ----
function KanbanView() {
  const groups = ["pendiente", "pagado", "anulado"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, alignItems: "start" }}>
      {groups.map(g => {
        const items = ROWS0.filter(r => r.estado === g);
        return (
          <div key={g} style={{ background: "var(--surface-alt)", borderRadius: "var(--r-3)", padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Badge tone={ENUM_TONE[g]} dot>{g}</Badge>
              <span style={{ font: "500 12px var(--font-mono)", color: "var(--text-mute)" }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map(r => (
                <div key={r.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-2)", padding: 12, boxShadow: "var(--shadow-1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="mono" style={{ font: "600 12.5px var(--font-mono)" }}>{r.codigo}</span>
                    <span className="mono" style={{ font: "600 12.5px var(--font-mono)", color: "var(--text)" }}>{soles(r.total)}</span>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 4 }}>{r.cliente.map((c, i) => <Chip key={i} tone="rel" icon={<Icon name="link" size={11} />}>{c}</Chip>)}</div>
                  <div style={{ marginTop: 8, font: "400 11.5px var(--font-mono)", color: "var(--text-mute)" }}>{r.fecha}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Chart ----
function ChartView() {
  const groups = ["pendiente", "pagado", "anulado"];
  const counts = groups.map(g => ROWS0.filter(r => r.estado === g).length);
  const max = Math.max(...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const colors = { pendiente: "var(--warning)", pagado: "var(--success)", anulado: "var(--danger)" };
  let acc = 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", padding: 20, boxShadow: "var(--shadow-1)" }}>
        <div style={{ font: "600 13.5px var(--font-sans)", marginBottom: 18 }}>Registros por <strong style={{ color: "var(--accent-pri)" }}>estado</strong></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groups.map((g, i) => (
            <div key={g} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 80, font: "500 12.5px var(--font-sans)", color: "var(--text-soft)" }}>{g}</span>
              <div style={{ flex: 1, height: 22, background: "var(--surface-alt)", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ width: `${(counts[i] / max) * 100}%`, height: "100%", background: colors[g], borderRadius: 6, transition: "width var(--t-slow)" }} />
              </div>
              <span className="mono" style={{ width: 24, textAlign: "right", font: "600 12.5px var(--font-mono)" }}>{counts[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", padding: 20, boxShadow: "var(--shadow-1)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <svg width="160" height="160" viewBox="0 0 42 42">
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--surface-alt)" strokeWidth="6" />
          {groups.map((g, i) => {
            const frac = counts[i] / total, dash = frac * 100;
            const el = <circle key={g} cx="21" cy="21" r="15.9" fill="none" stroke={colors[g]} strokeWidth="6"
              strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={`${25 - acc}`} />;
            acc += dash; return el;
          })}
          <text x="21" y="20" textAnchor="middle" style={{ font: "700 7px var(--font-sans)", fill: "var(--text)" }}>{total}</text>
          <text x="21" y="26" textAnchor="middle" style={{ font: "2.6px var(--font-sans)", fill: "var(--text-mute)" }}>registros</text>
        </svg>
        <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
          {groups.map(g => <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "500 11.5px var(--font-sans)", color: "var(--text-soft)" }}><span style={{ width: 10, height: 10, borderRadius: 3, background: colors[g] }} />{g}</span>)}
        </div>
      </div>
    </div>
  );
}

// ---- Trash ----
function TrashView() {
  const del = [{ codigo: "PED-0011", cliente: "María Soto", total: 320, when: "hace 2 h" }, { codigo: "PED-0012", cliente: "Jorge Núñez", total: 1450, when: "ayer" }];
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
      {del.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < del.length - 1 ? "1px solid var(--border)" : "none", opacity: .85 }}>
          <input type="checkbox" style={{ accentColor: "var(--accent-pri)", width: 15, height: 15 }} />
          <span className="mono" style={{ font: "600 12.5px var(--font-mono)", textDecoration: "line-through", color: "var(--text-mute)" }}>{d.codigo}</span>
          <Chip tone="rel" icon={<Icon name="link" size={11} />}>{d.cliente}</Chip>
          <span className="mono" style={{ font: "500 12.5px var(--font-mono)", color: "var(--text-soft)" }}>{soles(d.total)}</span>
          <span style={{ font: "400 12px var(--font-sans)", color: "var(--text-mute)" }}>eliminado {d.when}</span>
          <div style={{ flex: 1 }} />
          <Btn variant="soft" size="sm" icon="history">Restaurar</Btn>
          <Btn variant="danger" size="sm" icon="trash">Eliminar definitivo</Btn>
        </div>
      ))}
    </div>
  );
}

function DatasetView({ onBack, onNew }) {
  const [view, setView] = useState("tabla");
  const [menu, setMenu] = useState(false);
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "22px 32px 80px" }}>
      {/* header */}
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-soft)", font: "500 13px var(--font-sans)", padding: 0, marginBottom: 14 }}>
        <Icon name="chevronL" size={16} /> Volver a Datasets
      </button>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "var(--r-2)", background: "var(--pri-soft)", color: "var(--accent-pri)" }}><Icon name="datasets" size={21} /></span>
            <h1 style={{ margin: 0, font: "700 26px/1.1 var(--font-sans)", letterSpacing: "-.02em" }}>Pedidos</h1>
            <button className="og-iconbtn" style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-mute)" }}><Icon name="edit" size={16} /></button>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: "var(--r-pill)", background: "var(--success-soft)", color: "var(--success)", font: "600 11.5px var(--font-sans)" }}>
              <span className="og-live" style={{ width: 7, height: 7, borderRadius: 9, background: "var(--success)" }} /> Live
            </span>
          </div>
          <div style={{ font: "400 13.5px var(--font-sans)", color: "var(--text-soft)", marginTop: 8, marginLeft: 52 }}>
            6 columnas · 120 filas · <span style={{ color: "var(--accent-calc)" }}>ƒ1</span> · <span style={{ color: "var(--accent-rel)" }}>⛓2</span>
          </div>
        </div>
        <ViewTabs view={view} setView={setView} />
      </div>

      {/* toolbar (tabla only) */}
      {view === "tabla" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "20px 0 14px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, height: 36, padding: "0 11px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)", width: 200 }}>
              <Icon name="search" size={15} color="var(--text-mute)" />
              <input placeholder="Buscar…" style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--text)", font: "400 13px var(--font-sans)" }} />
            </div>
            <Btn variant="soft" size="sm" icon="filter">Filtros <span className="mono" style={{ color: "var(--accent-pri)" }}>1</span></Btn>
            <Btn variant="soft" size="sm" icon="columns">Columnas 5/6</Btn>
            <div style={{ flex: 1 }} />
            <Btn variant="soft" size="sm" icon="upload" onClick={() => ogToast("Exportando CSV…", "info")}>Exportar</Btn>
            <Btn variant="soft" size="sm" icon="lock" onClick={() => openModal("datasetAccess")}>Accesos</Btn>
            <span style={{ position: "relative" }}>
              <Btn variant="soft" size="sm" icon="dots" onClick={() => setMenu(m => !m)} />
              {menu && (
                <>
                  <div onClick={() => setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 70 }} />
                  <div style={{ position: "absolute", top: 40, right: 0, zIndex: 71, minWidth: 210, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", boxShadow: "var(--shadow-3)", padding: 6 }}>
                    {[["upload", "Importar CSV", () => openModal("csvMapping")], ["search", "Buscar y reemplazar", () => openModal("searchReplace")], ["sparkles", "Formato condicional", () => openModal("conditionalFormat")], ["diagram", "Ver diagrama", () => openModal("schema")], ["columns", "Vistas guardadas", () => ogToast("Vista guardada")], ["link", "Vincular tabla", () => openModal("linkTable")]].map(([ic, l, fn], i) => (
                      <div key={i} className="og-menu-item" onClick={() => { setMenu(false); fn(); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--r-2)", cursor: "pointer", font: "500 13px var(--font-sans)" }}>
                        <Icon name={ic} size={15} color="var(--text-soft)" /> {l}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </span>
            <Btn variant="soft" size="sm" icon="plus" onClick={() => openModal("addColumn")}>Columna</Btn>
            <Btn variant="primary" size="sm" icon="plus" onClick={onNew}>Nuevo registro</Btn>
          </div>
          {/* active filter chips */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 6px 5px 10px", borderRadius: "var(--r-pill)", background: "var(--surface-alt)", border: "1px solid var(--border)", font: "500 12px var(--font-sans)" }}>
              estado: <strong>pendiente</strong>
              <button style={{ display: "grid", placeItems: "center", width: 18, height: 18, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-mute)" }}><Icon name="x" size={13} /></button>
            </span>
            <button style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--accent-pri)", font: "600 12px var(--font-sans)" }}>Limpiar todo</button>
          </div>
          <DataGrid />
        </>
      )}
      {view !== "tabla" && <div style={{ marginTop: 22 }}>{view === "kanban" ? <KanbanView /> : view === "chart" ? <ChartView /> : <TrashView />}</div>}
    </div>
  );
}

Object.assign(window, { DatasetView });

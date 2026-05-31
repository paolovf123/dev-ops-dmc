// shell.jsx — OpsGrid AppShell (variant B: collapsible icon rail + topbar)
const { useState, useRef, useEffect } = React;

const NAV = [
  { key: "home",       icon: "datasets",   label: "Datasets" },
  { key: "scriptshub",  icon: "scripts",    label: "Scripts", badge: 3 },
  { key: "matrix",     icon: "people",     label: "Personas", mgr: true },
  { key: "workspaces", icon: "workspaces", label: "Workspaces", mgr: true },
  { key: "audit",      icon: "audit",      label: "Auditoría", adm: true },
  { key: "billing",    icon: "billing",    label: "Facturación", mgr: true },
];

const WORKSPACES = [
  { name: "Ventas", role: "owner", roleTone: "violet" },
  { name: "Operaciones", role: "admin_ws", roleTone: "primary" },
  { name: "Finanzas", role: "member", roleTone: "success" },
];

function useClickOutside(ref, onClose) {
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
}

function Dropdown({ open, onClose, children, style }) {
  const ref = useRef(null);
  useClickOutside(ref, () => open && onClose());
  if (!open) return null;
  return (
    <div ref={ref} className="og-pop" style={{
      position: "absolute", zIndex: 60, background: "var(--surface)",
      border: "1px solid var(--border)", borderRadius: "var(--r-3)",
      boxShadow: "var(--shadow-3)", padding: 6, minWidth: 240,
      animation: "ogPop var(--t-mid)", ...style,
    }}>{children}</div>
  );
}

function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const ws = WORKSPACES[0];
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} className="og-wsbtn" style={{
        display: "flex", alignItems: "center", gap: 9, padding: "5px 9px 5px 6px",
        borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)",
        cursor: "pointer", color: "var(--text)", boxShadow: "var(--shadow-1)",
      }}>
        <Avatar name={ws.name} size={26} square />
        <span style={{ font: "600 14px/1 var(--font-sans)" }}>{ws.name}</span>
        <Badge tone={ws.roleTone}>{ws.role}</Badge>
        <Icon name="chevronD" size={15} color="var(--text-mute)" />
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)} style={{ top: 44, left: 0, minWidth: 270 }}>
        <div style={{ padding: "7px 10px 9px", display: "flex", alignItems: "center", gap: 8, color: "var(--text-soft)", font: "500 12px/1 var(--font-sans)" }}>
          <Icon name="diagram" size={15} /> Dashboard general
        </div>
        <div style={{ height: 1, background: "var(--border)", margin: "2px 0 6px" }} />
        {WORKSPACES.map((w, i) => (
          <div key={i} className="og-menu-item" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--r-2)", cursor: "pointer" }}>
            <Avatar name={w.name} size={28} square />
            <span style={{ flex: 1, font: "600 13.5px/1 var(--font-sans)" }}>{w.name}</span>
            <Badge tone={w.roleTone}>{w.role}</Badge>
            {i === 0 && <Icon name="check" size={16} color="var(--accent-pri)" />}
          </div>
        ))}
        <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
        <div className="og-menu-item" style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: "var(--r-2)", cursor: "pointer", color: "var(--accent-pri)", font: "600 13.5px/1 var(--font-sans)" }}>
          <Icon name="plus" size={16} /> Nuevo workspace
        </div>
      </Dropdown>
    </div>
  );
}

function GlobalSearch() {
  const [focus, setFocus] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setFocus(false));
  const results = [
    { ds: "Clientes", val: "Ana García · Lima" },
    { ds: "Pedidos", val: "PED-0042 · S/ 1,240" },
    { ds: "Pedidos", val: "PED-0051 · S/ 980" },
  ];
  return (
    <div ref={ref} style={{ position: "relative", flex: "1 1 420px", maxWidth: 520 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 9, height: 38, padding: "0 12px",
        borderRadius: "var(--r-2)", border: `1px solid ${focus ? "var(--accent-pri)" : "var(--border)"}`,
        background: "var(--surface-2)", boxShadow: focus ? "var(--shadow-focus)" : "none", transition: "all var(--t-fast)",
      }}>
        <Icon name="search" size={17} color="var(--text-mute)" />
        <input onFocus={() => setFocus(true)} placeholder="Buscar dataset, registro…"
          style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--text)", font: "400 14px/1 var(--font-sans)" }} />
        <Kbd>⌘K</Kbd>
      </div>
      {focus && (
        <div className="og-pop" style={{ position: "absolute", top: 46, left: 0, right: 0, zIndex: 60, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)", boxShadow: "var(--shadow-3)", padding: 6 }}>
          <div style={{ font: "600 11px/1 var(--font-sans)", letterSpacing: ".06em", color: "var(--text-mute)", textTransform: "uppercase", padding: "8px 10px 6px" }}>3 resultados</div>
          {results.map((r, i) => (
            <div key={i} className="og-menu-item" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--r-2)", cursor: "pointer" }}>
              <span style={{ display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 7, background: "var(--pri-soft)", color: "var(--accent-pri)" }}><Icon name="datasets" size={15} /></span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", font: "500 13.5px/1.3 var(--font-sans)" }}>{r.val}</span>
                <span style={{ display: "block", font: "400 11.5px/1.3 var(--font-sans)", color: "var(--text-mute)" }}>en {r.ds}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ onNav }) {
  const [open, setOpen] = useState(false);
  const go = (r) => { setOpen(false); onNav && onNav(r); };
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: 8, padding: "3px 10px 3px 3px",
        borderRadius: "var(--r-pill)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--text)",
      }}>
        <Avatar name="Ana García" size={28} />
        <span style={{ font: "600 13.5px/1 var(--font-sans)" }}>Ana</span>
        <Badge tone="violet">admin</Badge>
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)} style={{ top: 44, right: 0, minWidth: 230 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 12px" }}>
          <Avatar name="Ana García" size={36} />
          <span>
            <span style={{ display: "block", font: "600 14px/1.2 var(--font-sans)" }}>Ana García</span>
            <span style={{ display: "block", font: "400 12px/1.2 var(--font-sans)", color: "var(--text-mute)" }}>ana@empresa.pe</span>
          </span>
        </div>
        <div style={{ height: 1, background: "var(--border)", margin: "0 0 6px" }} />
        {[["people", "Personas y accesos", "matrix"], ["billing", "Planes y facturación", "billing"], ["audit", "Registro de auditoría", "audit"], ["settings", "Integraciones", "settings"]].map(([ic, t, r], i) => (
          <div key={i} onClick={() => go(r)} className="og-menu-item" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--r-2)", cursor: "pointer", font: "500 13.5px/1 var(--font-sans)" }}>
            <Icon name={ic} size={16} color="var(--text-soft)" /> {t}
          </div>
        ))}
        <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
        <div onClick={() => go("login")} className="og-menu-item" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--r-2)", cursor: "pointer", color: "var(--danger)", font: "600 13.5px/1 var(--font-sans)" }}>
          <Icon name="arrowR" size={16} /> Cerrar sesión
        </div>
      </Dropdown>
    </div>
  );
}

function Topbar({ theme, onToggleTheme, onNav }) {
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 16, height: 58, padding: "0 16px",
      borderBottom: "1px solid var(--border)", background: "var(--surface)", flex: "none", zIndex: 50, position: "relative",
    }}>
      <button onClick={() => onNav && onNav("home")} style={{ display: "flex", alignItems: "center", gap: 9, width: 44, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg, var(--accent-pri), var(--accent-calc))", display: "grid", placeItems: "center", color: "#fff", font: "800 15px/1 var(--font-sans)", boxShadow: "var(--shadow-1)" }}>O</span>
      </button>
      <WorkspaceSwitcher />
      <GlobalSearch />
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <IconBtn name={theme === "dark" ? "sun" : "moon"} onClick={onToggleTheme} title="Tema" />
        <IconBtn name="bell" badge={2} title="Avisos" onClick={() => onNav && onNav("audit")} />
        <IconBtn name="settings" title="Integraciones" onClick={() => onNav && onNav("settings")} />
        <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 6px" }} />
        <UserMenu onNav={onNav} />
      </div>
    </header>
  );
}

function Rail({ route, setRoute, pinned, setPinned }) {
  const [hover, setHover] = useState(false);
  const expanded = pinned || hover;
  const W = expanded ? 236 : 66;
  const railSpace = pinned ? 236 : 66;
  return (
    <>
      <div style={{ width: railSpace, flex: "none" }} />
      <nav onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: W, zIndex: 40,
          background: "var(--surface)", borderRight: "1px solid var(--border)",
          display: "flex", flexDirection: "column", padding: "12px 10px",
          transition: "box-shadow var(--t-mid)", overflow: "hidden",
          boxShadow: (hover && !pinned) ? "var(--shadow-3)" : "none",
        }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV.map((n) => {
            const GROUP = { dataset: "home", create: "home", record: "home", scripts: "scriptshub" };
            const active = (GROUP[route] || route) === n.key;
            return (
              <button key={n.key} onClick={() => setRoute(n.key)} title={n.label} className="og-navitem"
                style={{
                  display: "flex", alignItems: "center", gap: 12, height: 42, padding: "0 11px",
                  borderRadius: "var(--r-2)", cursor: "pointer", border: "none", width: "100%",
                  background: active ? "var(--pri-soft)" : undefined,
                  color: active ? "var(--accent-pri)" : "var(--text-soft)",
                  transition: "background var(--t-fast)", position: "relative",
                }}>
                {active && <span style={{ position: "absolute", left: -10, top: 9, bottom: 9, width: 3, borderRadius: 3, background: "var(--accent-pri)" }} />}
                <Icon name={n.icon} size={20} sw={active ? 2 : 1.7} />
                <span style={{ flex: 1, textAlign: "left", font: `${active ? 600 : 500} 14px/1 var(--font-sans)`, opacity: expanded ? 1 : 0, transition: "opacity var(--t-mid)", whiteSpace: "nowrap" }}>{n.label}</span>
                {n.badge && <Badge tone="calc" style={{ opacity: expanded ? 1 : 0, transition: "opacity var(--t-mid)" }}>{n.badge}</Badge>}
                {expanded && (n.mgr || n.adm) && <span style={{ font: "10px/1 var(--font-sans)", color: "var(--text-mute)" }}>{n.adm ? "★★" : "★"}</span>}
                {!expanded && n.badge && <span style={{ position: "absolute", top: 5, right: 7, width: 7, height: 7, borderRadius: 9, background: "var(--accent-calc)" }} />}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* upgrade card */}
        <div style={{
          opacity: expanded ? 1 : 0, transition: "opacity var(--t-mid)", pointerEvents: expanded ? "auto" : "none",
          background: "linear-gradient(150deg, var(--pri-soft), var(--calc-soft))",
          border: "1px solid var(--border)", borderRadius: "var(--r-3)", padding: 13, marginBottom: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, font: "700 12.5px/1 var(--font-sans)", color: "var(--text)" }}>
            <Icon name="sparkles" size={15} color="var(--accent-pri)" /> Plan Free
          </div>
          <div style={{ font: "400 12px/1.4 var(--font-sans)", color: "var(--text-soft)", margin: "5px 0 10px" }}>Suscríbete a Pro para scripts, API y más límites.</div>
          <Btn variant="primary" size="sm" full onClick={() => setRoute("billing")}>Ver planes</Btn>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => setPinned(p => !p)} title={pinned ? "Soltar riel" : "Fijar riel"}
            style={{ display: "grid", placeItems: "center", width: 40, height: 38, borderRadius: "var(--r-2)", border: "none", cursor: "pointer", background: pinned ? "var(--pri-soft)" : "transparent", color: pinned ? "var(--accent-pri)" : "var(--text-mute)" }}>
            <Icon name="pin" size={17} />
          </button>
          <button style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, height: 38, padding: "0 11px", borderRadius: "var(--r-2)", border: "none", cursor: "pointer", background: "transparent", color: "var(--danger)", opacity: expanded ? 1 : 0, transition: "opacity var(--t-mid)" }}>
            <Icon name="arrowR" size={18} /> <span style={{ font: "500 13.5px/1 var(--font-sans)" }}>Cerrar sesión</span>
          </button>
        </div>
      </nav>
    </>
  );
}

function Shell({ route, setRoute, theme, onToggleTheme, children }) {
  const [pinned, setPinned] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Topbar theme={theme} onToggleTheme={onToggleTheme} onNav={setRoute} />
      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
        <Rail route={route} setRoute={setRoute} pinned={pinned} setPinned={setPinned} />
        <main style={{ flex: 1, minWidth: 0, overflow: "auto", background: "var(--bg)" }}>{children}</main>
      </div>
    </div>
  );
}

Object.assign(window, { Shell });

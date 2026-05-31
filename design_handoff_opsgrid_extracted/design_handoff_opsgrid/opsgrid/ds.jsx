// ds.jsx — OpsGrid design-kit: line icons + primitives. Exported to window.

const ICONS = {
  datasets: "M4 5h7v6H4zM13 5h7v4h-7zM4 13h7v6H4zM13 11h7v8h-7z",
  scripts:  "M9 6l-4 6 4 6M15 6l4 6-4 6",
  people:   "M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 2.7-5 6-5s6 2 6 5M17 14c2 .4 4 2 4 6",
  workspaces:"M4 4h7v7H4zM13 13h7v7h-7zM15 4h5v5h-5zM4 15h5v5H4z",
  audit:    "M12 7v5l3 2M3.5 12a8.5 8.5 0 113.2 6.6M3.5 12V8M3.5 12H7",
  billing:  "M3 7h18v10H3zM3 10h18M7 14h4",
  search:   "M11 11m-7 0a7 7 0 1014 0 7 7 0 10-14 0M20 20l-3.5-3.5",
  bell:     "M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 004 0",
  settings: "M12 9a3 3 0 100 6 3 3 0 000-6M19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1L14.5 2h-5l-.3 2.4a7 7 0 00-1.7 1l-2.4-1-2 3.4L3 11a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.3 2.4h5l.3-2.4a7 7 0 001.7-1l2.4 1 2-3.4L19 13a7 7 0 000-1z",
  sun:      "M12 7a5 5 0 100 10 5 5 0 000-10M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19",
  moon:     "M20 13a8 8 0 11-9-9 7 7 0 009 9z",
  chevronD: "M6 9l6 6 6-6",
  chevronR: "M9 6l6 6-6 6",
  chevronL: "M15 6l-6 6 6 6",
  dots:     "M5 12h.01M12 12h.01M19 12h.01",
  plus:     "M12 5v14M5 12h14",
  link:     "M9 15l6-6M10 6l1-1a4 4 0 015.6 5.6l-1 1M14 18l-1 1A4 4 0 017.4 13.4l1-1",
  sparkles: "M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z",
  diagram:  "M7 6m-3 0a3 3 0 106 0 3 3 0 10-6 0M17 18m-3 0a3 3 0 106 0 3 3 0 10-6 0M17 6m-3 0a3 3 0 106 0 3 3 0 10-6 0M10 6h4M8.5 8.5l7 7",
  filter:   "M4 5h16l-6 7v6l-4 2v-8z",
  columns:  "M4 5h16v14H4zM10 5v14M16 5v14",
  check:    "M5 12l5 5L20 6",
  lock:     "M6 11h12v9H6zM9 11V8a3 3 0 016 0v3",
  x:        "M6 6l12 12M18 6L6 18",
  gridV:    "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  listV:    "M4 6h16M4 12h16M4 18h16",
  pin:      "M9 3h6l-1 7 3 3v2H7v-2l3-3zM12 15v6",
  arrowR:   "M5 12h14M13 6l6 6-6 6",
  trash:    "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13",
  edit:     "M4 20h4L18.5 9.5a2 2 0 00-3-3L5 17z",
  history:  "M12 7v5l3 2M3.5 12a8.5 8.5 0 113.2 6.6M3.5 12V8M3.5 12H7",
  upload:   "M12 16V4M7 9l5-5 5 5M5 20h14",
  star:     "M12 4l2.3 5.2 5.7.5-4.3 3.8 1.3 5.5L12 16.8 7 19.3l1.3-5.5L4 10l5.7-.5z",
};

function Icon({ name, size = 18, color = "currentColor", sw = 1.7, fill, style }) {
  const d = ICONS[name] || "";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flex: "none", display: "block", ...style }}>
      <path d={d} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill={fill || "none"} />
    </svg>
  );
}

// ---- Badge (status / role tones) ----
const TONE = {
  neutral: ["var(--text-soft)", "var(--surface-alt)"],
  primary: ["var(--accent-pri)", "var(--pri-soft)"],
  rel:     ["var(--accent-rel)", "var(--rel-soft)"],
  calc:    ["var(--accent-calc)", "var(--calc-soft)"],
  violet:  ["var(--violet)", "var(--violet-soft)"],
  success: ["var(--success)", "var(--success-soft)"],
  warn:    ["var(--warning)", "var(--warning-soft)"],
  danger:  ["var(--danger)", "var(--danger-soft)"],
};
function Badge({ children, tone = "neutral", dot, solid, style }) {
  const [fg, bg] = TONE[tone] || TONE.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      font: "600 11.5px/1 var(--font-sans)", letterSpacing: ".01em",
      padding: "4px 8px", borderRadius: "var(--r-pill)",
      color: solid ? "#fff" : fg, background: solid ? fg : bg,
      whiteSpace: "nowrap", ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 9, background: solid ? "#fff" : fg }} />}
      {children}
    </span>
  );
}

// ---- Chip (relation / lookup) ----
function Chip({ children, tone = "rel", icon, style }) {
  const [fg, bg] = TONE[tone] || TONE.rel;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      font: "500 12.5px/1 var(--font-sans)",
      padding: "4px 9px 4px 7px", borderRadius: "var(--r-pill)",
      color: fg, background: bg,
      border: `1px solid color-mix(in srgb, ${fg} 30%, transparent)`,
      whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", ...style,
    }}>
      {icon}{children}
    </span>
  );
}

// ---- Button ----
function Btn({ children, variant = "soft", tone = "primary", size = "md", icon, iconR, full, onClick, title, style }) {
  const [fg] = TONE[tone] || TONE.primary;
  const pads = { sm: "6px 11px", md: "8px 14px", lg: "11px 18px" }[size];
  const fs = { sm: 12.5, md: 13.5, lg: 15 }[size];
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    font: `600 ${fs}px/1 var(--font-sans)`, padding: pads, borderRadius: "var(--r-2)",
    cursor: "pointer", border: "1px solid transparent", transition: "all var(--t-fast)",
    width: full ? "100%" : "auto", whiteSpace: "nowrap",
  };
  const styles = {
    primary: { background: fg, color: "#fff", boxShadow: "var(--shadow-1)" },
    soft:    { background: "var(--surface)", color: "var(--text)", borderColor: "var(--border)", boxShadow: "var(--shadow-1)" },
    ghost:   { background: "transparent", color: "var(--text-soft)" },
    tint:    { background: "var(--pri-soft)", color: fg },
    danger:  { background: "transparent", color: "var(--danger)", borderColor: "color-mix(in srgb, var(--danger) 30%, transparent)" },
  };
  return (
    <button className="og-btn" data-variant={variant} onClick={onClick} title={title}
      style={{ ...base, ...(variant === "primary" ? { ...styles.primary, background: fg } : styles[variant]), ...style }}>
      {icon && <Icon name={icon} size={fs + 3} />}
      {children}
      {iconR && <Icon name={iconR} size={fs + 3} />}
    </button>
  );
}

function IconBtn({ name, size = 18, onClick, active, title, badge, style }) {
  return (
    <button className="og-iconbtn" onClick={onClick} title={title} style={{
      position: "relative", display: "grid", placeItems: "center",
      width: 36, height: 36, borderRadius: "var(--r-2)", cursor: "pointer",
      background: active ? "var(--pri-soft)" : "transparent",
      color: active ? "var(--accent-pri)" : "var(--text-soft)",
      border: "1px solid transparent", transition: "all var(--t-fast)", ...style,
    }}>
      <Icon name={name} size={size} />
      {badge != null && <span style={{ position: "absolute", top: 3, right: 3, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 9, background: "var(--accent-calc)", color: "#fff", font: "700 10px/16px var(--font-sans)", textAlign: "center" }}>{badge}</span>}
    </button>
  );
}

// ---- Avatar (deterministic gradient) ----
function hashHue(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
function Avatar({ name = "", size = 30, square, ring, style }) {
  const h = hashHue(name);
  const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span style={{
      width: size, height: size, flex: "none",
      borderRadius: square ? "30%" : "var(--r-pill)",
      background: `linear-gradient(135deg, hsl(${h} 75% 56%), hsl(${(h + 38) % 360} 78% 48%))`,
      display: "grid", placeItems: "center", color: "#fff",
      font: `700 ${size * 0.4}px/1 var(--font-sans)`,
      boxShadow: ring ? "0 0 0 2px var(--surface)" : "none", ...style,
    }}>{initials}</span>
  );
}

// ---- Toggle switch ----
function Toggle({ on, onChange, size = 1 }) {
  const w = 38 * size, h = 22 * size, k = (h - 4);
  return (
    <button onClick={() => onChange && onChange(!on)} style={{
      width: w, height: h, borderRadius: 999, border: "none", cursor: "pointer", padding: 0,
      background: on ? "var(--accent-pri)" : "var(--border-strong)", position: "relative",
      transition: "background var(--t-mid)",
    }}>
      <span style={{
        position: "absolute", top: 2, left: on ? w - k - 2 : 2, width: k, height: k,
        borderRadius: 999, background: "#fff", boxShadow: "var(--shadow-1)", transition: "left var(--t-mid)",
      }} />
    </button>
  );
}

function Kbd({ children }) {
  return <span className="mono" style={{ font: "500 11px/1 var(--font-mono)", padding: "3px 6px", borderRadius: 6, background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text-soft)" }}>{children}</span>;
}

Object.assign(window, { Icon, Badge, Chip, Btn, IconBtn, Avatar, Toggle, Kbd, TONE });

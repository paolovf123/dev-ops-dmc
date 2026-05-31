// wf-kit.jsx — sketchy wireframe primitives for OpsGrid
// All components exported to window at the bottom (Babel scripts don't share scope).

const INK   = "#2b2a27";   // charcoal ink
const INK2  = "#6b6862";   // soft ink
const INK3  = "#a8a49b";   // mute ink
const PAPER = "#f7f4ec";   // warm paper
const CARD  = "#fffdf8";   // box fill

// semantic accents (used sparingly even in lo-fi)
const PRI  = "#1e4cff";    // brand / active / focus
const REL  = "#ff6a18";    // relations / joins / lookups
const CALC = "#e436b6";    // scripts / computed / derived
const OK   = "#0fb583", WARN = "#f4a300", DANGER = "#e8455a", VIOLET = "#7a5ae0";

// irregular hand-drawn corner radius
const handR = "10px 7px 11px 8px";
const handR2 = "7px 11px 6px 10px";

// ---- low-level building blocks -------------------------------------------

function Box({ children, style, dashed, accent, fill, pad = 14, r = handR, ...rest }) {
  return (
    <div
      style={{
        border: `2px ${dashed ? "dashed" : "solid"} ${accent || INK}`,
        borderRadius: r,
        background: fill || CARD,
        padding: pad,
        boxShadow: dashed ? "none" : "2px 3px 0 rgba(43,42,39,0.13)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

// scribble placeholder line(s)
function Scribble({ w = "100%", lines = 1, gap = 7, color = INK3, h = 8, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{
          width: typeof w === "function" ? w(i) : (Array.isArray(w) ? w[i] : w),
          height: h, borderRadius: 4,
          background: `repeating-linear-gradient(90deg, ${color} 0 14px, transparent 14px 19px)`,
          opacity: 0.6,
        }} />
      ))}
    </div>
  );
}

function Btn({ children, accent, ghost, solid, sm, style }) {
  const c = accent || INK;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      font: `${sm ? 13 : 14.5}px/1 "Kalam", cursive`,
      padding: sm ? "6px 11px" : "8px 14px",
      border: `2px solid ${c}`,
      borderRadius: "8px 12px 7px 11px",
      color: solid ? "#fff" : c,
      background: solid ? c : (ghost ? "transparent" : CARD),
      boxShadow: solid || !ghost ? "1.5px 2px 0 rgba(43,42,39,0.16)" : "none",
      whiteSpace: "nowrap", cursor: "default", ...style,
    }}>{children}</span>
  );
}

function Chip({ children, accent = INK, dot, fill, style, sm }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      font: `${sm ? 12 : 13}px/1 "Kalam", cursive`,
      padding: sm ? "3px 8px" : "4px 10px",
      border: `1.5px solid ${accent}`,
      borderRadius: 999,
      color: accent, background: fill || "transparent",
      whiteSpace: "nowrap", ...style,
    }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: 9, background: accent }} />}
      {children}
    </span>
  );
}

// a faux text field
function Field({ label, ph, w = "100%", icon, style }) {
  return (
    <label style={{ display: "block", width: w, ...style }}>
      {label && <div style={{ font: '13px "Kalam", cursive', color: INK2, marginBottom: 4 }}>{label}</div>}
      <div style={{
        display: "flex", alignItems: "center", gap: 7,
        border: `2px solid ${INK}`, borderRadius: "8px 11px 7px 10px",
        background: CARD, padding: "8px 11px", lineHeight: 1, overflow: "hidden",
      }}>
        {icon && <span style={{ color: INK3 }}>{icon}</span>}
        <span style={{ font: '14px "Kalam", cursive', color: INK3, whiteSpace: "nowrap" }}>{ph}</span>
      </div>
    </label>
  );
}

// red "felt-pen" margin annotation, optionally rotated, with a little arrow
function Note({ children, rot = -2, color = DANGER, w = 230, arrow, style }) {
  return (
    <div className="wf-note" style={{
      position: "relative", width: w,
      transform: `rotate(${rot}deg)`,
      font: '15px/1.35 "Caveat", cursive', color,
      ...style,
    }}>
      {arrow && <span style={{ position: "absolute", ...arrow.pos, fontSize: 22 }}>{arrow.glyph}</span>}
      {children}
    </div>
  );
}

// the big A / B / C variant header
function VariantHead({ letter, title, desc, axis }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
      <div style={{
        flex: "none", width: 52, height: 52, display: "grid", placeItems: "center",
        border: `2.5px solid ${INK}`, borderRadius: "16px 13px 17px 12px",
        font: '30px "Caveat", cursive', fontWeight: 700, color: INK,
        background: CARD, boxShadow: "2px 3px 0 rgba(43,42,39,0.16)",
      }}>{letter}</div>
      <div style={{ paddingTop: 2 }}>
        <div style={{ font: '700 22px "Kalam", cursive', color: INK, lineHeight: 1.1 }}>{title}</div>
        <div style={{ font: '15px/1.35 "Kalam", cursive', color: INK2, marginTop: 3, maxWidth: 620 }}>{desc}</div>
        {axis && <div style={{ marginTop: 7 }}><Chip sm accent={PRI} fill="#1e4cff10">explora · {axis}</Chip></div>}
      </div>
    </div>
  );
}

// desktop "browser" frame to hold a full screen wireframe
function Frame({ children, label, h }) {
  return (
    <div style={{
      border: `2.5px solid ${INK}`, borderRadius: "14px 12px 15px 11px",
      background: PAPER, overflow: "hidden",
      boxShadow: "4px 6px 0 rgba(43,42,39,0.14)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 13px", borderBottom: `2px solid ${INK}`, background: CARD,
      }}>
        <span style={{ display: "flex", gap: 6 }}>
          {[INK3, INK3, INK3].map((c, i) => (
            <span key={i} style={{ width: 11, height: 11, borderRadius: 9, border: `1.5px solid ${INK}` }} />
          ))}
        </span>
        <span style={{ font: '13px "Kalam", cursive', color: INK2, marginLeft: 6, whiteSpace: "nowrap" }}>{label}</span>
      </div>
      <div style={{ height: h, overflow: "hidden", position: "relative" }}>{children}</div>
    </div>
  );
}

// icon glyph helper (brief uses simple glyphs)
function G({ c, color = INK, size = 16, style }) {
  return <span style={{ font: `${size}px "Kalam", cursive`, color, lineHeight: 1, ...style }}>{c}</span>;
}

// section legend swatch
function LegendItem({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 13, height: 13, borderRadius: 4, background: color, border: `1.5px solid ${INK}` }} />
      <span style={{ font: '13px "Kalam", cursive', color: INK }}>{label}</span>
    </span>
  );
}

Object.assign(window, {
  INK, INK2, INK3, PAPER, CARD, PRI, REL, CALC, OK, WARN, DANGER, VIOLET, handR, handR2,
  Box, Scribble, Btn, Chip, Field, Note, VariantHead, Frame, G, LegendItem,
});

// OpsGrid design-kit — primitivos token-driven (port TS de design_handoff/opsgrid/ds.jsx).
// Inline-styled a propósito (fiel al handoff, sin depender de clases CSS). Los iconos se
// pasan como ReactNode (la app usa lucide-react); no se porta el set SVG propio.
//
// Estos primitivos son ADITIVOS: conviven con los `dk-*` de ./index.tsx. Las pantallas
// migran a este kit fase por fase durante el rebrand.
import type { CSSProperties, ReactNode } from "react";

// ── Tonos semánticos: [foreground, background-soft] ──────────────────────────
export type Tone =
  | "neutral" | "primary" | "rel" | "calc" | "violet" | "success" | "warn" | "danger";

export const TONE: Record<Tone, [string, string]> = {
  neutral: ["var(--text-soft)", "var(--surface-alt)"],
  primary: ["var(--accent-pri)", "var(--pri-soft)"],
  rel: ["var(--accent-rel)", "var(--rel-soft)"],
  calc: ["var(--accent-calc)", "var(--calc-soft)"],
  violet: ["var(--violet)", "var(--violet-soft)"],
  success: ["var(--success)", "var(--success-soft)"],
  warn: ["var(--warning)", "var(--warning-soft)"],
  danger: ["var(--danger)", "var(--danger-soft)"],
};

// ── Badge (estado / rol) ──────────────────────────────────────────────────────
export function Badge({
  children, tone = "neutral", dot, solid, style,
}: {
  children: ReactNode; tone?: Tone; dot?: boolean; solid?: boolean; style?: CSSProperties;
}) {
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

// ── Chip (relación / lookup) ──────────────────────────────────────────────────
export function Chip({
  children, tone = "rel", icon, title, style,
}: {
  children: ReactNode; tone?: Tone; icon?: ReactNode; title?: string; style?: CSSProperties;
}) {
  const [fg, bg] = TONE[tone] || TONE.rel;
  return (
    <span title={title} style={{
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

// ── Button ────────────────────────────────────────────────────────────────────
export type BtnVariant = "primary" | "soft" | "ghost" | "tint" | "danger";

export function Btn({
  children, variant = "soft", tone = "primary", size = "md",
  icon, iconR, full, onClick, title, type = "button", disabled, style,
}: {
  children?: ReactNode; variant?: BtnVariant; tone?: Tone; size?: "sm" | "md" | "lg";
  icon?: ReactNode; iconR?: ReactNode; full?: boolean;
  onClick?: () => void; title?: string; type?: "button" | "submit"; disabled?: boolean;
  style?: CSSProperties;
}) {
  const [fg] = TONE[tone] || TONE.primary;
  const pads = { sm: "6px 11px", md: "8px 14px", lg: "11px 18px" }[size];
  const fs = { sm: 12.5, md: 13.5, lg: 15 }[size];
  const base: CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    font: `600 ${fs}px/1 var(--font-sans)`, padding: pads, borderRadius: "var(--r-2)",
    cursor: disabled ? "not-allowed" : "pointer", border: "1px solid transparent",
    transition: "all var(--t-fast)", width: full ? "100%" : "auto", whiteSpace: "nowrap",
    opacity: disabled ? 0.55 : 1,
  };
  const variants: Record<BtnVariant, CSSProperties> = {
    primary: { background: fg, color: "#fff", boxShadow: "var(--shadow-1)" },
    soft: { background: "var(--surface)", color: "var(--text)", borderColor: "var(--border)", boxShadow: "var(--shadow-1)" },
    ghost: { background: "transparent", color: "var(--text-soft)" },
    tint: { background: TONE[tone][1], color: fg },
    danger: { background: "transparent", color: "var(--danger)", borderColor: "color-mix(in srgb, var(--danger) 30%, transparent)" },
  };
  return (
    <button type={type} className="og-btn" data-variant={variant} onClick={onClick}
      title={title} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {icon}{children}{iconR}
    </button>
  );
}

// ── Icon button ─────────────────────────────────────────────────────────────
export function IconBtn({
  children, onClick, active, title, badge, style,
}: {
  children: ReactNode; onClick?: () => void; active?: boolean; title?: string;
  badge?: number | string; style?: CSSProperties;
}) {
  return (
    <button className="og-iconbtn" onClick={onClick} title={title} style={{
      position: "relative", display: "grid", placeItems: "center",
      width: 36, height: 36, borderRadius: "var(--r-2)", cursor: "pointer",
      background: active ? "var(--pri-soft)" : undefined,
      color: active ? "var(--accent-pri)" : "var(--text-soft)",
      border: "1px solid transparent", transition: "all var(--t-fast)", ...style,
    }}>
      {children}
      {badge != null && (
        <span style={{
          position: "absolute", top: 3, right: 3, minWidth: 16, height: 16, padding: "0 4px",
          borderRadius: 9, background: "var(--accent-calc)", color: "#fff",
          font: "700 10px/16px var(--font-sans)", textAlign: "center",
        }}>{badge}</span>
      )}
    </button>
  );
}

// ── Avatar (gradiente determinístico por nombre) ──────────────────────────────
export function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
export function Avatar({
  name = "", size = 30, square, ring, style,
}: {
  name?: string; size?: number; square?: boolean; ring?: boolean; style?: CSSProperties;
}) {
  const h = hashHue(name);
  const initials = name.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
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

// ── Toggle switch ─────────────────────────────────────────────────────────────
export function Toggle({ on, onChange, size = 1 }: {
  on: boolean; onChange?: (next: boolean) => void; size?: number;
}) {
  const w = 38 * size, h = 22 * size, k = h - 4;
  return (
    <button type="button" onClick={() => onChange?.(!on)} style={{
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

// ── Kbd ─────────────────────────────────────────────────────────────────────
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="mono" style={{
      font: "500 11px/1 var(--font-mono)", padding: "3px 6px", borderRadius: 6,
      background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text-soft)",
    }}>{children}</span>
  );
}

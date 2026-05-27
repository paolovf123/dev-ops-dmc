// Kit de UI reutilizable — estilo limpio profesional (ref: Linear / Stripe).
// Las clases viven en index.css bajo la sección "DESIGN KIT (dk-*)".
import type { ReactNode, CSSProperties } from "react";
import { IcSearch, IcInbox } from "./icons";

// ── PageHeader ────────────────────────────────────────────────────────────────
export function PageHeader({
  title, subtitle, icon, actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="dk-page-head">
      <div>
        <h1 className="dk-page-title">{icon}{title}</h1>
        {subtitle && <p className="dk-page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="dk-page-actions">{actions}</div>}
    </div>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────
export interface TabDef<K extends string> { key: K; label: string; icon?: ReactNode; }

export function Tabs<K extends string>({
  tabs, active, onChange,
}: {
  tabs: TabDef<K>[];
  active: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="dk-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          className={`dk-tab ${active === t.key ? "dk-tab--active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  );
}

// ── Toolbar / filter bar ──────────────────────────────────────────────────────
export function Toolbar({ children, bordered = true, style }: {
  children: ReactNode; bordered?: boolean; style?: CSSProperties;
}) {
  return (
    <div className={`dk-toolbar ${bordered ? "dk-toolbar--bordered" : ""}`} style={style}>
      {children}
    </div>
  );
}
export const ToolbarSpacer = () => <span className="dk-toolbar-spacer" />;

// ── SearchInput ────────────────────────────────────────────────────────────────
export function SearchInput({
  value, onChange, placeholder = "Buscar…", style,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; style?: CSSProperties;
}) {
  return (
    <span className="dk-search" style={style}>
      <IcSearch size={15} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </span>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Select({
  value, onChange, children, style, "aria-label": ariaLabel,
}: {
  value: string; onChange: (v: string) => void; children: ReactNode;
  style?: CSSProperties; "aria-label"?: string;
}) {
  return (
    <select className="dk-select" value={value} aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)} style={style}>
      {children}
    </select>
  );
}

// ── Count chip ────────────────────────────────────────────────────────────────
export const Count = ({ n, noun }: { n: number; noun: string }) => (
  <span className="dk-count">{n} {noun}</span>
);

// ── Badge ─────────────────────────────────────────────────────────────────────
type BadgeTone = "neutral" | "primary" | "violet" | "danger" | "warn" | "success";
export function Badge({ tone = "neutral", dot, children, style }: {
  tone?: BadgeTone; dot?: boolean; children: ReactNode; style?: CSSProperties;
}) {
  return (
    <span className={`dk-badge dk-badge--${tone}`} style={style}>
      {dot && <span className="dk-badge-dot" />}{children}
    </span>
  );
}

// ── DataTable ───────────────────────────────────────────────────────────────
export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
  primary?: boolean;
  width?: number | string;
}

export function DataTable<T>({
  columns, rows, rowKey, empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
}) {
  return (
    <div className="dk-table-wrap">
      <table className="dk-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{
                width: c.width,
                textAlign: c.align === "right" ? "right" : "left",
              }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 0, borderTop: "none" }}>
                {empty ?? <EmptyState title="Sin resultados" />}
              </td>
            </tr>
          ) : rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key}
                  className={[c.primary ? "dk-td-primary" : "", c.align === "right" ? "dk-td-right" : ""].join(" ").trim()}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({ title, subtitle, icon }: {
  title: ReactNode; subtitle?: ReactNode; icon?: ReactNode;
}) {
  return (
    <div className="dk-empty">
      <div className="dk-empty-icon">{icon ?? <IcInbox size={22} />}</div>
      <div className="dk-empty-title">{title}</div>
      {subtitle && <div className="dk-empty-sub">{subtitle}</div>}
    </div>
  );
}

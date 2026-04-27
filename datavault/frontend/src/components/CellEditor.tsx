import { useState, useRef, useEffect } from "react";
import type { ColumnDefinition } from "../types";

export type NavDir = "next-col" | "prev-col" | "next-row" | "prev-row";

interface Props {
  column: ColumnDefinition;
  value: unknown;
  onCommit: (value: unknown, nav?: NavDir) => void;
  onCancel: () => void;
}

export default function CellEditor({ column, value, onCommit, onCancel }: Props) {
  const [draft, setDraft] = useState(value ?? "");
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select?.();
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); return; }
    if (e.key === "Enter") { e.preventDefault(); onCommit(draft, "next-row"); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      onCommit(draft, e.shiftKey ? "prev-col" : "next-col");
      return;
    }
    if (e.key === "ArrowUp")   { e.preventDefault(); onCommit(draft, "prev-row"); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); onCommit(draft, "next-row"); return; }
  };

  const style: React.CSSProperties = {
    width: "100%",
    padding: "5px 8px",
    boxSizing: "border-box",
    fontSize: "inherit",
    border: "1.5px solid var(--color-primary)",
    borderRadius: "var(--radius-xs)",
    outline: "none",
    boxShadow: "0 0 0 3px rgba(0,154,68,0.12)",
    background: "var(--color-surface)",
  };

  if (column.data_type === "enum") {
    return (
      <select ref={ref} value={String(draft)}
        onChange={(e) => { setDraft(e.target.value); onCommit(e.target.value); }}
        onBlur={() => onCommit(draft)}
        onKeyDown={handleKey}
        style={style}>
        <option value="">—</option>
        {(column.rules.options ?? []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }

  const inputType =
    column.data_type === "number" ? "number"
    : column.data_type === "date" ? "date"
    : "text";

  return (
    <input ref={ref} type={inputType}
      value={String(draft)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={handleKey}
      style={style} />
  );
}

import { useState, useRef, useEffect, useMemo } from "react";
import type { ColumnDefinition } from "../types";
import { validateCell } from "../utils/validation";

export type NavDir = "next-col" | "prev-col" | "next-row" | "prev-row";

interface Props {
  column: ColumnDefinition;
  value: unknown;
  onCommit: (value: unknown, nav?: NavDir) => void;
  onCancel: () => void;
}

export default function CellEditor({ column, value, onCommit, onCancel }: Props) {
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Live validation — runs as the user types
  const error = useMemo(() => validateCell(draft, column), [draft, column]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select?.();
    selectRef.current?.focus();
    textareaRef.current?.focus();
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); return; }
    if (e.key === "Enter")  { e.preventDefault(); onCommit(draft, "next-row"); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      onCommit(draft, e.shiftKey ? "prev-col" : "next-col");
      return;
    }
    if (e.key === "ArrowUp")   { e.preventDefault(); onCommit(draft, "prev-row"); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); onCommit(draft, "next-row"); return; }
  };

  const base: React.CSSProperties = {
    width: "100%",
    padding: "5px 8px",
    boxSizing: "border-box",
    fontSize: "inherit",
    border: `1.5px solid ${error ? "var(--pm-red-500)" : "var(--color-primary)"}`,
    borderRadius: "var(--radius-xs)",
    outline: "none",
    boxShadow: error ? "0 0 0 3px rgba(220, 38, 38, 0.16)" : "0 0 0 3px rgba(0,154,68,0.12)",
    background: "var(--color-surface)",
  };

  // Floating error message (positioned absolutely under the input)
  const errorBubble = error ? (
    <div style={{
      position: "absolute", top: "100%", left: 0, marginTop: 2,
      padding: "3px 8px", fontSize: 11, fontWeight: 600, lineHeight: 1.2,
      background: "var(--pm-red-500)", color: "#fff",
      borderRadius: 4, whiteSpace: "nowrap", zIndex: 20,
      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
      pointerEvents: "none",
    }}>
      ⚠ {error}
    </div>
  ) : null;

  const wrap = (input: React.ReactNode) => (
    <div style={{ position: "relative", width: "100%" }} title={error ?? undefined}>
      {input}
      {errorBubble}
    </div>
  );

  // ── Boolean ──────────────────────────────────────────────────────────────────
  if (column.data_type === "boolean") {
    const boolVal = draft === true || String(draft).toLowerCase() === "true";
    return wrap(
      <select ref={selectRef} value={boolVal ? "true" : "false"}
        onChange={(e) => { const v = e.target.value === "true"; setDraft(v); onCommit(v); }}
        onBlur={() => onCommit(draft)}
        onKeyDown={handleKey}
        style={base}>
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    );
  }

  // ── Enum (single select) ──────────────────────────────────────────────────────
  if (column.data_type === "enum") {
    return wrap(
      <select ref={selectRef} value={String(draft)}
        onChange={(e) => { setDraft(e.target.value); onCommit(e.target.value); }}
        onBlur={() => onCommit(draft)}
        onKeyDown={handleKey}
        style={base}>
        <option value="">—</option>
        {(column.rules.options ?? []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }

  // ── Multiselect ───────────────────────────────────────────────────────────────
  if (column.data_type === "multiselect") {
    const opts = column.rules.options ?? [];
    const current: string[] = Array.isArray(draft)
      ? (draft as string[])
      : String(draft).split(",").map((s) => s.trim()).filter(Boolean);

    const toggle = (opt: string) => {
      const next = current.includes(opt)
        ? current.filter((v) => v !== opt)
        : [...current, opt];
      setDraft(next);
    };

    return (
      <div style={{ position: "relative", padding: "6px 8px", background: "var(--color-surface)",
        border: `1.5px solid ${error ? "var(--pm-red-500)" : "var(--color-primary)"}`,
        borderRadius: "var(--radius-xs)",
        boxShadow: error ? "0 0 0 3px rgba(220, 38, 38, 0.16)" : "0 0 0 3px rgba(0,154,68,0.12)",
        minWidth: 160 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {opts.map((opt) => {
            const sel = current.includes(opt);
            return (
              <button key={opt} type="button" onClick={() => toggle(opt)}
                style={{
                  padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", border: "1.5px solid",
                  background: sel ? "var(--color-primary)" : "transparent",
                  color: sel ? "#fff" : "var(--color-text-secondary)",
                  borderColor: sel ? "var(--color-primary)" : "var(--color-border)",
                  transition: "all 0.1s",
                }}>
                {opt}
              </button>
            );
          })}
        </div>
        <button className="btn btn-primary" style={{ height: 24, fontSize: 11, padding: "0 10px" }}
          onClick={() => onCommit(draft)}>
          OK
        </button>
        {errorBubble}
      </div>
    );
  }

  // ── Rating (stars) ────────────────────────────────────────────────────────────
  if (column.data_type === "rating") {
    const maxRating = column.rules.max_rating ?? 5;
    const current = Number(draft) || 0;
    return (
      <div style={{ position: "relative", display: "flex", gap: 2, padding: "4px 8px", alignItems: "center" }}>
        {Array.from({ length: maxRating }, (_, i) => i + 1).map((star) => (
          <button key={star} type="button"
            onClick={() => { setDraft(star); onCommit(star); }}
            style={{ background: "none", border: "none", cursor: "pointer",
              fontSize: 20, padding: 0, lineHeight: 1,
              color: star <= current ? "#F59E0B" : "var(--color-border)",
              transition: "color 0.1s" }}>
            ★
          </button>
        ))}
        {current > 0 && (
          <button type="button" onClick={() => { setDraft(0); onCommit(0); }}
            style={{ background: "none", border: "none", cursor: "pointer",
              fontSize: 11, color: "var(--color-text-muted)", marginLeft: 4 }}>
            ✕
          </button>
        )}
        {errorBubble}
      </div>
    );
  }

  // ── Long text (textarea) ──────────────────────────────────────────────────────
  if (column.data_type === "long_text") {
    return wrap(
      <textarea ref={textareaRef}
        value={String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onCancel(); return; }
          if (e.key === "Tab") { e.preventDefault(); onCommit(draft, e.shiftKey ? "prev-col" : "next-col"); return; }
          // Enter inserts newline (no navigation for long_text)
        }}
        style={{ ...base, minHeight: 72, resize: "vertical" }} />
    );
  }

  // ── Currency / Percent / Number ───────────────────────────────────────────────
  if (column.data_type === "currency" || column.data_type === "percent" || column.data_type === "number") {
    return wrap(
      <input ref={inputRef} type="number"
        value={String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={handleKey}
        style={base} />
    );
  }

  // ── URL ───────────────────────────────────────────────────────────────────────
  if (column.data_type === "url") {
    return wrap(
      <input ref={inputRef} type="url"
        value={String(draft)}
        placeholder="https://"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={handleKey}
        style={base} />
    );
  }

  // ── Email ─────────────────────────────────────────────────────────────────────
  if (column.data_type === "email") {
    return wrap(
      <input ref={inputRef} type="email"
        value={String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={handleKey}
        style={base} />
    );
  }

  // ── Phone ─────────────────────────────────────────────────────────────────────
  if (column.data_type === "phone") {
    return wrap(
      <input ref={inputRef} type="tel"
        value={String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={handleKey}
        style={base} />
    );
  }

  // ── Date ──────────────────────────────────────────────────────────────────────
  if (column.data_type === "date") {
    return wrap(
      <input ref={inputRef} type="date"
        value={String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={handleKey}
        style={base} />
    );
  }

  // ── Default (text, relation, long_text fallback) ──────────────────────────────
  return wrap(
    <input ref={inputRef} type="text"
      value={String(draft)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={handleKey}
      style={base} />
  );
}

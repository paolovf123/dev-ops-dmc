import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDefinition } from "../types";
import { validateCell } from "../utils/validation";
import { getRecords, getColumns } from "../api/datasets";

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

  // ── Relation (multi-chip N:N) ─────────────────────────────────────────────────
  if (column.data_type === "relation") {
    return (
      <RelationCellEditor
        column={column}
        value={value}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  }

  // ── Default (text, long_text fallback) ────────────────────────────────────────
  return wrap(
    <input ref={inputRef} type="text"
      value={String(draft)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={handleKey}
      style={base} />
  );
}

// ── Editor multi-chip para columnas data_type=relation ─────────────────────────
function RelationCellEditor({ column, value, onCommit, onCancel }: Props) {
  // Normalizamos el valor entrante a array (modelo N:N unificado)
  const initialItems = useMemo<string[]>(() => {
    if (Array.isArray(value)) return (value as unknown[]).map((v) => String(v)).filter(Boolean);
    if (value == null || value === "") return [];
    return [String(value)];
  }, [value]);

  const [items, setItems] = useState<string[]>(initialItems);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const targetId = column.rules?.related_dataset_id as string | undefined;
  const displayField = (column.rules?.display_field as string | undefined) ?? "__id__";

  // Debounce del input para no spamear el backend en cada tecla
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch columnas del target para conocer display_field
  const { data: targetCols = [] } = useQuery({
    queryKey: ["columns", targetId],
    queryFn: () => getColumns(targetId!),
    enabled: !!targetId,
    staleTime: 60_000,
  });

  // Fetch registros del target. Para datasets pequeños/medianos (<= 1000 rows)
  // cargamos todo. Para más grandes hacemos server-side search en cada query
  // (max 1000 resultados por request — el backend filtra por ILIKE sobre data).
  // Cuando NO hay query, también obtenemos primeros 1000 + los items ya seleccionados
  // (esos vienen por id en una query separada para garantizar que se vean los actuales).
  const { data: targetRecs = [], isLoading } = useQuery({
    queryKey: ["records", targetId, "relation-picker", debouncedQuery],
    queryFn: () => getRecords(targetId!, {
      limit: 1000,
      ...(debouncedQuery ? { search: debouncedQuery } : {}),
    }).then((r) => r.data),
    enabled: !!targetId,
    staleTime: 30_000,
  });

  // Fetch específico para resolver labels de los items ya seleccionados que
  // pueden NO estar en la primera página (si target tiene > 1000 records).
  const itemsKey = items.join("|");
  const { data: selectedRecs = [] } = useQuery({
    queryKey: ["records", targetId, "relation-picker-selected", itemsKey],
    queryFn: async () => {
      if (!items.length) return [];
      // Buscamos cada item por separado. Para chips por __id__ no aplica
      // (no hay search por id). Para chips por display_field, search por valor.
      if (displayField === "__id__" || displayField === "id") return [];
      const queries = items.map((it) =>
        getRecords(targetId!, { search: it, limit: 50 }).then((r) => r.data)
      );
      const results = await Promise.all(queries);
      const flat = results.flat();
      const seen = new Set<string>();
      return flat.filter((r) => seen.has(r.id) ? false : (seen.add(r.id), true));
    },
    enabled: !!targetId && items.length > 0,
    staleTime: 30_000,
  });

  // Pool combinado de records para resolver labels (autocomplete + selected)
  const allRecs = useMemo(() => {
    const seen = new Set<string>();
    const out = [...targetRecs];
    for (const r of selectedRecs) {
      if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
    }
    for (const r of targetRecs) seen.add(r.id);
    return out;
  }, [targetRecs, selectedRecs]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Click fuera del editor → commit
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCommit(items);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [items, onCommit]);

  // Resolver display: dado un valor guardado (código o __id__), retorna el label visible.
  const labelFor = (val: string): string => {
    if (displayField === "__id__" || displayField === "id") {
      const rec = allRecs.find((r) => r.id === val);
      if (!rec) return val;
      const firstCol = targetCols[0];
      if (firstCol) return String(rec.data[firstCol.field_key] ?? val);
      return val;
    }
    return val;
  };

  // Opciones del autocomplete. El filtrado por texto se hace SERVER-SIDE via
  // debouncedQuery → solo filtramos aquí los items ya seleccionados.
  const options = useMemo(() => {
    return targetRecs.map((r) => {
      const storedKey = displayField === "__id__" || displayField === "id"
        ? r.id
        : String(r.data[displayField] ?? "");
      const labelKey = displayField === "__id__" || displayField === "id"
        ? String(r.data[targetCols[0]?.field_key ?? ""] ?? r.id)
        : storedKey;
      return { storedKey, labelKey };
    }).filter((o) => o.storedKey && !items.includes(o.storedKey)).slice(0, 100);
  }, [targetRecs, items, displayField, targetCols]);

  const addItem = (storedKey: string) => {
    if (!storedKey || items.includes(storedKey)) return;
    setItems((prev) => [...prev, storedKey]);
    setQuery("");
    inputRef.current?.focus();
  };

  const removeItem = (storedKey: string) => {
    setItems((prev) => prev.filter((it) => it !== storedKey));
    inputRef.current?.focus();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Si hay una opción exacta o la primera del filtrado, agregarla
      if (options.length > 0) {
        addItem(options[0].storedKey);
      } else if (query.trim()) {
        // Permitir valor libre (útil si el target no tiene records aún)
        addItem(query.trim());
      } else {
        onCommit(items);
      }
      return;
    }
    if (e.key === "Backspace" && query === "" && items.length > 0) {
      e.preventDefault();
      removeItem(items[items.length - 1]);
    }
  };

  return (
    <div ref={containerRef} style={{
      position: "relative", background: "var(--color-surface)",
      border: "1.5px solid var(--color-primary)", borderRadius: "var(--radius-xs)",
      boxShadow: "0 0 0 3px rgba(0,154,68,0.12)",
      padding: 4, minWidth: 240, maxWidth: 480,
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {items.map((it) => (
          <span key={it} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 11.5, fontWeight: 600, padding: "2px 4px 2px 8px", borderRadius: 99,
            background: "#FCE7F3", color: "#DB2777", border: "1px solid #FBCFE8",
          }}>
            <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {labelFor(it)}
            </span>
            <button onClick={() => removeItem(it)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, lineHeight: 1, color: "#DB2777", padding: "0 2px" }}>
              ×
            </button>
          </span>
        ))}
        <input ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={items.length === 0 ? "Buscar y agregar…" : ""}
          style={{
            flex: 1, minWidth: 80, border: "none", outline: "none",
            background: "transparent", fontSize: 12, padding: "3px 4px",
          }} />
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 2, zIndex: 100,
          background: "var(--color-surface)", border: "1px solid var(--color-border)",
          borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          maxHeight: 220, overflowY: "auto",
        }}>
          {isLoading ? (
            <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--color-text-muted)" }}>
              Cargando…
            </div>
          ) : !targetId ? (
            <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--pm-red-500)" }}>
              Esta columna no tiene dataset destino configurado.
            </div>
          ) : options.length === 0 ? (
            <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--color-text-muted)" }}>
              {query ? (
                <>Sin resultados para "{query}". <button onClick={() => addItem(query.trim())}
                  style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", padding: 0, textDecoration: "underline", fontSize: 12 }}>
                  Agregar como texto libre
                </button></>
              ) : items.length > 0 ? "No quedan opciones para agregar." : "Empieza a escribir…"}
            </div>
          ) : (
            options.map((o) => (
              <button key={o.storedKey} onClick={() => addItem(o.storedKey)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "6px 12px", fontSize: 12.5, cursor: "pointer",
                  background: "none", border: "none",
                  borderBottom: "1px solid var(--color-border-light)",
                  color: "var(--color-text)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                <span style={{ fontWeight: 600 }}>{o.labelKey}</span>
                {o.labelKey !== o.storedKey && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "var(--color-text-muted)" }}>
                    {o.storedKey}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

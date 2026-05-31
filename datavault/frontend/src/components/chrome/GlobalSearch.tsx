import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { getDatasets, getRecords } from "../../api/datasets";
import { useWorkspace } from "../../workspace/WorkspaceContext";
import { Kbd } from "../ui/kit";

/** Buscador global del topbar: busca registros en todos los datasets accesibles
 *  (server-side, debounced) y muestra un dropdown de resultados agrupados por dataset. */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const { current: workspace } = useWorkspace();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const place = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left, y: r.bottom + 6, w: Math.max(r.width, 360) });
  };

  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", workspace?.id ?? "all"],
    queryFn: () => getDatasets(workspace ? { workspace_id: workspace.id } : undefined),
  });

  const active = term.length >= 2 && open;
  const queries = useQueries({
    queries: datasets.map((ds) => ({
      queryKey: ["records", ds.id, "gsearch", term],
      queryFn: () => getRecords(ds.id, { search: term, limit: 20 }),
      enabled: active,
      staleTime: 15_000,
    })),
  });

  const results = active
    ? datasets.flatMap((ds, i) => {
        const hits = queries[i]?.data?.data ?? [];
        return hits.slice(0, 4).map((rec) => ({ ds, rec }));
      }).slice(0, 24)
    : [];
  const loading = active && queries.some((x) => x.isLoading);

  const go = (dsId: string) => { setOpen(false); setQ(""); setTerm(""); navigate(`/datasets/${dsId}`); };

  const grouped = new Map<string, { name: string; items: typeof results }>();
  for (const r of results) {
    const g = grouped.get(r.ds.id) ?? { name: r.ds.name, items: [] };
    g.items.push(r);
    grouped.set(r.ds.id, g);
  }

  const label = (data: Record<string, unknown>) => {
    const vals = Object.values(data).map((v) => String(v ?? "")).filter(Boolean);
    return vals.find((v) => v.toLowerCase().includes(term.toLowerCase())) ?? vals[0] ?? "—";
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: "1 1 420px", maxWidth: 520, minWidth: 200 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 9, height: 38, padding: "0 12px",
        borderRadius: "var(--r-2)", border: `1px solid ${open ? "var(--accent-pri)" : "var(--border)"}`,
        background: "var(--surface-2)", boxShadow: open ? "var(--shadow-focus)" : "none",
        transition: "all var(--t-fast)",
      }}>
        <Search size={17} style={{ color: "var(--text-mute)", flex: "none" }} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); place(); }}
          onFocus={() => { setOpen(true); place(); }}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); } }}
          placeholder="Buscar dataset, registro…"
          style={{ flex: 1, background: "transparent", border: 0, outline: 0, font: "400 14px/1 var(--font-sans)", color: "var(--text)", minWidth: 0 }}
        />
        <Kbd>⌘K</Kbd>
      </div>

      {open && term.length >= 2 && pos && (
        <div className="og-pop" style={{
          position: "fixed", left: pos.x, top: pos.y, width: pos.w, maxWidth: 460, maxHeight: 420,
          overflowY: "auto", zIndex: 600, background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-3)", boxShadow: "var(--shadow-3)", padding: 6,
        }}>
          {results.length === 0 ? (
            <div style={{ padding: "14px 16px", font: "400 13px/1 var(--font-sans)", color: "var(--text-mute)" }}>
              {loading ? "Buscando…" : "Sin resultados"}
            </div>
          ) : (
            <>
              {[...grouped.values()].map((g) => (
                <div key={g.name}>
                  <div style={{ font: "600 11px/1 var(--font-sans)", letterSpacing: ".06em", color: "var(--text-mute)", textTransform: "uppercase", padding: "8px 10px 6px" }}>{g.name}</div>
                  {g.items.map(({ rec, ds }) => (
                    <button key={rec.id} className="og-menu-item" onClick={() => go(ds.id)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--r-2)",
                      cursor: "pointer", border: "none", background: "transparent", width: "100%", textAlign: "left",
                      font: "500 13.5px/1.3 var(--font-sans)", color: "var(--text)",
                    }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label(rec.data)}</span>
                    </button>
                  ))}
                </div>
              ))}
              <div style={{ padding: "6px 14px 8px", borderTop: "1px solid var(--border-soft)", font: "400 11px/1 var(--font-sans)", color: "var(--text-mute)" }}>
                {results.length} resultado{results.length !== 1 ? "s" : ""}{results.length === 24 ? " (máx)" : ""}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

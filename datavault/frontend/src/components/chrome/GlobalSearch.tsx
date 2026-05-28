import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { getDatasets, getRecords } from "../../api/datasets";
import { useWorkspace } from "../../workspace/WorkspaceContext";

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

  // Debounce del término que dispara las queries
  useEffect(() => {
    const id = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  // Cerrar al click fuera
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

  // Agrupar por dataset
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
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <span
        className="search"
        style={{ background: "var(--surface-alt)", border: `1px solid ${open ? "var(--accent-pri)" : "transparent"}`, maxWidth: 320, minWidth: 240 }}
      >
        <Search />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); place(); }}
          onFocus={() => { setOpen(true); place(); }}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); } }}
          placeholder="Buscar dataset, registro…"
          style={{ flex: 1, background: "transparent", border: 0, outline: 0, font: "inherit", color: "var(--text)", minWidth: 0 }}
        />
      </span>

      {open && term.length >= 2 && pos && (
        <div
          className="global-search-results"
          style={{ position: "fixed", left: pos.x, top: pos.y, width: pos.w, maxWidth: 460, maxHeight: 420, overflowY: "auto", zIndex: 600 }}
        >
          {results.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-mute)" }}>
              {loading ? "Buscando…" : "Sin resultados"}
            </div>
          ) : (
            <>
              {[...grouped.values()].map((g) => (
                <div key={g.name} className="global-search-group">
                  <div className="global-search-group-header">{g.name}</div>
                  {g.items.map(({ rec, ds }) => (
                    <button key={rec.id} className="global-search-item" onClick={() => go(ds.id)}>
                      <span className="global-search-item-name">{label(rec.data)}</span>
                    </button>
                  ))}
                </div>
              ))}
              <div style={{ padding: "6px 14px 8px", borderTop: "1px solid var(--border-soft)", fontSize: 11, color: "var(--text-mute)" }}>
                {results.length} resultado{results.length !== 1 ? "s" : ""}{results.length === 24 ? " (máx)" : ""}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

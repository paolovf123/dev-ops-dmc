import { useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { getDatasets, getColumns, computeDataset, createDataset, updateDataset } from "../api/datasets";
import { useToast } from "../components/Toast";
import UserMenu from "../components/UserMenu";
import type { Dataset, ColumnDefinition } from "../types";

const EXAMPLE_CODE = `# ── Entorno disponible ────────────────────────────────────────────────────────
# Los datasets fuente se cargan como DataFrames de pandas.
# El nombre de la variable = nombre del dataset en minúsculas con guiones bajos.
# La columna especial '__id__' contiene el UUID de cada registro.
# Paquetes: pandas, numpy, scipy, scikit-learn, duckdb
#
# ── Opción A: pandas ──────────────────────────────────────────────────────────
# result = detalle.merge(producto, left_on='id_producto', right_on='__id__', how='left')
# result = result.groupby('nombre').agg(total=('cantidad','sum')).reset_index()
#
# ── Opción B: DuckDB (SQL completo sobre los DataFrames) ──────────────────────
# import duckdb
# result = duckdb.query("""
#     SELECT p.nombre, SUM(d.cantidad) AS total_unidades
#     FROM detalle d
#     JOIN producto p ON d.id_producto = p.__id__
#     GROUP BY p.nombre
#     ORDER BY total_unidades DESC
# """).df()

result = None  # ← Asigna aquí tu DataFrame resultado
`;

interface ComputeError {
  error: string;
  traceback?: string;
}

export default function ComputedDatasetEditor() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const isNew = datasetId === "new";

  // New dataset form state
  const [dsName, setDsName] = useState("");
  const [dsDesc, setDsDesc] = useState("");

  const { data: allDatasets = [] } = useQuery({
    queryKey: ["datasets"],
    queryFn: () => getDatasets(),
  });

  const existingDatasets = isNew ? allDatasets : allDatasets.filter((d) => d.id !== datasetId);

  const { data: dataset } = useQuery({
    queryKey: ["dataset", datasetId],
    queryFn: () => allDatasets.find((d) => d.id === datasetId) ?? null,
    enabled: !isNew && allDatasets.length > 0,
  });

  const [sourceIds, setSourceIds] = useState<string[]>(() =>
    dataset?.source_dataset_ids ?? []
  );
  const [code, setCode] = useState<string>(() =>
    dataset?.source_code ?? EXAMPLE_CODE
  );

  // Fetch columns for every selected source dataset
  const colQueries = useQueries({
    queries: sourceIds.map((id) => ({
      queryKey: ["columns", id],
      queryFn: () => getColumns(id),
      staleTime: 60_000,
    })),
  });

  // Map dataset id → columns
  const colsByDataset: Record<string, ColumnDefinition[]> = {};
  sourceIds.forEach((id, i) => {
    colsByDataset[id] = colQueries[i]?.data ?? [];
  });

  function varName(ds: Dataset) {
    return ds.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "_");
  }

  function generateTemplate() {
    const selected = existingDatasets.filter((d) => sourceIds.includes(d.id));
    if (selected.length === 0) return;

    const lines: string[] = [];

    // Header comment with column list per dataset
    selected.forEach((ds) => {
      const cols = colsByDataset[ds.id] ?? [];
      const colNames = ["__id__", ...cols.map((c) => c.field_key)];
      lines.push(`# ${varName(ds)} — columnas disponibles:`);
      lines.push(`#   ${colNames.join(", ")}`);
    });

    lines.push("");

    // Example code based on number of selected datasets
    if (selected.length === 1) {
      const ds = selected[0];
      const vn = varName(ds);
      const cols = colsByDataset[ds.id] ?? [];
      const firstCol = cols[0]?.field_key ?? "columna";
      lines.push(`result = ${vn}.copy()`);
      lines.push(`# result = ${vn}.groupby('${firstCol}').size().reset_index(name='total')`);
    } else if (selected.length >= 2) {
      const [ds1, ds2] = selected;
      const vn1 = varName(ds1);
      const vn2 = varName(ds2);
      const cols1 = colsByDataset[ds1.id] ?? [];
      const cols2 = colsByDataset[ds2.id] ?? [];
      const fkCol = cols1.find((c) =>
        c.field_key.startsWith("id_") &&
        vn2.includes(c.field_key.slice(3))
      );
      const firstNumCol1 = cols1.find((c) => c.data_type === "number")?.field_key ?? cols1[0]?.field_key ?? "valor";
      const groupCol2 = cols2[0]?.field_key ?? "nombre";

      // Pandas variant
      lines.push("# ── Opción A: pandas ─────────────────────────────────────────────────");
      if (fkCol) {
        lines.push(`result = ${vn1}.merge(`);
        lines.push(`    ${vn2},`);
        lines.push(`    left_on='${fkCol.field_key}',`);
        lines.push(`    right_on='__id__',`);
        lines.push(`    how='left'`);
        lines.push(`)`);
        lines.push(`# result = result.groupby('${groupCol2}').agg(total=('${firstNumCol1}', 'sum')).reset_index()`);
      } else {
        lines.push(`result = ${vn1}.merge(`);
        lines.push(`    ${vn2},`);
        lines.push(`    left_on='__id__',   # ajusta la columna de join`);
        lines.push(`    right_on='__id__',`);
        lines.push(`    how='left'`);
        lines.push(`)`);
      }
      lines.push("");

      // DuckDB variant
      lines.push("# ── Opción B: DuckDB (SQL) ───────────────────────────────────────────");
      lines.push("import duckdb");
      lines.push("");
      if (fkCol) {
        lines.push(`result = duckdb.query("""`);
        lines.push(`    SELECT`);
        lines.push(`        t2.${groupCol2},`);
        lines.push(`        SUM(t1.${firstNumCol1}) AS total_${firstNumCol1},`);
        lines.push(`        COUNT(*) AS cantidad`);
        lines.push(`    FROM ${vn1} t1`);
        lines.push(`    JOIN ${vn2} t2 ON t1.${fkCol.field_key} = t2.__id__`);
        lines.push(`    GROUP BY t2.${groupCol2}`);
        lines.push(`    ORDER BY total_${firstNumCol1} DESC`);
        lines.push(`""").df()`);
      } else {
        lines.push(`result = duckdb.query("""`);
        lines.push(`    SELECT *`);
        lines.push(`    FROM ${vn1} t1`);
        lines.push(`    JOIN ${vn2} t2 ON t1.__id__ = t2.__id__  -- ajusta la condición de join`);
        lines.push(`    LIMIT 100`);
        lines.push(`""").df()`);
      }
    }

    setCode(lines.join("\n") + "\n");
  }
  const [computeError, setComputeError] = useState<ComputeError | null>(null);
  const [lastResult, setLastResult] = useState<{ records: number; columns: number } | null>(null);

  const handleEditorMount: OnMount = useCallback((ed, monaco) => {
    editorRef.current = ed;

    monaco.editor.defineTheme("blue-purple", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6272a4", fontStyle: "italic" },
        { token: "keyword", foreground: "82aaff" },
        { token: "string", foreground: "a8d8a8" },
        { token: "number", foreground: "f78c6c" },
        { token: "type", foreground: "c792ea" },
        { token: "delimiter", foreground: "89b4fa" },
        { token: "variable", foreground: "c8d3f5" },
      ],
      colors: {
        "editor.background":              "#171830",
        "editor.foreground":              "#c8d3f5",
        "editor.lineHighlightBackground": "#1f2148",
        "editor.selectionBackground":     "#3a3d7a88",
        "editorLineNumber.foreground":    "#3d4270",
        "editorLineNumber.activeForeground": "#7080c4",
        "editorCursor.foreground":        "#82aaff",
        "editorWhitespace.foreground":    "#2a2d5a",
        "editorIndentGuide.background1":  "#2a2d5a",
        "editorIndentGuide.activeBackground1": "#4a5080",
        "editor.findMatchBackground":     "#4a5af040",
        "editorBracketMatch.background":  "#3a3d7a60",
        "editorBracketMatch.border":      "#82aaff80",
        "scrollbarSlider.background":     "#3a3d7a60",
        "scrollbarSlider.hoverBackground":"#4a5080a0",
        "minimap.background":             "#13142b",
      },
    });
    monaco.editor.setTheme("blue-purple");

    ed.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });

    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      document.getElementById("btn-run")?.click();
    });
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      document.getElementById("btn-save")?.click();
    });
  }, []);

  const toggleSource = (id: string) => {
    setSourceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Save code + sources to existing computed dataset
  const saveMut = useMutation({
    mutationFn: () => updateDataset(datasetId!, {
      source_code: code,
      source_dataset_ids: sourceIds,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasets"] });
      toast("Guardado", "success");
    },
    onError: () => toast("Error guardando", "error"),
  });

  // Create new computed dataset
  const createMut = useMutation({
    mutationFn: () => createDataset(dsName.trim(), dsDesc.trim() || undefined, {
      is_computed: true,
      source_code: code,
      source_dataset_ids: sourceIds,
    }),
    onSuccess: (ds) => {
      qc.invalidateQueries({ queryKey: ["datasets"] });
      toast("Dataset calculado creado", "success");
      navigate(`/datasets/${ds.id}/computed`);
    },
    onError: () => toast("Error creando dataset", "error"),
  });

  // Run compute via Lambda
  const computeMut = useMutation({
    mutationFn: async () => {
      // Save first if editing existing
      if (!isNew) {
        await updateDataset(datasetId!, { source_code: code, source_dataset_ids: sourceIds });
      }
      return computeDataset(datasetId!);
    },
    onSuccess: (result) => {
      setComputeError(null);
      setLastResult({ records: result.records_created, columns: result.columns_created });
      qc.invalidateQueries({ queryKey: ["datasets"] });
      qc.invalidateQueries({ queryKey: ["columns", datasetId] });
      qc.invalidateQueries({ queryKey: ["records", datasetId] });
      toast(`Calculado: ${result.records_created} registros, ${result.columns_created} columnas`, "success");
    },
    onError: (e: unknown) => {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      if (detail && typeof detail === "object" && "error" in detail) {
        setComputeError(detail as ComputeError);
      } else {
        setComputeError({ error: String(detail ?? "Error desconocido") });
      }
      toast("Error en la ejecución del código", "error");
    },
  });

  const sourceNames = existingDatasets
    .filter((d) => sourceIds.includes(d.id))
    .map((d) => d.name);

  return (
    <>
      <header className="app-header">
        <button className="btn btn-ghost" onClick={() => navigate(isNew ? "/" : `/datasets/${datasetId}`)}
          style={{ padding: "5px 8px", fontSize: 18 }}>←</button>
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo" style={{ width: 28, height: 28, fontSize: 13, borderRadius: "var(--radius-xs)" }}><img src="/opsgrid-logo.svg" alt="OpsGrid" style={{ width: "100%", height: "100%" }} /></div>
          <span className="app-header-name">Ops<em>Grid</em></span>
        </button>
        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>
          {isNew ? "Nuevo dataset calculado" : `Editor: ${dataset?.name ?? "..."}`}
        </span>
        <span style={{
          fontSize: 11, padding: "2px 10px", borderRadius: 99, marginLeft: 8,
          background: "#7C3AED18", color: "#7C3AED",
          border: "1px solid #7C3AED40", fontWeight: 700,
        }}>⚡ Python + Lambda</span>
        <div className="app-header-spacer" />
        <UserMenu />
      </header>

      <main className="page" style={{ paddingTop: 24, maxWidth: 1280 }}>
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>

          {/* Left sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* New dataset form */}
            {isNew && (
              <div className="card" style={{ padding: 16 }}>
                <p className="section-title" style={{ margin: "0 0 10px" }}>Nombre del script</p>
                <input
                  placeholder="Ej. Resumen de ventas"
                  value={dsName}
                  onChange={(e) => setDsName(e.target.value)}
                  autoFocus
                  style={{ marginBottom: 8 }}
                />
                <input
                  placeholder="Descripción (opcional)"
                  value={dsDesc}
                  onChange={(e) => setDsDesc(e.target.value)}
                />
              </div>
            )}

            {/* Source datasets */}
            <div className="card" style={{ padding: 16 }}>
              <p className="section-title" style={{ margin: "0 0 8px" }}>Datasets fuente</p>
              <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "0 0 10px" }}>
                Cada dataset seleccionado estará disponible como un DataFrame.
              </p>
              {existingDatasets.filter((d) => !d.is_computed).length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No hay datasets disponibles.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {existingDatasets.filter((d) => !d.is_computed).map((d) => {
                    const vn = varName(d);
                    const selected = sourceIds.includes(d.id);
                    const cols = colsByDataset[d.id] ?? [];
                    return (
                      <label key={d.id} className="checkbox-row" style={{
                        padding: "8px 10px", borderRadius: 7, cursor: "pointer",
                        background: selected ? "var(--color-primary-bg)" : "transparent",
                        border: selected ? "1px solid var(--color-primary-border)" : "1px solid transparent",
                        alignItems: "flex-start",
                      }}>
                        <input type="checkbox" checked={selected} onChange={() => toggleSource(d.id)} style={{ marginTop: 3 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{d.name}</p>
                          {selected && (
                            <>
                              <code style={{ fontSize: 11, color: "var(--pm-green-600)" }}>{vn}</code>
                              {cols.length > 0 && (
                                <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                                  <code style={{ fontSize: 10, color: "#6B7280", background: "#F3F4F6", padding: "1px 5px", borderRadius: 4 }}>__id__</code>
                                  {cols.map((c) => (
                                    <code key={c.id} style={{ fontSize: 10, color: "#374151", background: "#F3F4F6", padding: "1px 5px", borderRadius: 4 }}>
                                      {c.field_key}
                                    </code>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Generate template button */}
            {sourceIds.length > 0 && (
              <div className="card" style={{ padding: 16 }}>
                <p className="section-title" style={{ margin: "0 0 6px" }}>Plantilla</p>
                <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--color-text-muted)" }}>
                  Script de inicio con columnas reales y variante DuckDB.
                </p>
                <button
                  className="btn btn-secondary"
                  style={{ width: "100%", fontSize: 12 }}
                  onClick={generateTemplate}
                >
                  Generar plantilla
                </button>
              </div>
            )}

            {/* Help */}
            <div className="card" style={{ padding: 16 }}>
              <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)" }}>
                Atajos de teclado
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  ["Ctrl + Enter", "Ejecutar"],
                  ["Ctrl + S", "Guardar"],
                  ["Ctrl + /", "Comentar línea"],
                  ["Alt + ↑↓", "Mover línea"],
                  ["Ctrl + D", "Duplicar selección"],
                  ["Ctrl + Z", "Deshacer"],
                ].map(([key, desc]) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <code style={{ background: "var(--color-border-light)", padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>{key}</code>
                    <span style={{ color: "var(--color-text-muted)" }}>{desc}</span>
                  </div>
                ))}
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                Asigna el resultado a <code>result</code> (DataFrame).<br />
                Paquetes: <code>pandas</code>, <code>numpy</code>, <code>duckdb</code>, <code>scipy</code>, <code>scikit-learn</code>
              </p>
            </div>
          </div>

          {/* Right: Monaco editor */}
          <div style={{ display: "flex", flexDirection: "column", background: "#171830", borderRadius: 10, overflow: "hidden", border: "1px solid #2a2d5a", boxShadow: "0 4px 24px rgba(30,32,80,0.18)" }}>

            {/* Toolbar */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 16px", background: "#13142b",
              borderBottom: "1px solid #2a2d5a", flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: "#c8d3f5", fontWeight: 600 }}>
                  {isNew ? "nuevo_script.py" : `${dataset?.name?.toLowerCase().replace(/\s+/g, "_") ?? "script"}.py`}
                </span>
                {sourceIds.length > 0 && (
                  <span style={{ fontSize: 11, color: "#4a5080", borderLeft: "1px solid #2a2d5a", paddingLeft: 10 }}>
                    {sourceNames.join(", ")}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {!isNew && (
                  <button
                    id="btn-save"
                    style={{
                      fontSize: 12, padding: "4px 14px", borderRadius: 5, border: "1px solid #3a3d7a",
                      background: "transparent", color: "#c8d3f5", cursor: "pointer",
                    }}
                    onClick={() => saveMut.mutate()}
                    disabled={saveMut.isPending}
                  >
                    {saveMut.isPending ? "Guardando..." : "Guardar"}
                  </button>
                )}
                {isNew ? (
                  <button
                    id="btn-run"
                    style={{
                      fontSize: 12, padding: "4px 16px", borderRadius: 5, border: "none",
                      background: "#7C3AED", color: "white", cursor: "pointer",
                      opacity: !dsName.trim() || sourceIds.length === 0 ? 0.45 : 1,
                      fontWeight: 600,
                    }}
                    onClick={() => createMut.mutate()}
                    disabled={!dsName.trim() || sourceIds.length === 0 || createMut.isPending}
                  >
                    {createMut.isPending ? "⏳ Creando..." : "Crear dataset"}
                  </button>
                ) : (
                  <button
                    id="btn-run"
                    style={{
                      fontSize: 12, padding: "4px 16px", borderRadius: 5, border: "none",
                      background: computeMut.isPending ? "#2a2d5a" : "#4B5FF0",
                      color: "white", cursor: computeMut.isPending ? "default" : "pointer",
                      opacity: sourceIds.length === 0 ? 0.45 : 1,
                      fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
                    }}
                    onClick={() => computeMut.mutate()}
                    disabled={sourceIds.length === 0 || computeMut.isPending}
                  >
                    {computeMut.isPending
                      ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span> Ejecutando...</>
                      : "▶  Ejecutar  "}
                    {!computeMut.isPending && (
                      <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>Ctrl+↵</span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Monaco Editor */}
            <div style={{ height: 620, overflow: "hidden" }}>
              <Editor
                height="620px"
                language="python"
                theme="blue-purple"
                value={code}
                onChange={(val) => setCode(val ?? "")}
                onMount={handleEditorMount}
                options={{
                  fontSize: 14,
                  lineHeight: 22,
                  fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
                  fontLigatures: true,
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  cursorSmoothCaretAnimation: "on",
                  renderLineHighlight: "all",
                  bracketPairColorization: { enabled: true },
                  guides: { bracketPairs: true, indentation: true },
                  padding: { top: 16, bottom: 16 },
                  tabSize: 4,
                  insertSpaces: true,
                  wordWrap: "off",
                  suggestOnTriggerCharacters: true,
                  quickSuggestions: true,
                  formatOnPaste: true,
                }}
              />
            </div>

            {/* Status bar */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "3px 14px", background: "#2a3580", flexShrink: 0,
            }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>Python</span>
                {(computeError || lastResult) && (
                  <span style={{
                    fontSize: 11, color: "rgba(255,255,255,0.85)",
                    borderLeft: "1px solid rgba(255,255,255,0.3)", paddingLeft: 12,
                  }}>
                    {computeError
                      ? `✗ ${computeError.error.slice(0, 60)}${computeError.error.length > 60 ? "…" : ""}`
                      : `✓ ${lastResult!.records.toLocaleString()} registros · ${lastResult!.columns} columnas`}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                {lastResult && !computeError && !isNew && (
                  <button
                    style={{ fontSize: 11, color: "white", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                    onClick={() => navigate(`/datasets/${datasetId}`)}
                  >
                    Ver dataset →
                  </button>
                )}
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                  Ln {cursorPos.line}, Col {cursorPos.col}
                </span>
              </div>
            </div>

            {/* Error panel */}
            {computeError && (
              <div style={{
                background: "#150e2a", borderTop: "2px solid #DC2626",
                padding: "12px 16px", maxHeight: 180, overflowY: "auto", flexShrink: 0,
              }}>
                <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#F87171", fontSize: 12 }}>
                  Error en la ejecución
                </p>
                <p style={{ margin: "0 0 6px", fontSize: 12, color: "#FCA5A5" }}>{computeError.error}</p>
                {computeError.traceback && (
                  <pre style={{
                    margin: 0, fontSize: 11, color: "#FCA5A5",
                    background: "#2a0a0a", padding: "8px 10px", borderRadius: 4,
                    overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
                  }}>{computeError.traceback}</pre>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

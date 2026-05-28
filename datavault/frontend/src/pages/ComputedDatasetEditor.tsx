import { useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import {
  FunctionSquare, Sparkles, Play, Save, X, CheckCircle2, Clock, AlertTriangle,
} from "lucide-react";
import { getDatasets, getColumns, computeDataset, createDataset, updateDataset } from "../api/datasets";
import { useToast } from "../components/Toast";
import AppShell from "../components/chrome/AppShell";
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

// Tipo de columna → glifo corto que se muestra en el chip (estilo mockup)
function colTypeGlyph(t: ColumnDefinition["data_type"]): string {
  switch (t) {
    case "number": case "rating": return "#";
    case "currency": return "$";
    case "percent": return "%";
    case "date": return "D";
    case "enum": case "multiselect": case "boolean": return "▾";
    case "relation": return "◇";
    default: return "A";
  }
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

  // Output panel tab
  const [outTab, setOutTab] = useState<"preview" | "summary" | "logs">("preview");

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
    toast("Plantilla generada", "success");
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
        "editor.background":              "#0e111a",
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
        "minimap.background":             "#0b0e16",
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

  // Run compute via executor
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
      setOutTab("preview");
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
      setOutTab("logs");
      toast("Error en la ejecución del código", "error");
    },
  });

  const sourceNames = existingDatasets
    .filter((d) => sourceIds.includes(d.id))
    .map((d) => d.name);

  const fileName = isNew
    ? `${(dsName.trim() ? dsName : "nuevo_script").toLowerCase().replace(/\s+/g, "_")}.py`
    : `${dataset?.name?.toLowerCase().replace(/\s+/g, "_") ?? "script"}.py`;

  const availableSources = existingDatasets.filter((d) => !d.is_computed);

  const isRunning = computeMut.isPending;
  const hasOutput = !!(lastResult || computeError);

  return (
    <AppShell active="scripts">
      <main
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr 340px",
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* ─────────────── LEFT: fuentes de datos ─────────────── */}
        <aside className="se-sources">
          <div className="se-sources__head">
            <span className="se-sources__title">Fuentes de datos</span>
            <button
              className="dv-topbar__icon-btn"
              title="Generar plantilla"
              onClick={generateTemplate}
              disabled={sourceIds.length === 0}
              style={{ opacity: sourceIds.length === 0 ? 0.4 : 1 }}
            >
              <Sparkles />
            </button>
          </div>

          {/* Formulario de nombre para script nuevo */}
          {isNew && (
            <div className="se-source" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              <span className="se-sources__title" style={{ fontSize: "var(--fs-11)" }}>Nombre del script</span>
              <input
                placeholder="Ej. Resumen de ventas"
                value={dsName}
                onChange={(e) => setDsName(e.target.value)}
                autoFocus
              />
              <input
                placeholder="Descripción (opcional)"
                value={dsDesc}
                onChange={(e) => setDsDesc(e.target.value)}
              />
            </div>
          )}

          {availableSources.length === 0 ? (
            <div className="se-source">
              <p style={{ margin: 0, fontSize: "var(--fs-12)", color: "var(--text-mute)" }}>
                No hay datasets disponibles.
              </p>
            </div>
          ) : (
            availableSources.map((d) => {
              const vn = varName(d);
              const selected = sourceIds.includes(d.id);
              const cols = colsByDataset[d.id] ?? [];
              const glyph = d.name.charAt(0).toUpperCase();
              return (
                <div
                  key={d.id}
                  className="se-source"
                  onClick={() => toggleSource(d.id)}
                  style={{
                    cursor: "pointer",
                    background: selected ? "var(--accent-calc-soft)" : undefined,
                  }}
                >
                  <div className="se-source__head">
                    <span className="glyph" style={selected ? { background: "var(--accent-calc)" } : undefined}>
                      {glyph}
                    </span>
                    {d.name}
                    {selected && cols.length > 0 && (
                      <span className="se-source__count">{cols.length} cols</span>
                    )}
                  </div>
                  {selected ? (
                    <>
                      <code style={{ fontSize: "var(--fs-11)", color: "var(--accent-calc)", fontFamily: "var(--font-mono)" }}>{vn}</code>
                      <div className="se-source__cols" style={{ marginTop: "var(--sp-1)" }}>
                        <span className="se-source__col">__id__ <span className="ty">#</span></span>
                        {cols.map((c) => (
                          <span
                            key={c.id}
                            className={`se-source__col${c.data_type === "relation" ? " is-rel" : ""}`}
                          >
                            {c.field_key} <span className="ty">{colTypeGlyph(c.data_type)}</span>
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: "var(--fs-11)", color: "var(--text-mute)" }}>
                      Click para usar como DataFrame
                    </p>
                  )}
                </div>
              );
            })
          )}

          {/* Salida del script (columnas calculadas) — tras una ejecución */}
          {lastResult && !computeError && (
            <div className="se-source" style={{ background: "var(--surface-alt)" }}>
              <div className="se-source__head">
                <span className="glyph" style={{ background: "var(--accent-calc)" }}>ƒ</span>
                Salida del script
              </div>
              <p style={{ margin: 0, fontSize: "var(--fs-11)", color: "var(--text-soft)", lineHeight: 1.5 }}>
                Última corrida: <b style={{ color: "var(--accent-calc)" }}>{lastResult.records.toLocaleString()}</b> filas ·{" "}
                <b style={{ color: "var(--accent-calc)" }}>{lastResult.columns}</b> columnas calculadas.
              </p>
            </div>
          )}
        </aside>

        {/* ─────────────── CENTER: editor de código (Monaco) ─────────────── */}
        <section className="se-main">
          <div className="se-tabs">
            <span className="se-tab is-active">
              <FunctionSquare /> {fileName}
              {!isNew && (
                <span
                  className="close"
                  onClick={() => navigate(`/datasets/${datasetId}`)}
                  title="Cerrar"
                >
                  <X style={{ width: 11, height: 11 }} />
                </span>
              )}
            </span>
          </div>

          <div className="se-actions">
            <span className="se-pill"><FunctionSquare /> ƒ Computed dataset</span>
            {sourceIds.length > 0 && (
              <span style={{ fontSize: "var(--fs-11)", color: "#b5bbc9", fontFamily: "var(--font-mono)" }}>
                Fuentes: {sourceNames.join(", ")}
              </span>
            )}
            <span className="grow" />
            <button
              className="btn btn--secondary btn--sm"
              style={{ background: "transparent", color: "#d4d8e2", borderColor: "#3a4051" }}
              onClick={generateTemplate}
              disabled={sourceIds.length === 0}
            >
              <Sparkles /> Plantilla
            </button>
            {!isNew && (
              <button
                id="btn-save"
                className="btn btn--secondary btn--sm"
                style={{ background: "transparent", color: "#d4d8e2", borderColor: "#3a4051" }}
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
              >
                <Save /> {saveMut.isPending ? "Guardando…" : "Guardar"}
              </button>
            )}
            {isNew ? (
              <button
                id="btn-run"
                className="btn btn--primary btn--sm"
                style={{ background: "var(--accent-calc)", borderColor: "var(--accent-calc)", opacity: !dsName.trim() || sourceIds.length === 0 ? 0.45 : 1 }}
                onClick={() => createMut.mutate()}
                disabled={!dsName.trim() || sourceIds.length === 0 || createMut.isPending}
              >
                <Play /> {createMut.isPending ? "Creando…" : "Crear dataset"}
              </button>
            ) : (
              <button
                id="btn-run"
                className="btn btn--primary btn--sm"
                style={{ background: "var(--accent-calc)", borderColor: "var(--accent-calc)", opacity: sourceIds.length === 0 ? 0.45 : 1 }}
                onClick={() => computeMut.mutate()}
                disabled={sourceIds.length === 0 || isRunning}
              >
                <Play /> {isRunning ? "Ejecutando…" : "Ejecutar"}
              </button>
            )}
          </div>

          {/* Monaco real ocupa el row 1fr del grid .se-main */}
          <div style={{ minHeight: 0, overflow: "hidden" }}>
            <Editor
              height="100%"
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

          <div className="se-foot">
            <span className="se-foot__item"><CheckCircle2 /> Python 3.11 · pandas · numpy · duckdb</span>
            {hasOutput && (
              <span className="se-foot__item">
                {computeError
                  ? <><AlertTriangle /> {computeError.error.slice(0, 50)}{computeError.error.length > 50 ? "…" : ""}</>
                  : <><Clock /> {lastResult!.records.toLocaleString()} filas · {lastResult!.columns} columnas</>}
              </span>
            )}
            <span className="grow" />
            <span className="se-foot__item">UTF-8</span>
            <span className="se-foot__item">Ln {cursorPos.line}, Col {cursorPos.col}</span>
          </div>
        </section>

        {/* ─────────────── RIGHT: salida / preview ─────────────── */}
        <aside className="se-out">
          <div className="se-out__head">
            <span className="se-out__title">
              {computeError
                ? <><AlertTriangle style={{ color: "var(--accent-rel)" }} /> Resultado</>
                : <><CheckCircle2 /> Resultado</>}
            </span>
            {lastResult && !computeError && (
              <span style={{ fontSize: "var(--fs-11)", color: "var(--text-mute)" }}>
                <b style={{ color: "var(--success)", fontFamily: "var(--font-mono)", fontWeight: "var(--fw-semibold)" }}>
                  {lastResult.records.toLocaleString()} filas
                </b>
              </span>
            )}
          </div>

          <div className="se-out__tabs">
            <span
              className={`se-out__tab${outTab === "preview" ? " is-active" : ""}`}
              onClick={() => setOutTab("preview")}
            >
              Resumen
            </span>
            <span
              className={`se-out__tab${outTab === "logs" ? " is-active" : ""}`}
              onClick={() => setOutTab("logs")}
            >
              Logs
            </span>
          </div>

          <div className="se-out__body">
            {!hasOutput && (
              <p style={{ fontSize: "var(--fs-12)", color: "var(--text-mute)", lineHeight: 1.6 }}>
                {isNew
                  ? "Crea el dataset para poder ejecutar el script y ver el resultado aquí."
                  : "Pulsa “Ejecutar” (o Ctrl+↵) para correr el script. Aquí verás las métricas y los logs de la corrida."}
              </p>
            )}

            {/* Resumen / métricas */}
            {outTab === "preview" && lastResult && !computeError && (
              <>
                <div className="se-out__metric is-success">
                  <span className="label">Registros generados</span>
                  <span className="val">{lastResult.records.toLocaleString()}</span>
                </div>
                <div className="se-out__metric">
                  <span className="label">Columnas calculadas</span>
                  <span className="val">{lastResult.columns}</span>
                </div>
                <div className="se-out__metric">
                  <span className="label">Errores</span>
                  <span className="val" style={{ color: "var(--text-mute)" }}>0</span>
                </div>

                {!isNew && (
                  <button
                    className="btn btn--primary"
                    style={{ width: "100%", marginTop: "var(--sp-4)", background: "var(--accent-calc)", borderColor: "var(--accent-calc)" }}
                    onClick={() => navigate(`/datasets/${datasetId}`)}
                  >
                    Ver dataset →
                  </button>
                )}
              </>
            )}

            {/* Logs / error */}
            {outTab === "logs" && hasOutput && (
              <div className="se-log">
                {computeError ? (
                  <>
                    <div><span className="warn">⚠</span> Error en la ejecución</div>
                    <div style={{ color: "#ffb3b3", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{computeError.error}</div>
                    {computeError.traceback && (
                      <div style={{ color: "#9aa0ac", whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: "var(--sp-2)" }}>
                        {computeError.traceback}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div><span className="ok">✓</span> Script iniciado · {fileName}</div>
                    <div>Cargando {sourceNames.length} dataset(s) fuente…</div>
                    <div><span className="ok">✓</span> {lastResult!.records.toLocaleString()} registros escritos · {lastResult!.columns} columnas</div>
                  </>
                )}
              </div>
            )}
          </div>
        </aside>
      </main>
    </AppShell>
  );
}

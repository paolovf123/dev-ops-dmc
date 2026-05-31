import { useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import {
  FunctionSquare, Sparkles, Play, Save, X, CheckCircle2,
  Database, ArrowRight,
} from "lucide-react";
import { getDatasets, getColumns, computeDataset, createDataset, updateDataset } from "../api/datasets";
import { useToast } from "../components/Toast";
import AppShell from "../components/chrome/AppShell";
import { Btn, Kbd } from "../components/ui/kit";
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

// Tipo de columna → glifo corto que se muestra en el chip
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
        "editor.background":              "#0f1320",
        "editor.foreground":              "#c8d3e6",
        "editor.lineHighlightBackground": "#1b2336",
        "editor.selectionBackground":     "#3a3d7a88",
        "editorLineNumber.foreground":    "#4a5568",
        "editorLineNumber.activeForeground": "#7080c4",
        "editorCursor.foreground":        "#82aaff",
        "editorWhitespace.foreground":    "#232a3a",
        "editorIndentGuide.background1":  "#232a3a",
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

  // ── Colores fijos del chrome del editor (idénticos al prototipo: superficie oscura) ──
  const EDITOR_BG = "#0f1320";
  const EDITOR_BAR = "#121728";
  const EDITOR_LINE = "#232a3a";
  const EDITOR_TEXT = "#c8d3e6";
  const EDITOR_MUTE = "#6b7689";

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
        <aside style={{
          borderRight: "1px solid var(--border)", background: "var(--surface)",
          overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Database size={16} style={{ color: "var(--accent-pri)", flex: "none" }} />
            <span style={{ font: "600 13px/1 var(--font-sans)", color: "var(--text)" }}>Fuentes de datos</span>
            <div style={{ flex: 1 }} />
            <button
              className="og-iconbtn"
              title="Generar plantilla"
              onClick={generateTemplate}
              disabled={sourceIds.length === 0}
              style={{
                display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "var(--r-2)",
                border: "none", background: undefined, color: "var(--text-soft)",
                cursor: sourceIds.length === 0 ? "not-allowed" : "pointer",
                opacity: sourceIds.length === 0 ? 0.4 : 1,
              }}
            >
              <Sparkles size={16} />
            </button>
          </div>

          {/* Formulario de nombre para script nuevo */}
          {isNew && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 8, padding: "12px 12px",
              borderRadius: "var(--r-2)", background: "var(--surface-2)", border: "1px solid var(--border)",
            }}>
              <span style={{ font: "600 11.5px/1 var(--font-sans)", color: "var(--text-soft)" }}>Nombre del script</span>
              <input
                placeholder="Ej. Resumen de ventas"
                value={dsName}
                onChange={(e) => setDsName(e.target.value)}
                autoFocus
                style={{
                  height: 34, padding: "0 10px", borderRadius: "var(--r-2)",
                  border: "1px solid var(--border)", background: "var(--surface)",
                  color: "var(--text)", font: "400 13px/1 var(--font-sans)", outline: "none",
                }}
              />
              <input
                placeholder="Descripción (opcional)"
                value={dsDesc}
                onChange={(e) => setDsDesc(e.target.value)}
                style={{
                  height: 34, padding: "0 10px", borderRadius: "var(--r-2)",
                  border: "1px solid var(--border)", background: "var(--surface)",
                  color: "var(--text)", font: "400 13px/1 var(--font-sans)", outline: "none",
                }}
              />
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {availableSources.length === 0 ? (
              <p style={{ margin: 0, font: "400 12px/1.5 var(--font-sans)", color: "var(--text-mute)" }}>
                No hay datasets disponibles.
              </p>
            ) : (
              availableSources.map((d) => {
                const vn = varName(d);
                const selected = sourceIds.includes(d.id);
                const cols = colsByDataset[d.id] ?? [];
                return (
                  <div
                    key={d.id}
                    onClick={() => toggleSource(d.id)}
                    style={{
                      border: `1px solid ${selected ? "color-mix(in srgb, var(--accent-pri) 35%, transparent)" : "var(--border)"}`,
                      background: selected ? "var(--pri-soft)" : "var(--surface)",
                      borderRadius: "var(--r-2)", padding: "10px 11px", cursor: "pointer",
                      transition: "border-color var(--t-fast), background var(--t-fast)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        readOnly
                        tabIndex={-1}
                        style={{ accentColor: "var(--accent-pri)", width: 15, height: 15, pointerEvents: "none" }}
                      />
                      <span style={{ font: "600 13px/1.2 var(--font-sans)", color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                      {selected && cols.length > 0 && (
                        <span style={{ font: "500 10.5px/1 var(--font-sans)", color: "var(--text-mute)" }}>{cols.length} cols</span>
                      )}
                    </div>
                    {selected ? (
                      <>
                        <code className="mono" style={{ display: "block", font: "400 11px/1 var(--font-mono)", color: "var(--accent-pri)", marginTop: 6 }}>{vn}</code>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                          <span className="mono" style={{
                            font: "400 10.5px/1 var(--font-mono)", padding: "2px 6px", borderRadius: 5,
                            background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-soft)",
                          }}>__id__ <span style={{ color: "var(--text-mute)" }}>#</span></span>
                          {cols.map((c) => (
                            <span
                              key={c.id}
                              className="mono"
                              style={{
                                font: "400 10.5px/1 var(--font-mono)", padding: "2px 6px", borderRadius: 5,
                                background: c.data_type === "relation" ? "var(--rel-soft)" : "var(--surface)",
                                border: `1px solid ${c.data_type === "relation" ? "color-mix(in srgb, var(--accent-rel) 30%, transparent)" : "var(--border)"}`,
                                color: c.data_type === "relation" ? "var(--accent-rel)" : "var(--text-soft)",
                              }}
                            >
                              {c.field_key} <span style={{ color: "var(--text-mute)" }}>{colTypeGlyph(c.data_type)}</span>
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p style={{ margin: "6px 0 0", font: "400 11px/1.4 var(--font-sans)", color: "var(--text-mute)" }}>
                        Click para usar como DataFrame
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Salida del script (columnas calculadas) — tras una ejecución */}
          {lastResult && !computeError && (
            <div style={{
              marginTop: 6, padding: 13, borderRadius: "var(--r-2)", background: "var(--calc-soft)",
              border: "1px solid color-mix(in srgb, var(--accent-calc) 30%, transparent)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, font: "600 12.5px/1 var(--font-sans)", color: "var(--accent-calc)" }}>
                <span className="mono">ƒ</span> Salida del script
              </div>
              <div style={{ font: "400 12px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 5 }}>
                Última corrida · <b className="mono" style={{ color: "var(--accent-calc)" }}>{lastResult.records.toLocaleString()}</b> filas ·{" "}
                <b className="mono" style={{ color: "var(--accent-calc)" }}>{lastResult.columns}</b> columnas calculadas.
              </div>
            </div>
          )}
        </aside>

        {/* ─────────────── CENTER: editor de código (Monaco) ─────────────── */}
        <section style={{ display: "flex", flexDirection: "column", minWidth: 0, background: EDITOR_BG }}>
          {/* Tab del archivo */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 8px", background: EDITOR_BAR, borderBottom: `1px solid ${EDITOR_LINE}` }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 12px",
              font: "500 12.5px/1 var(--font-mono)", color: EDITOR_TEXT,
              borderBottom: "2px solid var(--accent-calc)",
            }}>
              <FunctionSquare size={14} style={{ color: "var(--accent-calc)" }} /> {fileName}
              {!isNew && (
                <span
                  onClick={(e) => { e.stopPropagation(); navigate(`/datasets/${datasetId}`); }}
                  title="Cerrar"
                  style={{ display: "grid", placeItems: "center", width: 16, height: 16, borderRadius: 4, cursor: "pointer", color: EDITOR_MUTE }}
                >
                  <X size={11} />
                </span>
              )}
            </span>
          </div>

          {/* Toolbar de acciones */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${EDITOR_LINE}`, background: EDITOR_BAR }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: "var(--r-pill)",
              background: "color-mix(in srgb, var(--accent-calc) 22%, transparent)", color: "var(--accent-calc)",
              font: "600 12px/1 var(--font-sans)",
            }}>
              <span className="mono">ƒ</span> Computed dataset
            </span>
            {sourceIds.length > 0 && (
              <span className="mono" style={{ font: "400 11.5px/1 var(--font-mono)", color: EDITOR_MUTE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Fuentes: {sourceNames.join(", ")}
              </span>
            )}
            <div style={{ flex: 1 }} />

            <Btn
              variant="ghost"
              size="sm"
              icon={<Sparkles size={15} />}
              onClick={generateTemplate}
              disabled={sourceIds.length === 0}
              style={{ color: "#9aa6b5" }}
            >Plantilla</Btn>

            {!isNew && (
              <Btn
                variant="soft"
                size="sm"
                icon={<Save size={15} />}
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                style={{ background: "#1b2336", borderColor: "#2a3550", color: EDITOR_TEXT, boxShadow: "none" }}
              >{saveMut.isPending ? "Guardando…" : "Guardar"}</Btn>
            )}
            {/* Hidden anchor para los atajos Ctrl+S / Ctrl+Enter de Monaco */}
            <button id="btn-save" style={{ display: "none" }} onClick={() => !isNew && !saveMut.isPending && saveMut.mutate()} />

            {isNew ? (
              <Btn
                variant="primary"
                tone="calc"
                size="sm"
                icon={<Play size={15} />}
                onClick={() => createMut.mutate()}
                disabled={!dsName.trim() || sourceIds.length === 0 || createMut.isPending}
              >
                {createMut.isPending ? "Creando…" : <>Crear dataset</>}
              </Btn>
            ) : (
              <Btn
                variant="primary"
                tone="calc"
                size="sm"
                icon={<Play size={15} />}
                onClick={() => computeMut.mutate()}
                disabled={sourceIds.length === 0 || isRunning}
              >
                {isRunning ? "Ejecutando…" : <>Ejecutar <Kbd>⌃↵</Kbd></>}
              </Btn>
            )}
            {/* Anchor invisible que dispara el botón de ejecutar vía atajo */}
            <button
              id="btn-run"
              style={{ display: "none" }}
              onClick={() => {
                if (isNew) {
                  if (dsName.trim() && sourceIds.length > 0 && !createMut.isPending) createMut.mutate();
                } else if (sourceIds.length > 0 && !isRunning) {
                  computeMut.mutate();
                }
              }}
            />
          </div>

          {/* Monaco real ocupa el resto */}
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
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

          {/* Status bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "7px 16px", borderTop: `1px solid ${EDITOR_LINE}`, background: EDITOR_BAR, font: "400 11.5px/1 var(--font-mono)", color: EDITOR_MUTE }}>
            <span>Python 3.11</span><span>pandas</span><span>numpy</span><span>duckdb</span>
            <div style={{ flex: 1 }} />
            {hasOutput ? (
              computeError ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--danger)" }}>
                  <span>●</span> {computeError.error.slice(0, 40)}{computeError.error.length > 40 ? "…" : ""}
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--success)" }}>
                  <span>●</span> {lastResult!.records.toLocaleString()} filas · {lastResult!.columns} cols
                </span>
              )
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--success)" }}>
                <span>●</span> OK
              </span>
            )}
            <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          </div>
        </section>

        {/* ─────────────── RIGHT: salida / preview ─────────────── */}
        <aside style={{ borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0, background: "var(--surface)" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, padding: "10px 12px 0", borderBottom: "1px solid var(--border)", flex: "none" }}>
            {([["preview", "Resumen"], ["logs", "Logs"]] as const).map(([k, l]) => {
              const isActive = outTab === k;
              return (
                <button
                  key={k}
                  onClick={() => setOutTab(k)}
                  style={{
                    font: `${isActive ? 600 : 500} 13px var(--font-sans)`, padding: "8px 12px",
                    border: "none", background: "transparent", cursor: "pointer",
                    color: isActive ? "var(--text)" : "var(--text-soft)",
                    borderBottom: isActive ? "2px solid var(--accent-pri)" : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >{l}</button>
              );
            })}
          </div>

          <div style={{ padding: 16, flex: 1, overflow: "auto" }}>
            {!hasOutput && (
              <p style={{ font: "400 12.5px/1.6 var(--font-sans)", color: "var(--text-mute)", margin: 0 }}>
                {isNew
                  ? "Crea el dataset para poder ejecutar el script y ver el resultado aquí."
                  : "Pulsa “Ejecutar” (o ⌃↵) para correr el script. Aquí verás las métricas y los logs de la corrida."}
              </p>
            )}

            {/* Resumen / métricas */}
            {outTab === "preview" && lastResult && !computeError && (
              <>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: "var(--r-pill)",
                  background: "var(--success-soft)", color: "var(--success)", font: "600 12px var(--font-sans)", marginBottom: 16,
                }}>
                  <CheckCircle2 size={14} /> Ejecutado correctamente
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {([
                    ["filas", lastResult.records.toLocaleString(), "var(--accent-pri)"],
                    ["columnas", String(lastResult.columns), "var(--accent-pri)"],
                    ["errores", "0", "var(--success)"],
                    ["warnings", "0", "var(--text-soft)"],
                  ] as const).map(([l, v, c], i) => (
                    <div key={i} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-2)", padding: "12px 14px" }}>
                      <div className="mono" style={{ font: "700 22px var(--font-mono)", color: c }}>{v}</div>
                      <div style={{ font: "400 12px var(--font-sans)", color: "var(--text-mute)" }}>{l}</div>
                    </div>
                  ))}
                </div>

                {!isNew && (
                  <div style={{ marginTop: 18 }}>
                    <Btn
                      variant="tint"
                      tone="calc"
                      size="sm"
                      iconR={<ArrowRight size={15} />}
                      full
                      onClick={() => navigate(`/datasets/${datasetId}`)}
                    >Ver dataset{dataset?.name ? ` ${dataset.name}` : ""}</Btn>
                  </div>
                )}
              </>
            )}

            {/* Logs / error */}
            {outTab === "logs" && hasOutput && (
              computeError ? (
                <pre className="mono" style={{ font: "400 12px/1.7 var(--font-mono)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  <span style={{ color: "var(--danger)" }}>⚠ Error en la ejecución</span>{"\n"}
                  <span style={{ color: "var(--danger)" }}>{computeError.error}</span>
                  {computeError.traceback && (
                    <>{"\n\n"}<span style={{ color: "var(--text-mute)" }}>{computeError.traceback}</span></>
                  )}
                </pre>
              ) : (
                <pre className="mono" style={{ font: "400 12px/1.7 var(--font-mono)", color: "var(--text-soft)", margin: 0, whiteSpace: "pre-wrap" }}>
                  <span style={{ color: "var(--success)" }}>✓</span> Script iniciado · {fileName}{"\n"}
                  Cargando {sourceNames.length} dataset(s) fuente…{"\n"}
                  <span style={{ color: "var(--success)" }}>✓</span> {lastResult!.records.toLocaleString()} registros escritos · {lastResult!.columns} columnas{"\n"}
                  <span style={{ color: "var(--success)" }}>✓</span> compute finalizado
                </pre>
              )
            )}
          </div>
        </aside>
      </main>
    </AppShell>
  );
}

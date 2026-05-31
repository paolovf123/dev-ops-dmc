import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  previewExcelImport,
  importDatasetFromExcel,
  importDatasetsFromExcelMulti,
} from "../api/datasets";
import type { ExcelPreview } from "../api/datasets";
import { useEscapeKey } from "../utils/useEscapeKey";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  Sparkles,
  Check,
  CheckCircle2,
  Lock,
  Shield,
  Trash2,
  Table2,
  List,
  Link2,
  AlertTriangle,
  X,
} from "lucide-react";
import { Btn } from "./ui/kit";

const TYPE_GLYPH: Record<string, string> = {
  text: "A", long_text: "A", url: "@", email: "@", phone: "#",
  number: "#", currency: "$", percent: "%", rating: "★",
  enum: "▾", multiselect: "▾", boolean: "✓",
  date: "D", relation: "◇",
};

const TYPE_LABELS: Record<string, string> = {
  text: "Texto", long_text: "Texto largo", url: "Enlace", email: "Email", phone: "Teléfono",
  number: "Número", currency: "Moneda", percent: "Porcentaje", rating: "Calificación",
  enum: "Lista", multiselect: "Multi-lista", boolean: "Sí/No", date: "Fecha", relation: "Relación",
};

interface SheetState {
  selected: boolean;
  name: string;
}

interface ImportedSummary {
  count: number;
  totalRows: number;
  totalCols: number;
  firstId: string;
  firstName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  workspaceId?: string;
  onSuccess: (datasetId: string, datasetName: string, counts: { cols: number; rows: number }) => void;
  onMultiSuccess?: (summary: ImportedSummary) => void;
  /** Si se pasa, el modal salta el dropzone y va directo a la preview de este archivo. */
  initialFile?: File | null;
}

const STEPS = [
  { n: 1, label: "Subir archivo" },
  { n: 2, label: "Vista previa" },
  { n: 3, label: "Mapear columnas" },
  { n: 4, label: "Confirmar" },
];

// ── tokens de estilo compartidos ───────────────────────────────────────────────
const bodyHeadTitle: CSSProperties = {
  margin: 0, font: "700 17px/1.2 var(--font-sans)", letterSpacing: "-.01em", color: "var(--text)",
};
const bodyHeadSub: CSSProperties = {
  margin: "5px 0 18px", font: "400 13px/1.55 var(--font-sans)", color: "var(--text-soft)",
};
const sheetTile: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: "var(--r-2)",
  background: "var(--success-soft)", color: "var(--success)", flexShrink: 0,
};

export default function ImportExcelModal({ open, onClose, workspaceId, onSuccess, onMultiSuccess, initialFile }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
  const [sheetState, setSheetState] = useState<Record<string, SheetState>>({});
  const [focusedSheet, setFocusedSheet] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [previewErr, setPreviewErr] = useState("");
  const [step, setStep] = useState(1);
  useEscapeKey(onClose, open);

  const previewMut = useMutation({
    mutationFn: (f: File) => previewExcelImport(f),
    onSuccess: (data) => {
      setPreview(data);
      setPreviewErr("");
      const initial: Record<string, SheetState> = {};
      data.sheets.forEach((s, idx) => {
        initial[s.name] = {
          selected: idx === 0, // primera hoja preseleccionada
          name: s.name,        // por defecto, el nombre del dataset = nombre de la hoja
        };
      });
      setSheetState(initial);
      setFocusedSheet(data.sheets[0]?.name ?? "");
      setStep(2); // avanzamos al paso de vista previa
    },
    onError: (e: Error) => setPreviewErr(e.message ?? "Error al leer el archivo"),
  });

  const selectedSheets = preview
    ? preview.sheets.filter((s) => sheetState[s.name]?.selected)
    : [];

  const importMut = useMutation({
    mutationFn: async () => {
      const file = previewMut.variables;
      if (!file) throw new Error("no file");
      if (selectedSheets.length === 0) throw new Error("Selecciona al menos una hoja");

      if (selectedSheets.length === 1) {
        const s = selectedSheets[0];
        const r = await importDatasetFromExcel(file, {
          workspace_id: workspaceId,
          name: sheetState[s.name].name.trim() || undefined,
          sheet: s.name,
        });
        return { kind: "single" as const, data: r };
      }

      const r = await importDatasetsFromExcelMulti(
        file,
        selectedSheets.map((s) => ({ sheet: s.name, name: sheetState[s.name].name.trim() || s.name })),
        workspaceId,
      );
      return { kind: "multi" as const, data: r };
    },
    onSuccess: (res) => {
      if (res.kind === "single") {
        onSuccess(res.data.dataset_id, res.data.dataset_name, {
          cols: res.data.columns_created,
          rows: res.data.records_created,
        });
      } else {
        const imp = res.data.imported;
        const summary: ImportedSummary = {
          count: imp.length,
          totalRows: imp.reduce((a, b) => a + b.records_created, 0),
          totalCols: imp.reduce((a, b) => a + b.columns_created, 0),
          firstId: imp[0]?.dataset_id ?? "",
          firstName: imp[0]?.dataset_name ?? "",
        };
        if (onMultiSuccess) {
          onMultiSuccess(summary);
        } else {
          onSuccess(summary.firstId, `${summary.count} datasets importados`, {
            cols: summary.totalCols,
            rows: summary.totalRows,
          });
        }
      }
      handleClose();
    },
  });

  const handleClose = () => {
    setPreview(null);
    setSheetState({});
    setFocusedSheet("");
    setPreviewErr("");
    setStep(1);
    previewMut.reset();
    importMut.reset();
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  };

  const handleFile = (f: File) => {
    setPreview(null);
    previewMut.mutate(f);
  };

  // Si llegamos con un archivo pre-elegido (ej. desde CreateDataset al detectar
  // un Excel con múltiples hojas), saltamos el dropzone y lanzamos la preview.
  useEffect(() => {
    if (open && initialFile && !preview && !previewMut.isPending) {
      handleFile(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  const toggleSheet = (name: string) => {
    setSheetState((s) => ({ ...s, [name]: { ...s[name], selected: !s[name].selected } }));
    setFocusedSheet(name);
  };

  const renameSheet = (name: string, newName: string) => {
    setSheetState((s) => ({ ...s, [name]: { ...s[name], name: newName } }));
  };

  const selectAll = () => {
    if (!preview) return;
    const all = preview.sheets.every((s) => sheetState[s.name]?.selected);
    setSheetState((prev) => {
      const next = { ...prev };
      preview.sheets.forEach((s) => { next[s.name] = { ...next[s.name], selected: !all }; });
      return next;
    });
  };

  const currentSheet = preview?.sheets.find((s) => s.name === focusedSheet);
  const selectedCount = selectedSheets.length;
  const totalSelectedRows = selectedSheets.reduce((a, s) => a + s.row_count, 0);
  const totalSelectedCols = selectedSheets.reduce((a, s) => a + s.columns.length, 0);
  const hasDupName =
    selectedCount > 1 &&
    new Set(selectedSheets.map((s) => (sheetState[s.name].name.trim() || s.name).toLowerCase())).size !==
      selectedSheets.length;

  if (!open) return null;

  // ── Navegación del wizard ──────────────────────────────────────────────
  const canGoNext = () => {
    if (step === 1) return false; // sólo avanza tras cargar archivo
    if (step >= 4) return false;
    return !!preview;
  };
  const goNext = () => { if (canGoNext()) setStep((s) => Math.min(4, s + 1)); };
  const goBack = () => { if (step > 1) setStep((s) => Math.max(1, s - 1)); };
  const goToStep = (n: number) => {
    if (n === 1) { setStep(1); return; }
    if (preview) setStep(n);
  };

  const footMeta: Record<number, string> = {
    1: "Sube un archivo para continuar",
    2: preview ? `${preview.sheets.length} hoja${preview.sheets.length !== 1 ? "s" : ""} detectada${preview.sheets.length !== 1 ? "s" : ""} · ${selectedCount} seleccionada${selectedCount !== 1 ? "s" : ""}` : "—",
    3: `${totalSelectedCols} columnas en ${selectedCount} hoja${selectedCount !== 1 ? "s" : ""}`,
    4: hasDupName ? "Corrige los nombres duplicados" : "Todo listo",
  };

  const nextLabel: Record<number, string> = {
    1: "Selecciona un archivo",
    2: "Siguiente · Mapear columnas",
    3: "Siguiente · Confirmar",
    4: "",
  };

  return (
    // El modal vive FUERA del AppShell — usamos el frame inline del handoff
    // (tokens), no las clases del primer rebrand. Cierra con Esc (useEscapeKey)
    // y con click en el backdrop.
    <div
      onMouseDown={handleClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000, padding: 24,
        background: "var(--overlay)", backdropFilter: "blur(5px)",
        WebkitBackdropFilter: "blur(5px)",
        display: "grid", placeItems: "center", animation: "ogFade var(--t-mid)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 660, maxHeight: "92vh",
          display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-4)", boxShadow: "var(--shadow-4)",
          animation: "ogPop var(--t-slow)", overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "18px 20px", borderBottom: "1px solid var(--border)",
        }}>
          <span style={{
            display: "grid", placeItems: "center", width: 38, height: 38, flex: "none",
            borderRadius: "var(--r-2)", background: "var(--pri-soft)", color: "var(--accent-pri)",
          }}>
            <Upload size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>
              Importar Excel
            </div>
            <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3 }}>
              {preview ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <FileSpreadsheet size={13} style={{ color: "var(--success)", flex: "none" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {preview.filename}
                  </span>
                </span>
              ) : (
                "Convierte tus hojas en datasets relacionados"
              )}
            </div>
          </div>
          <button
            type="button" onClick={handleClose} title="Cerrar" aria-label="Cerrar"
            className="og-iconbtn"
            style={{
              width: 32, height: 32, display: "grid", placeItems: "center", flex: "none",
              border: "none", background: "transparent", borderRadius: 8, cursor: "pointer",
              color: "var(--text-mute)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Stepper ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "16px 20px 4px",
        }}>
          {STEPS.map((s, i) => {
            const isDone = s.n < step;
            const isActive = s.n === step;
            const reachable = s.n === 1 || !!preview;
            const on = isActive, done = isDone;
            return (
              <div key={s.n} style={{ display: "contents" }}>
                <button
                  type="button"
                  onClick={() => reachable && goToStep(s.n)}
                  disabled={!reachable}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    font: `${on ? 600 : 500} 12.5px var(--font-sans)`,
                    color: on ? "var(--text)" : "var(--text-mute)", whiteSpace: "nowrap",
                    border: "none", background: "transparent", padding: 0,
                    cursor: reachable ? "pointer" : "default",
                  }}
                >
                  <span style={{
                    display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 999,
                    background: on || done ? "var(--accent-pri)" : "var(--surface-alt)",
                    color: on || done ? "#fff" : "var(--text-mute)",
                    font: "700 11px var(--font-sans)", flex: "none",
                  }}>
                    {done ? <Check size={12} /> : s.n}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && (
                  <span style={{ flex: 1, height: 2, minWidth: 14, background: "var(--border)" }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Body ── */}
        <div style={{ padding: 20, overflow: "auto" }}>

          {/* ─────────── STEP 1 — Subir archivo ─────────── */}
          {step === 1 && (
            <>
              <div>
                <h2 style={bodyHeadTitle}>Sube tu Excel</h2>
                <p style={bodyHeadSub}>
                  Soportamos <b style={{ color: "var(--text)" }}>.xlsx</b>, <b style={{ color: "var(--text)" }}>.xls</b> y{" "}
                  <b style={{ color: "var(--text)" }}>.xlsm</b>. Detectamos automáticamente las hojas, los
                  encabezados y el tipo de cada columna. Cada hoja se puede importar como un dataset
                  independiente.
                </p>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile(f);
                }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "var(--accent-pri)" : "var(--border-strong)"}`,
                  background: dragOver ? "var(--pri-soft)" : "var(--surface-2)",
                  borderRadius: "var(--r-3)",
                  padding: "40px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all var(--t-mid)",
                }}
              >
                <input
                  ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                {previewMut.isPending ? (
                  <p style={{ margin: 0, color: "var(--text-soft)", font: "400 14px var(--font-sans)" }}>
                    Analizando archivo…
                  </p>
                ) : (
                  <>
                    <span style={{
                      display: "grid", placeItems: "center", width: 56, height: 56,
                      margin: "0 auto 14px", borderRadius: "var(--r-3)",
                      background: "var(--pri-soft)", color: "var(--accent-pri)",
                    }}>
                      <Upload size={26} />
                    </span>
                    <h3 style={{ margin: "0 0 4px", font: "600 15px var(--font-sans)", color: "var(--text)" }}>
                      Arrastra el archivo aquí
                    </h3>
                    <p style={{ margin: 0, font: "400 13px var(--font-sans)", color: "var(--text-soft)" }}>
                      … o haz click para buscarlo en tu equipo
                    </p>
                    <div style={{ display: "inline-flex", marginTop: 16 }} onClick={(e) => e.stopPropagation()}>
                      <Btn variant="primary" onClick={() => fileRef.current?.click()}>
                        Seleccionar archivo
                      </Btn>
                    </div>
                    <div style={{
                      display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap",
                      marginTop: 20, font: "400 11.5px var(--font-sans)", color: "var(--text-mute)",
                    }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Lock size={12} /> Tu archivo nunca sale de tu workspace
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Shield size={12} /> Cifrado en tránsito y en reposo
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Trash2 size={12} /> Lo eliminamos cuando confirmes
                      </span>
                    </div>
                  </>
                )}
              </div>

              {previewErr && (
                <p style={{
                  display: "flex", alignItems: "center", gap: 7,
                  margin: "16px 0 0", color: "var(--danger)", font: "500 13px var(--font-sans)",
                  padding: "10px 12px",
                  background: "var(--danger-soft)",
                  borderRadius: "var(--r-2)",
                  border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
                }}>
                  <AlertTriangle size={15} style={{ flex: "none" }} /> {previewErr}
                </p>
              )}
            </>
          )}

          {/* ─────────── STEP 2 — Vista previa ─────────── */}
          {step === 2 && preview && (
            <>
              <div>
                <h2 style={bodyHeadTitle}>Vista previa · ¿se ve bien?</h2>
                <p style={bodyHeadSub}>
                  Detectamos <b style={{ color: "var(--text)" }}>{preview.sheets.length} hoja{preview.sheets.length !== 1 ? "s" : ""}</b> en el
                  archivo. Elige cuáles importar y, si quieres, renómbralas. Cada hoja seleccionada se
                  creará como un dataset.
                </p>
              </div>

              {/* Selector de hojas (segmentos) */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", background: "var(--surface-alt)",
                border: "1px solid var(--border)", borderRadius: "var(--r-2)",
                marginBottom: 12, flexWrap: "wrap",
              }}>
                <span style={{
                  display: "inline-flex", background: "var(--surface)", borderRadius: "var(--r-1)",
                  border: "1px solid var(--border)", padding: 2, flexWrap: "wrap", gap: 2,
                }}>
                  {preview.sheets.map((s) => {
                    const active = focusedSheet === s.name;
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => setFocusedSheet(s.name)}
                        style={{
                          border: 0, background: active ? "var(--accent-pri)" : "transparent",
                          color: active ? "#fff" : "var(--text-soft)",
                          padding: "3px 9px", font: "500 11.5px var(--font-sans)", borderRadius: 5,
                          cursor: "pointer",
                        }}
                      >
                        {s.name} <span style={{ opacity: 0.7 }}>{s.row_count}</span>
                      </button>
                    );
                  })}
                </span>
                {preview.sheets.length > 1 && (
                  <div style={{ marginLeft: "auto" }}>
                    <Btn variant="ghost" size="sm" onClick={selectAll}>
                      {preview.sheets.every((s) => sheetState[s.name]?.selected) ? "Quitar todas" : "Seleccionar todas"}
                    </Btn>
                  </div>
                )}
              </div>

              {/* Lista de hojas con checkbox + nombre editable */}
              <div style={{
                border: "1px solid var(--border)", borderRadius: "var(--r-2)",
                overflow: "hidden", marginBottom: 16,
              }}>
                {preview.sheets.map((s, idx) => {
                  const st = sheetState[s.name];
                  const isFocused = focusedSheet === s.name;
                  return (
                    <div
                      key={s.name}
                      onClick={() => setFocusedSheet(s.name)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 12px",
                        borderBottom: idx < preview.sheets.length - 1 ? "1px solid var(--border)" : "none",
                        background: isFocused ? "var(--pri-soft)" : "var(--surface)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox" checked={!!st?.selected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSheet(s.name)}
                        style={{ accentColor: "var(--accent-pri)", width: 15, height: 15, cursor: "pointer" }}
                      />
                      <span style={sheetTile}>
                        <Table2 size={15} />
                      </span>
                      <div style={{ minWidth: 0, flex: "0 0 30%" }}>
                        <div style={{ font: "600 13px var(--font-sans)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.name}
                        </div>
                        <div className="mono" style={{ font: "400 11px var(--font-mono)", color: "var(--text-mute)" }}>
                          {s.row_count} filas · {s.columns.length} col
                        </div>
                      </div>
                      <input
                        type="text"
                        value={st?.name ?? ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => renameSheet(s.name, e.target.value)}
                        placeholder="Nombre del dataset"
                        disabled={!st?.selected}
                        style={{
                          flex: 1, height: 34, padding: "0 11px", borderRadius: "var(--r-2)",
                          border: "1px solid var(--border)", background: "var(--surface)",
                          color: "var(--text)", font: "400 13px var(--font-sans)", outline: "none",
                          opacity: st?.selected ? 1 : 0.5,
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Vista previa de columnas de la hoja enfocada */}
              {currentSheet && (
                <>
                  <p style={{ margin: "0 0 8px", font: "400 12px var(--font-sans)", color: "var(--text-soft)" }}>
                    Columnas detectadas en{" "}
                    <b style={{ color: "var(--text)" }}>{currentSheet.name}</b>{" "}
                    <span style={{ color: "var(--text-mute)" }}>({currentSheet.columns.length})</span>
                  </p>
                  <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--r-2)" }}>
                    <table style={{
                      width: "100%", borderCollapse: "separate", borderSpacing: 0,
                      font: "400 12px var(--font-sans)", background: "var(--surface)",
                    }}>
                      <thead>
                        <tr>
                          {currentSheet.columns.map((col, i) => (
                            <th key={i} style={{
                              padding: "6px 10px", textAlign: "left",
                              borderBottom: "1px solid var(--border)",
                              borderRight: i < currentSheet.columns.length - 1 ? "1px solid var(--border)" : "none",
                              background: "var(--surface-alt)", color: "var(--text)",
                              font: "600 11px var(--font-sans)", whiteSpace: "nowrap",
                            }}>
                              {col.header}
                              <span className="mono" style={{
                                display: "block", font: "500 9.5px var(--font-mono)",
                                color: "var(--text-mute)", marginTop: 1,
                              }}>
                                {TYPE_GLYPH[col.data_type] ?? "A"} {TYPE_LABELS[col.data_type] ?? col.data_type}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {currentSheet.columns.map((col, i) => (
                            <td key={i} className="mono" style={{
                              padding: "6px 10px",
                              borderRight: i < currentSheet.columns.length - 1 ? "1px solid var(--border)" : "none",
                              color: "var(--text-mute)", font: "400 11px var(--font-mono)",
                              whiteSpace: "nowrap",
                            }}>
                              {col.options && col.options.length > 0
                                ? col.options.slice(0, 3).join(" · ")
                                : col.field_key}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* ─────────── STEP 3 — Mapear columnas ─────────── */}
          {step === 3 && preview && currentSheet && (
            <>
              <div>
                <h2 style={bodyHeadTitle}>Revisa el tipo de cada columna</h2>
                <p style={bodyHeadSub}>
                  Adivinamos el tipo de cada columna por su nombre y sus datos. Mostramos la hoja{" "}
                  <b style={{ color: "var(--text)" }}>{currentSheet.name}</b>
                  {selectedCount > 1 ? " — las demás hojas seleccionadas también traen sus tipos sugeridos." : "."}
                </p>
              </div>

              {/* Selector rápido de hoja enfocada */}
              {selectedCount > 1 && (
                <div style={{
                  display: "inline-flex", background: "var(--surface)", borderRadius: "var(--r-1)",
                  border: "1px solid var(--border)", padding: 2, marginBottom: 12,
                  flexWrap: "wrap", gap: 2,
                }}>
                  {selectedSheets.map((s) => {
                    const active = focusedSheet === s.name;
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => setFocusedSheet(s.name)}
                        style={{
                          border: 0, background: active ? "var(--accent-pri)" : "transparent",
                          color: active ? "#fff" : "var(--text-soft)",
                          padding: "3px 9px", font: "500 11.5px var(--font-sans)", borderRadius: 5,
                          cursor: "pointer",
                        }}
                      >
                        {sheetState[s.name]?.name?.trim() || s.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-2)", overflow: "hidden" }}>
                <table style={{
                  width: "100%", borderCollapse: "separate", borderSpacing: 0,
                  font: "400 12.5px var(--font-sans)",
                }}>
                  <thead>
                    <tr>
                      {["Columna del Excel", "Detalle", "", "Tipo en OpsGrid"].map((h, i) => (
                        <th key={i} style={{
                          padding: "9px 12px", textAlign: "left",
                          width: i === 0 ? "30%" : i === 1 ? "26%" : i === 2 ? "4%" : undefined,
                          borderBottom: "1px solid var(--border)", background: "var(--surface-alt)",
                          color: "var(--text-soft)", font: "600 11px var(--font-sans)",
                          textTransform: "uppercase", letterSpacing: ".03em",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentSheet.columns.map((col, i) => {
                      const isRel = col.data_type === "relation";
                      const [tFg, tBg] = isRel
                        ? ["var(--accent-rel)", "var(--rel-soft)"]
                        : ["var(--accent-pri)", "var(--pri-soft)"];
                      return (
                        <tr key={i}>
                          <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
                            <div style={{ font: "600 12.5px var(--font-sans)", color: "var(--text)" }}>{col.header}</div>
                            <div className="mono" style={{ font: "400 11px var(--font-mono)", color: "var(--text-mute)" }}>
                              {col.field_key}
                            </div>
                          </td>
                          <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
                            <span className="mono" style={{ font: "400 11px var(--font-mono)", color: "var(--text-mute)" }}>
                              {col.options && col.options.length > 0
                                ? col.options.slice(0, 3).join(", ") + (col.options.length > 3 ? "…" : "")
                                : "—"}
                            </span>
                          </td>
                          <td style={{ padding: "9px 4px", borderBottom: "1px solid var(--border)", textAlign: "center", color: "var(--text-mute)" }}>
                            <ArrowRight size={14} />
                          </td>
                          <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 8,
                              padding: "5px 10px", borderRadius: "var(--r-2)",
                              background: tBg, color: tFg,
                              border: `1px solid color-mix(in srgb, ${tFg} 30%, transparent)`,
                            }}>
                              <span style={{ font: "700 12px var(--font-mono)", lineHeight: 1 }}>
                                {isRel ? "" : (TYPE_GLYPH[col.data_type] ?? "A")}
                              </span>
                              {isRel && <Link2 size={13} />}
                              <span style={{ font: "600 12.5px var(--font-sans)" }}>
                                {TYPE_LABELS[col.data_type] ?? col.data_type}
                              </span>
                              {col.options && col.options.length > 0 && (
                                <span style={{ font: "400 11px var(--font-sans)", opacity: 0.8 }}>
                                  · {col.options.length} valores
                                </span>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ─────────── STEP 4 — Confirmar ─────────── */}
          {step === 4 && preview && (
            <>
              <div>
                <h2 style={bodyHeadTitle}>Todo listo para importar</h2>
                <p style={bodyHeadSub}>
                  Revisa el resumen. Cuando confirmes, procesamos
                  {selectedCount === 1 ? " la hoja seleccionada" : ` las ${selectedCount} hojas seleccionadas`}
                  {" "}y creamos
                  {selectedCount === 1 ? " un dataset" : ` ${selectedCount} datasets`} en OpsGrid.
                </p>
              </div>

              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16,
              }}>
                {([
                  { icon: <Table2 size={16} />, fg: "var(--accent-pri)", bg: "var(--pri-soft)", val: selectedCount, label: selectedCount === 1 ? "tabla nueva" : "tablas nuevas" },
                  { icon: <List size={16} />, fg: "var(--text-soft)", bg: "var(--surface-alt)", val: totalSelectedCols, label: "columnas mapeadas" },
                  { icon: <Link2 size={16} />, fg: "var(--accent-rel)", bg: "var(--rel-soft)", val: preview.sheets.length, label: "hojas en el archivo" },
                  { icon: <Sparkles size={16} />, fg: "var(--accent-calc)", bg: "var(--calc-soft)", val: totalSelectedRows.toLocaleString(), label: "filas totales" },
                ] as const).map((c, i) => (
                  <div key={i} style={{
                    padding: "14px 12px", borderRadius: "var(--r-3)",
                    border: "1px solid var(--border)", background: "var(--surface)",
                    textAlign: "center", boxShadow: "var(--shadow-1)",
                  }}>
                    <span style={{
                      display: "grid", placeItems: "center", width: 32, height: 32, margin: "0 auto 8px",
                      borderRadius: "var(--r-2)", background: c.bg, color: c.fg,
                    }}>
                      {c.icon}
                    </span>
                    <div style={{ font: "700 20px var(--font-sans)", color: "var(--text)" }}>{c.val}</div>
                    <div style={{ font: "400 11px var(--font-sans)", color: "var(--text-mute)", marginTop: 2 }}>{c.label}</div>
                  </div>
                ))}
              </div>

              {/* Lista de datasets a crear */}
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-2)", overflow: "hidden" }}>
                {selectedSheets.map((s, idx) => (
                  <div key={s.name} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "11px 13px",
                    borderBottom: idx < selectedSheets.length - 1 ? "1px solid var(--border)" : "none",
                    background: "var(--success-soft)",
                    font: "400 13px var(--font-sans)",
                  }}>
                    <CheckCircle2 size={16} style={{ color: "var(--success)", flex: "none" }} />
                    <b style={{ font: "600 13.5px var(--font-sans)", color: "var(--text)" }}>
                      {sheetState[s.name]?.name?.trim() || s.name}
                    </b>
                    <span className="mono" style={{ marginLeft: "auto", color: "var(--text-soft)", font: "400 11.5px var(--font-mono)" }}>
                      {s.row_count} filas · {s.columns.length} col
                    </span>
                  </div>
                ))}
              </div>

              {hasDupName && (
                <p style={{
                  display: "flex", alignItems: "center", gap: 7,
                  margin: "12px 0 0", color: "var(--danger)", font: "500 12px var(--font-sans)",
                }}>
                  <AlertTriangle size={14} style={{ flex: "none" }} />
                  Dos hojas tienen el mismo nombre de dataset. Edítalos en el paso 2 para que sean únicos.
                </p>
              )}

              {importMut.isError && (
                <p style={{
                  display: "flex", alignItems: "center", gap: 7,
                  margin: "12px 0 0", color: "var(--danger)", font: "500 13px var(--font-sans)",
                }}>
                  <AlertTriangle size={15} style={{ flex: "none" }} />
                  {(importMut.error as Error)?.message ?? "Error al importar"}
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 20px", borderTop: "1px solid var(--border)", background: "var(--surface-2)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 7, minWidth: 0,
            font: "400 12px var(--font-sans)", color: "var(--text-mute)",
          }}>
            {preview ? (
              <>
                <Check size={13} style={{ color: "var(--success)", flex: "none" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <b style={{ color: "var(--text-soft)" }}>{preview.filename}</b> · {footMeta[step]}
                </span>
              </>
            ) : (
              <span>{footMeta[step]}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
            <Btn variant="ghost" onClick={handleClose}>Cancelar</Btn>
            {step > 1 && (
              <Btn variant="soft" onClick={goBack}>Atrás</Btn>
            )}
            {step < 4 ? (
              <Btn
                variant="primary"
                disabled={!canGoNext()}
                iconR={step === 1 ? undefined : <ArrowRight size={14} />}
                onClick={step === 1 ? () => fileRef.current?.click() : goNext}
              >
                {step === 1 ? "Selecciona un archivo" : nextLabel[step]}
              </Btn>
            ) : (
              <Btn
                variant="primary"
                icon={<Check size={15} />}
                disabled={importMut.isPending || selectedCount === 0 || hasDupName}
                onClick={() => importMut.mutate()}
              >
                {importMut.isPending
                  ? "Importando…"
                  : selectedCount > 1
                    ? `Crear ${selectedCount} datasets`
                    : "Crear dataset"}
              </Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

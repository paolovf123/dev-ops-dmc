import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  previewExcelImport,
  importDatasetFromExcel,
  importDatasetsFromExcelMulti,
} from "../api/datasets";
import type { ExcelPreview } from "../api/datasets";
import { useEscapeKey } from "../utils/useEscapeKey";
import {
  IcUpload,
  IcFile,
  IcArrowRight,
  IcSparkles,
  IcCheck,
  IcLock,
  IcShield,
  IcTrash,
  IcTable,
  IcList,
  IcLink,
} from "./ui/icons";

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
    // El modal se renderiza FUERA del AppShell, por lo que envolvemos en `.og`
    // para que las clases del design system (.wiz-*, .btn--*, .input, etc.) apliquen.
    <div className="og">
      {/* Overlay/backdrop — clicable para cerrar */}
      <div
        className="wiz-overlay"
        style={{ zIndex: 1000 }}
        onClick={(e) => e.target === e.currentTarget && handleClose()}
      >
        <div className="wiz" onClick={(e) => e.stopPropagation()}>

          {/* Head */}
          <div className="wiz-head">
            <div className="wiz-head__title">
              <span style={{ display: "inline-flex", color: "var(--accent-pri)" }}><IcUpload size={16} /></span>
              Importar Excel
              {preview && (
                <span className="file">
                  <span style={{ display: "inline-flex", verticalAlign: -1, color: "#1da462" }}><IcFile size={11} /></span>{" "}
                  {preview.filename}
                </span>
              )}
            </div>
            <button className="wiz-head__close" title="Cerrar" onClick={handleClose}>
              <span style={{ display: "inline-flex" }}>✕</span>
            </button>
          </div>

          {/* Stepper */}
          <div className="wiz-steps">
            {STEPS.map((s) => {
              const isDone = s.n < step;
              const isActive = s.n === step;
              const reachable = s.n === 1 || !!preview;
              return (
                <div
                  key={s.n}
                  className={`wiz-step${isDone ? " is-done" : ""}${isActive ? " is-active" : ""}`}
                  onClick={() => reachable && goToStep(s.n)}
                  style={{ cursor: reachable ? "pointer" : "default" }}
                >
                  <span className="wiz-step__n">
                    {isDone ? <IcCheck size={11} /> : s.n}
                  </span>
                  {s.n} · {s.label}
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div className="wiz-body">

            {/* ─────────── STEP 1 — Subir archivo ─────────── */}
            {step === 1 && (
              <>
                <div className="wiz-body__head">
                  <h2>Sube tu Excel</h2>
                  <p>
                    Soportamos <b>.xlsx</b>, <b>.xls</b> y <b>.xlsm</b>. Detectamos automáticamente
                    las hojas, los encabezados y el tipo de cada columna. Cada hoja se puede
                    importar como un dataset independiente.
                  </p>
                </div>

                <div
                  className="drop-zone"
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setDragOver(false);
                    const f = e.dataTransfer.files[0];
                    if (f) handleFile(f);
                  }}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? "var(--accent-pri)" : "color-mix(in oklab, var(--accent-pri) 35%, var(--border))"}`,
                    background: dragOver
                      ? "color-mix(in oklab, var(--accent-pri) 6%, var(--surface))"
                      : "color-mix(in oklab, var(--accent-pri) 3%, var(--surface))",
                    borderRadius: "var(--r-4)",
                    padding: "var(--sp-12) var(--sp-6)",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "var(--t-base)",
                  }}
                >
                  <input
                    ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  {previewMut.isPending ? (
                    <p style={{ margin: 0, color: "var(--text-soft)", fontSize: "var(--fs-14)" }}>Analizando archivo…</p>
                  ) : (
                    <>
                      <div
                        style={{
                          width: 64, height: 64, borderRadius: "var(--r-3)",
                          background: "var(--accent-pri-soft)", color: "var(--accent-pri)",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          marginBottom: "var(--sp-3)",
                        }}
                      >
                        <IcUpload size={30} />
                      </div>
                      <h3 style={{ margin: "0 0 var(--sp-1)", fontSize: "var(--fs-18)", fontWeight: 600 }}>
                        Arrastra el archivo aquí
                      </h3>
                      <p style={{ margin: 0, fontSize: "var(--fs-13)", color: "var(--text-soft)" }}>
                        … o haz click para buscarlo en tu equipo
                      </p>
                      <button
                        className="btn btn--primary"
                        style={{ marginTop: "var(--sp-3)" }}
                        onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                      >
                        Seleccionar archivo
                      </button>
                      <div
                        style={{
                          display: "flex", gap: "var(--sp-3)", justifyContent: "center",
                          marginTop: "var(--sp-5)", fontSize: "var(--fs-11)", color: "var(--text-mute)",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IcLock size={12} /> Tu archivo nunca sale de tu workspace</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IcShield size={12} /> Cifrado en tránsito y en reposo</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IcTrash size={12} /> Lo eliminamos cuando confirmes</span>
                      </div>
                    </>
                  )}
                </div>

                {previewErr && (
                  <p
                    style={{
                      margin: "var(--sp-4) 0 0", color: "var(--danger)", fontSize: "var(--fs-13)",
                      padding: "var(--sp-2) var(--sp-3)",
                      background: "color-mix(in oklab, var(--danger) 8%, var(--surface))",
                      borderRadius: "var(--r-2)",
                      border: "1px solid color-mix(in oklab, var(--danger) 30%, var(--border))",
                    }}
                  >
                    ⚠ {previewErr}
                  </p>
                )}
              </>
            )}

            {/* ─────────── STEP 2 — Vista previa ─────────── */}
            {step === 2 && preview && (
              <>
                <div className="wiz-body__head">
                  <h2>Vista previa · ¿se ve bien?</h2>
                  <p>
                    Detectamos <b>{preview.sheets.length} hoja{preview.sheets.length !== 1 ? "s" : ""}</b> en el archivo.
                    Elige cuáles importar y, si quieres, renómbralas. Cada hoja seleccionada se creará
                    como un dataset.
                  </p>
                </div>

                {/* Selector de hojas (segmentos) */}
                <div className="preview-controls" style={{
                  display: "flex", alignItems: "center", gap: "var(--sp-2)",
                  padding: "var(--sp-2) var(--sp-3)", background: "var(--surface-alt)",
                  border: "1px solid var(--border-soft)", borderRadius: "var(--r-2)",
                  marginBottom: "var(--sp-3)", flexWrap: "wrap",
                }}>
                  <span style={{
                    display: "inline-flex", background: "var(--surface)", borderRadius: "var(--r-1)",
                    border: "1px solid var(--border-soft)", padding: 2, flexWrap: "wrap",
                  }}>
                    {preview.sheets.map((s) => {
                      const active = focusedSheet === s.name;
                      return (
                        <button
                          key={s.name}
                          onClick={() => setFocusedSheet(s.name)}
                          style={{
                            border: 0, background: active ? "var(--accent-pri)" : "transparent",
                            color: active ? "#fff" : "var(--text-soft)",
                            padding: "2px var(--sp-2)", fontSize: "var(--fs-11)", borderRadius: 3,
                            cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
                          }}
                        >
                          {s.name} <span style={{ opacity: 0.7 }}>{s.row_count}</span>
                        </button>
                      );
                    })}
                  </span>
                  {preview.sheets.length > 1 && (
                    <button
                      className="btn btn--ghost btn--sm"
                      style={{ marginLeft: "auto" }}
                      onClick={selectAll}
                    >
                      {preview.sheets.every((s) => sheetState[s.name]?.selected) ? "Quitar todas" : "Seleccionar todas"}
                    </button>
                  )}
                </div>

                {/* Lista de hojas con checkbox + nombre editable */}
                <div style={{
                  border: "1px solid var(--border-soft)", borderRadius: "var(--r-2)",
                  overflow: "hidden", marginBottom: "var(--sp-4)",
                }}>
                  {preview.sheets.map((s) => {
                    const st = sheetState[s.name];
                    const isFocused = focusedSheet === s.name;
                    return (
                      <div
                        key={s.name}
                        onClick={() => setFocusedSheet(s.name)}
                        style={{
                          display: "flex", alignItems: "center", gap: "var(--sp-3)",
                          padding: "var(--sp-2) var(--sp-3)",
                          borderBottom: "1px solid var(--border-soft)",
                          background: isFocused ? "var(--accent-pri-soft)" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox" checked={!!st?.selected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSheet(s.name)}
                          style={{ width: 16, height: 16, cursor: "pointer" }}
                        />
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 28, height: 28, borderRadius: "var(--r-1)",
                          background: "color-mix(in oklab, #1da462 14%, var(--surface))", color: "#1da462",
                          flexShrink: 0,
                        }}>
                          <IcTable size={14} />
                        </span>
                        <div style={{ minWidth: 0, flex: "0 0 30%" }}>
                          <div style={{ fontSize: "var(--fs-13)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.name}
                          </div>
                          <div style={{ fontSize: "var(--fs-11)", color: "var(--text-mute)", fontFamily: "var(--font-mono)" }}>
                            {s.row_count} filas · {s.columns.length} col
                          </div>
                        </div>
                        <input
                          type="text"
                          className="input"
                          value={st?.name ?? ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => renameSheet(s.name, e.target.value)}
                          placeholder="Nombre del dataset"
                          disabled={!st?.selected}
                          style={{ flex: 1, height: 32 }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Vista previa de columnas de la hoja enfocada */}
                {currentSheet && (
                  <>
                    <p style={{ margin: "0 0 var(--sp-2)", fontSize: "var(--fs-12)", color: "var(--text-soft)" }}>
                      Columnas detectadas en{" "}
                      <b style={{ color: "var(--text)" }}>{currentSheet.name}</b>{" "}
                      <span style={{ color: "var(--text-mute)" }}>({currentSheet.columns.length})</span>
                    </p>
                    <div style={{ overflowX: "auto", border: "1px solid var(--border-soft)", borderRadius: "var(--r-2)" }}>
                      <table style={{
                        width: "100%", borderCollapse: "separate", borderSpacing: 0,
                        fontSize: "var(--fs-12)", background: "var(--surface)",
                      }}>
                        <thead>
                          <tr>
                            {currentSheet.columns.map((col, i) => (
                              <th key={i} style={{
                                padding: "var(--sp-1) var(--sp-2)", textAlign: "left",
                                borderBottom: "1px solid var(--border-soft)",
                                borderRight: "1px solid var(--border-soft)",
                                background: "var(--surface-alt)", fontWeight: 600,
                                whiteSpace: "nowrap", color: "var(--text)", fontSize: "var(--fs-11)",
                              }}>
                                {col.header}
                                <span style={{
                                  display: "block", fontFamily: "var(--font-mono)", fontSize: 9.5,
                                  color: "var(--text-mute)", fontWeight: 500, marginTop: 1,
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
                              <td key={i} style={{
                                padding: "var(--sp-1) var(--sp-2)",
                                borderRight: "1px solid var(--border-soft)",
                                color: "var(--text-mute)", fontFamily: "var(--font-mono)",
                                whiteSpace: "nowrap", fontSize: "var(--fs-11)",
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
                <div className="wiz-body__head">
                  <h2>Revisa el tipo de cada columna</h2>
                  <p>
                    Adivinamos el tipo de cada columna por su nombre y sus datos. Mostramos la hoja{" "}
                    <b>{currentSheet.name}</b>
                    {selectedCount > 1 ? " — las demás hojas seleccionadas también traen sus tipos sugeridos." : "."}
                  </p>
                </div>

                {/* Selector rápido de hoja enfocada */}
                {selectedCount > 1 && (
                  <div style={{
                    display: "inline-flex", background: "var(--surface)", borderRadius: "var(--r-1)",
                    border: "1px solid var(--border-soft)", padding: 2, marginBottom: "var(--sp-3)",
                    flexWrap: "wrap",
                  }}>
                    {selectedSheets.map((s) => {
                      const active = focusedSheet === s.name;
                      return (
                        <button
                          key={s.name}
                          onClick={() => setFocusedSheet(s.name)}
                          style={{
                            border: 0, background: active ? "var(--accent-pri)" : "transparent",
                            color: active ? "#fff" : "var(--text-soft)",
                            padding: "2px var(--sp-2)", fontSize: "var(--fs-11)", borderRadius: 3,
                            cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
                          }}
                        >
                          {sheetState[s.name]?.name?.trim() || s.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                <table className="map-table">
                  <thead>
                    <tr>
                      <th style={{ width: "30%" }}>Columna del Excel</th>
                      <th style={{ width: "26%" }}>Detalle</th>
                      <th style={{ width: "4%" }}></th>
                      <th>Tipo en DataVault</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentSheet.columns.map((col, i) => {
                      const isRel = col.data_type === "relation";
                      const isNew = false;
                      const cls = isRel ? "is-rel" : isNew ? "is-new" : "";
                      return (
                        <tr key={i}>
                          <td>
                            <div className="src-name">{col.header}</div>
                            <div className="src-sample">{col.field_key}</div>
                          </td>
                          <td>
                            <span className="src-sample">
                              {col.options && col.options.length > 0
                                ? col.options.slice(0, 3).join(", ") + (col.options.length > 3 ? "…" : "")
                                : "—"}
                            </span>
                          </td>
                          <td className="arrow"><IcArrowRight size={14} /></td>
                          <td>
                            <div className={`map-target ${cls}`.trim()}>
                              <span className="glyph">{TYPE_GLYPH[col.data_type] ?? "A"}</span>
                              <div className="map-target__main">
                                <b>{TYPE_LABELS[col.data_type] ?? col.data_type}</b>
                                {col.options && col.options.length > 0 && (
                                  <span className="map-target__sub"> · {col.options.length} valores</span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

            {/* ─────────── STEP 4 — Confirmar ─────────── */}
            {step === 4 && preview && (
              <>
                <div className="wiz-body__head">
                  <h2>Todo listo para importar</h2>
                  <p>
                    Revisa el resumen. Cuando confirmes, procesamos
                    {selectedCount === 1 ? " la hoja seleccionada" : ` las ${selectedCount} hojas seleccionadas`}
                    {" "}y creamos
                    {selectedCount === 1 ? " un dataset" : ` ${selectedCount} datasets`} en DataVault.
                  </p>
                </div>

                <div className="summary-grid">
                  <div className="summary-card">
                    <span className="summary-card__icon is-pri"><IcTable size={16} /></span>
                    <div className="summary-card__val">{selectedCount}</div>
                    <div className="summary-card__label">{selectedCount === 1 ? "tabla nueva" : "tablas nuevas"}</div>
                  </div>
                  <div className="summary-card">
                    <span className="summary-card__icon"><IcList size={16} /></span>
                    <div className="summary-card__val">{totalSelectedCols}</div>
                    <div className="summary-card__label">columnas mapeadas</div>
                  </div>
                  <div className="summary-card">
                    <span className="summary-card__icon is-rel"><IcLink size={16} /></span>
                    <div className="summary-card__val">{preview.sheets.length}</div>
                    <div className="summary-card__label">hojas en el archivo</div>
                  </div>
                  <div className="summary-card">
                    <span className="summary-card__icon is-calc"><IcSparkles size={16} /></span>
                    <div className="summary-card__val">{totalSelectedRows.toLocaleString()}</div>
                    <div className="summary-card__label">filas totales</div>
                  </div>
                </div>

                {/* Lista de datasets a crear */}
                <div style={{
                  border: "1px solid var(--border-soft)", borderRadius: "var(--r-2)", overflow: "hidden",
                }}>
                  {selectedSheets.map((s) => (
                    <div key={s.name} style={{
                      display: "flex", alignItems: "center", gap: "var(--sp-3)",
                      padding: "var(--sp-2) var(--sp-3)", borderBottom: "1px solid var(--border-soft)",
                      fontSize: "var(--fs-13)",
                    }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 28, height: 28, borderRadius: "var(--r-1)",
                        background: "color-mix(in oklab, #1da462 14%, var(--surface))", color: "#1da462",
                        flexShrink: 0,
                      }}>
                        <IcTable size={14} />
                      </span>
                      <b>{sheetState[s.name]?.name?.trim() || s.name}</b>
                      <span style={{ marginLeft: "auto", color: "var(--text-mute)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-11)" }}>
                        {s.row_count} filas · {s.columns.length} col
                      </span>
                    </div>
                  ))}
                </div>

                {hasDupName && (
                  <p style={{ margin: "var(--sp-3) 0 0", color: "var(--danger)", fontSize: "var(--fs-12)" }}>
                    ⚠ Dos hojas tienen el mismo nombre de dataset. Edítalos en el paso 2 para que sean únicos.
                  </p>
                )}

                {importMut.isError && (
                  <p style={{ margin: "var(--sp-3) 0 0", color: "var(--danger)", fontSize: "var(--fs-13)" }}>
                    ⚠ {(importMut.error as Error)?.message ?? "Error al importar"}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="wiz-foot">
            <div className="wiz-foot__meta">
              {preview ? (
                <>
                  <IcCheck size={12} />
                  <span><b>{preview.filename}</b> · {footMeta[step]}</span>
                </>
              ) : (
                <span>{footMeta[step]}</span>
              )}
            </div>
            <div className="wiz-foot__actions">
              <button className="btn btn--ghost" onClick={handleClose}>Cancelar</button>
              {step > 1 && (
                <button className="btn btn--secondary" onClick={goBack}>
                  Atrás
                </button>
              )}
              {step < 4 ? (
                <button
                  className="btn btn--primary"
                  disabled={!canGoNext()}
                  onClick={step === 1 ? () => fileRef.current?.click() : goNext}
                >
                  {step === 1 ? "Selecciona un archivo" : (
                    <>
                      {nextLabel[step]} <IcArrowRight size={14} />
                    </>
                  )}
                </button>
              ) : (
                <button
                  className="btn btn--primary"
                  disabled={importMut.isPending || selectedCount === 0 || hasDupName}
                  onClick={() => importMut.mutate()}
                >
                  {importMut.isPending
                    ? "Importando…"
                    : selectedCount > 1
                      ? `Crear ${selectedCount} datasets`
                      : "Crear dataset"}
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

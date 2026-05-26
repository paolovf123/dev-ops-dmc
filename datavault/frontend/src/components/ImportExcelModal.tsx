import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  previewExcelImport,
  importDatasetFromExcel,
  importDatasetsFromExcelMulti,
} from "../api/datasets";
import type { ExcelPreview } from "../api/datasets";
import { useEscapeKey } from "../utils/useEscapeKey";

const TYPE_COLORS: Record<string, string> = {
  text: "#64748B", long_text: "#475569", url: "#0891B2", email: "#0284C7", phone: "#0369A1",
  number: "#2563EB", currency: "#16A34A", percent: "#7C3AED", rating: "#D97706",
  enum: "#EA580C", multiselect: "#C2410C", boolean: "#059669",
  date: "#9333EA", relation: "#DB2777",
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

export default function ImportExcelModal({ open, onClose, workspaceId, onSuccess, onMultiSuccess, initialFile }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
  const [sheetState, setSheetState] = useState<Record<string, SheetState>>({});
  const [focusedSheet, setFocusedSheet] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [previewErr, setPreviewErr] = useState("");
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

  // Reset rename for renamed sheets if user changes focus? Not needed; sheetState persists.
  useEffect(() => {
    // No-op; placeholder for future side-effects when focus changes.
  }, [focusedSheet]);

  const currentSheet = preview?.sheets.find((s) => s.name === focusedSheet);
  const selectedCount = selectedSheets.length;
  const totalSelectedRows = selectedSheets.reduce((a, s) => a + s.row_count, 0);
  const hasDupName =
    selectedCount > 1 &&
    new Set(selectedSheets.map((s) => (sheetState[s.name].name.trim() || s.name).toLowerCase())).size !==
      selectedSheets.length;

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div style={{
        background: "var(--color-surface)", borderRadius: 14, padding: "28px 32px",
        width: "min(820px, 95vw)", maxHeight: "92vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)", gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 22 }}>📊</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Importar desde Excel</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
              .xlsx · varias hojas → un dataset por hoja
            </p>
          </div>
          <button className="btn btn-ghost" onClick={handleClose}
            style={{ marginLeft: "auto", padding: "4px 8px", fontSize: 18 }}>×</button>
        </div>

        {/* Drop zone */}
        {!preview && (
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
              border: `2px dashed ${dragOver ? "var(--color-primary)" : "var(--color-border)"}`,
              borderRadius: 10, padding: "36px 20px", textAlign: "center", cursor: "pointer",
              background: dragOver ? "var(--color-primary-bg)" : "var(--color-bg)",
              transition: "all .15s",
            }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {previewMut.isPending ? (
              <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: 14 }}>Analizando archivo…</p>
            ) : (
              <>
                <p style={{ margin: "0 0 6px", fontSize: 32 }}>📁</p>
                <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: 14 }}>Arrastra tu archivo Excel aquí</p>
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)" }}>o haz clic para seleccionar</p>
              </>
            )}
          </div>
        )}

        {previewErr && (
          <p style={{ margin: 0, color: "var(--pm-red-500)", fontSize: 13, padding: "8px 12px",
            background: "var(--pm-red-50, #fff1f2)", borderRadius: 8, border: "1px solid var(--pm-red-200, #fecdd3)" }}>
            ⚠ {previewErr}
          </p>
        )}

        {/* Preview section */}
        {preview && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" }}>
            {/* File info + change */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
              background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border)" }}>
              <span style={{ fontSize: 18 }}>📊</span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{preview.filename}</span>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {preview.sheets.length} hoja{preview.sheets.length !== 1 ? "s" : ""}
              </span>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: "3px 10px" }}
                onClick={() => { setPreview(null); previewMut.reset(); fileRef.current?.click(); }}>
                Cambiar
              </button>
            </div>

            {/* Sheets list with checkboxes + editable names */}
            <div>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                  Hojas a importar
                  <span style={{ fontWeight: 400, color: "var(--color-text-muted)", marginLeft: 6 }}>
                    ({selectedCount} de {preview.sheets.length} seleccionada{selectedCount !== 1 ? "s" : ""})
                  </span>
                </p>
                {preview.sheets.length > 1 && (
                  <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 12, padding: "3px 10px" }}
                    onClick={selectAll}>
                    {preview.sheets.every((s) => sheetState[s.name]?.selected) ? "Quitar todas" : "Seleccionar todas"}
                  </button>
                )}
              </div>

              <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8 }}>
                {preview.sheets.map((s) => {
                  const st = sheetState[s.name];
                  const isFocused = focusedSheet === s.name;
                  return (
                    <div key={s.name}
                      onClick={() => setFocusedSheet(s.name)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--color-border-light)",
                        background: isFocused ? "var(--color-primary-bg)" : "transparent",
                        cursor: "pointer",
                      }}>
                      <input type="checkbox" checked={!!st?.selected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSheet(s.name)}
                        style={{ width: 16, height: 16, cursor: "pointer" }} />
                      <div style={{ minWidth: 0, flex: "0 0 32%" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
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
                          flex: 1, fontSize: 13, padding: "5px 10px",
                          border: "1px solid var(--color-border)", borderRadius: 6,
                          background: st?.selected ? "var(--color-surface)" : "var(--color-bg)",
                          color: st?.selected ? "var(--color-text)" : "var(--color-text-muted)",
                        }} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column preview of the focused sheet */}
            {currentSheet && (
              <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                  Vista previa de <span style={{ color: "var(--color-primary)" }}>{currentSheet.name}</span>
                  <span style={{ fontWeight: 400, color: "var(--color-text-muted)", marginLeft: 6 }}>
                    ({currentSheet.columns.length} columnas)
                  </span>
                </p>
                <div style={{ overflowY: "auto", maxHeight: 180, borderRadius: 8,
                  border: "1px solid var(--color-border)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "var(--color-bg)", position: "sticky", top: 0 }}>
                        <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600,
                          borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                          Columna
                        </th>
                        <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600,
                          borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                          Tipo
                        </th>
                        <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600,
                          borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                          Clave
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentSheet.columns.map((col, i) => {
                        const color = TYPE_COLORS[col.data_type] ?? "#64748B";
                        return (
                          <tr key={i} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                            <td style={{ padding: "5px 12px", fontWeight: 500 }}>{col.header}</td>
                            <td style={{ padding: "5px 12px" }}>
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                                background: color + "1a", color, border: `1px solid ${color}40`,
                              }}>
                                {TYPE_LABELS[col.data_type] ?? col.data_type}
                              </span>
                            </td>
                            <td style={{ padding: "5px 12px" }}>
                              <code style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                                {col.field_key}
                              </code>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {hasDupName && (
              <p style={{ margin: 0, color: "var(--pm-red-500)", fontSize: 12 }}>
                ⚠ Dos hojas tienen el mismo nombre de dataset. Edítalos para que sean únicos.
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        {preview && (
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end",
            paddingTop: 16, borderTop: "1px solid var(--color-border-light)" }}>
            <button className="btn btn-secondary" onClick={handleClose}>Cancelar</button>
            <button className="btn btn-primary"
              disabled={importMut.isPending || selectedCount === 0 || hasDupName}
              onClick={() => importMut.mutate()}>
              {importMut.isPending
                ? "Importando…"
                : selectedCount > 1
                  ? `Importar ${selectedCount} datasets (${totalSelectedRows} filas)`
                  : `Importar${currentSheet ? ` ${currentSheet.row_count} filas` : ""}`}
            </button>
          </div>
        )}

        {importMut.isError && (
          <p style={{ margin: 0, color: "var(--pm-red-500)", fontSize: 13 }}>
            ⚠ {(importMut.error as Error)?.message ?? "Error al importar"}
          </p>
        )}
      </div>
    </div>
  );
}

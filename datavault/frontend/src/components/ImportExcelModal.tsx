import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { previewExcelImport, importDatasetFromExcel } from "../api/datasets";
import type { ExcelPreview } from "../api/datasets";

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

interface Props {
  open: boolean;
  onClose: () => void;
  workspaceId?: string;
  onSuccess: (datasetId: string, datasetName: string, counts: { cols: number; rows: number }) => void;
}

export default function ImportExcelModal({ open, onClose, workspaceId, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [dsName, setDsName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [previewErr, setPreviewErr] = useState("");

  const previewMut = useMutation({
    mutationFn: (f: File) => previewExcelImport(f),
    onSuccess: (data) => {
      setPreview(data);
      setPreviewErr("");
      const firstSheet = data.sheets[0]?.name ?? "";
      setSelectedSheet(firstSheet);
      const baseName = data.filename.replace(/\.(xlsx?|xlsm)$/i, "");
      setDsName(data.sheets.length > 1 ? `${baseName} - ${firstSheet}` : baseName);
    },
    onError: (e: Error) => setPreviewErr(e.message ?? "Error al leer el archivo"),
  });

  const importMut = useMutation({
    mutationFn: () => {
      if (!previewMut.variables) throw new Error("no file");
      return importDatasetFromExcel(previewMut.variables, {
        workspace_id: workspaceId,
        name: dsName.trim() || undefined,
        sheet: selectedSheet || undefined,
      });
    },
    onSuccess: (data) => {
      onSuccess(data.dataset_id, data.dataset_name, { cols: data.columns_created, rows: data.records_created });
      handleClose();
    },
  });

  const handleClose = () => {
    setPreview(null);
    setSelectedSheet("");
    setDsName("");
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

  const handleSheetChange = (name: string) => {
    setSelectedSheet(name);
    if (preview) {
      const baseName = preview.filename.replace(/\.(xlsx?|xlsm)$/i, "");
      setDsName(preview.sheets.length > 1 ? `${baseName} - ${name}` : baseName);
    }
  };

  const currentSheet = preview?.sheets.find((s) => s.name === selectedSheet);

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div style={{
        background: "var(--color-surface)", borderRadius: 14, padding: "28px 32px",
        width: "min(720px, 95vw)", maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)", gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 22 }}>📊</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Importar desde Excel</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
              .xlsx · múltiples hojas · columnas vacías filtradas automáticamente
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
          <div style={{ display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
            {/* File info + change */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
              background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-border)" }}>
              <span style={{ fontSize: 18 }}>📊</span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{preview.filename}</span>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: "3px 10px" }}
                onClick={() => { setPreview(null); previewMut.reset(); fileRef.current?.click(); }}>
                Cambiar archivo
              </button>
            </div>

            {/* Sheet picker */}
            {preview.sheets.length > 1 && (
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Seleccionar hoja:</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {preview.sheets.map((s) => (
                    <label key={s.name} style={{
                      display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                      padding: "6px 14px", borderRadius: 8, border: "1.5px solid",
                      borderColor: selectedSheet === s.name ? "var(--color-primary)" : "var(--color-border)",
                      background: selectedSheet === s.name ? "var(--color-primary-bg)" : "transparent",
                      fontSize: 13, fontWeight: selectedSheet === s.name ? 600 : 400,
                      color: selectedSheet === s.name ? "var(--color-primary)" : "var(--color-text)",
                    }}>
                      <input type="radio" name="sheet" value={s.name}
                        checked={selectedSheet === s.name}
                        onChange={() => handleSheetChange(s.name)}
                        style={{ display: "none" }} />
                      <span>{s.name}</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 400 }}>
                        {s.row_count} filas · {s.columns.length} col
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Dataset name */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre del dataset</label>
              <input value={dsName} onChange={(e) => setDsName(e.target.value)}
                placeholder="Nombre del dataset" style={{ fontSize: 14 }} />
            </div>

            {/* Column preview */}
            {currentSheet && (
              <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                  Vista previa de columnas
                  <span style={{ fontWeight: 400, color: "var(--color-text-muted)", marginLeft: 6 }}>
                    ({currentSheet.columns.length} detectadas · {currentSheet.row_count} filas)
                  </span>
                </p>
                <div style={{ overflowY: "auto", maxHeight: 220, borderRadius: 8,
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
          </div>
        )}

        {/* Footer */}
        {preview && (
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end",
            paddingTop: 16, borderTop: "1px solid var(--color-border-light)" }}>
            <button className="btn btn-secondary" onClick={handleClose}>Cancelar</button>
            <button className="btn btn-primary" disabled={importMut.isPending || !dsName.trim()}
              onClick={() => importMut.mutate()}>
              {importMut.isPending
                ? "Importando…"
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

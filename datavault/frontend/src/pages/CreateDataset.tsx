import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  ChevronLeft, Upload, ArrowRight, Sparkles, Plus, Trash2, Check,
  Link2, Lock,
} from "lucide-react";
import { createDataset, createColumn } from "../api/datasets";
import client from "../api/client";
import type { ColumnDefinition } from "../types";
import ImportExcelModal from "../components/ImportExcelModal";
import { useWorkspace } from "../workspace/WorkspaceContext";
import AppShell from "../components/chrome/AppShell";
import { Badge, Btn, Toggle } from "../components/ui/kit";

interface ColDraft {
  uid: string;
  name: string;
  field_key: string;
  data_type: ColumnDefinition["data_type"];
  required: boolean;
  options: string;
  currency_symbol: string;
  max_rating: number;
  locked?: boolean;
}

const DATA_TYPES: { value: ColumnDefinition["data_type"]; label: string }[] = [
  { value: "text",        label: "Texto"        },
  { value: "long_text",   label: "Texto largo"  },
  { value: "url",         label: "Enlace"       },
  { value: "email",       label: "Email"        },
  { value: "phone",       label: "Teléfono"     },
  { value: "number",      label: "Número"       },
  { value: "currency",    label: "Moneda"       },
  { value: "percent",     label: "Porcentaje"   },
  { value: "rating",      label: "Calificación" },
  { value: "enum",        label: "Lista"        },
  { value: "multiselect", label: "Multi-lista"  },
  { value: "boolean",     label: "Sí / No"      },
  { value: "date",        label: "Fecha"        },
  { value: "relation",    label: "Relación"     },
];

function slugify(v: string) {
  return v.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}
function keyword(name: string) {
  const parts = name.toLowerCase().replace(/\s+/g, "_").split("_");
  return parts[parts.length - 1];
}
function newCol(overrides: Partial<ColDraft> = {}): ColDraft {
  return {
    uid: crypto.randomUUID(),
    name: "", field_key: "", data_type: "text", required: false,
    options: "", currency_symbol: "$", max_rating: 5,
    ...overrides,
  };
}

// ── Templates ────────────────────────────────────────────────────────────────
interface Template {
  id: string;
  emoji: string;
  name: string;
  description: string;
  columns: Array<Partial<ColDraft> & Pick<ColDraft, "name" | "data_type">>;
}

const TEMPLATES: Template[] = [
  {
    id: "clientes", emoji: "📇", name: "Clientes",
    description: "CRM básico: contacto, empresa, estado",
    columns: [
      { name: "Nombre", data_type: "text", required: true },
      { name: "Email", data_type: "email" },
      { name: "Teléfono", data_type: "phone" },
      { name: "Empresa", data_type: "text" },
      { name: "Estado", data_type: "enum", options: "Lead, Activo, Inactivo, Perdido" },
      { name: "Fecha de alta", data_type: "date" },
      { name: "Notas", data_type: "long_text" },
    ],
  },
  {
    id: "productos", emoji: "📦", name: "Productos",
    description: "Catálogo con precio, stock y categoría",
    columns: [
      { name: "Nombre", data_type: "text", required: true },
      { name: "SKU", data_type: "text" },
      { name: "Categoría", data_type: "enum", options: "Electrónica, Ropa, Hogar, Comida, Otro" },
      { name: "Precio", data_type: "currency", currency_symbol: "S/" },
      { name: "Stock", data_type: "number" },
      { name: "Activo", data_type: "boolean" },
      { name: "Foto", data_type: "url" },
    ],
  },
  {
    id: "tareas", emoji: "📊", name: "Tareas",
    description: "Lista de pendientes con estado y prioridad",
    columns: [
      { name: "Tarea", data_type: "text", required: true },
      { name: "Asignado a", data_type: "text" },
      { name: "Estado", data_type: "enum", options: "Pendiente, En progreso, En revisión, Completada" },
      { name: "Prioridad", data_type: "enum", options: "Baja, Media, Alta, Urgente" },
      { name: "Fecha límite", data_type: "date" },
      { name: "Completada", data_type: "boolean" },
    ],
  },
  {
    id: "inventario", emoji: "🗃️", name: "Inventario",
    description: "Stock por ubicación con última revisión",
    columns: [
      { name: "Producto", data_type: "text", required: true },
      { name: "Cantidad", data_type: "number" },
      { name: "Ubicación", data_type: "text" },
      { name: "Mínimo", data_type: "number" },
      { name: "Última revisión", data_type: "date" },
      { name: "Necesita reposición", data_type: "boolean" },
    ],
  },
  {
    id: "presupuesto", emoji: "💰", name: "Presupuesto mensual",
    description: "Ingresos y gastos categorizados",
    columns: [
      { name: "Fecha", data_type: "date", required: true },
      { name: "Concepto", data_type: "text", required: true },
      { name: "Categoría", data_type: "enum", options: "Vivienda, Comida, Transporte, Ocio, Salud, Servicios, Ingreso, Otro" },
      { name: "Tipo", data_type: "enum", options: "Ingreso, Gasto" },
      { name: "Monto", data_type: "currency", currency_symbol: "S/" },
      { name: "Pagado", data_type: "boolean" },
      { name: "Notas", data_type: "long_text" },
    ],
  },
  {
    id: "contactos", emoji: "👥", name: "Contactos",
    description: "Agenda con tags y cumpleaños",
    columns: [
      { name: "Nombre", data_type: "text", required: true },
      { name: "Email", data_type: "email" },
      { name: "Teléfono", data_type: "phone" },
      { name: "Cumpleaños", data_type: "date" },
      { name: "Tags", data_type: "multiselect", options: "Familia, Amigo, Trabajo, Universidad, Cliente" },
      { name: "Notas", data_type: "long_text" },
    ],
  },
];

function templateToCols(t: Template): ColDraft[] {
  return t.columns.map((c) => newCol({
    name: c.name,
    field_key: slugify(c.name),
    data_type: c.data_type,
    required: c.required ?? false,
    options: c.options ?? "",
    currency_symbol: c.currency_symbol ?? "$",
    max_rating: c.max_rating ?? 5,
  }));
}

// ── Type inference from a column of sample values ────────────────────────────
function inferDataType(values: unknown[]): ColumnDefinition["data_type"] {
  const samples = values
    .filter((v) => v !== null && v !== undefined && v !== "")
    .slice(0, 20)
    .map((v) => String(v).trim());
  if (samples.length === 0) return "text";

  const allBool = samples.every((s) => /^(true|false|sí|si|no|yes|y|n|1|0)$/i.test(s));
  if (allBool && samples.length > 1) return "boolean";

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (samples.every((s) => emailRe.test(s))) return "email";

  if (samples.every((s) => /^https?:\/\//i.test(s))) return "url";

  if (samples.every((s) => /^[+\d\s\-()]{7,}$/.test(s) && /\d{6,}/.test(s.replace(/\D/g, "")))) return "phone";

  const pctRe = /^-?\d+(\.\d+)?\s*%$/;
  if (samples.every((s) => pctRe.test(s))) return "percent";

  const currencyRe = /^[$€£¥S/]\s*-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?\s*(USD|PEN|EUR|GBP)$/i;
  if (samples.every((s) => currencyRe.test(s))) return "currency";

  if (samples.every((s) => !isNaN(parseFloat(s)) && isFinite(Number(s)) && /^-?\d+(\.\d+)?$/.test(s))) return "number";

  if (samples.every((s) => !isNaN(Date.parse(s)) && /\d{4}|\d{1,2}[\/\-]\d{1,2}/.test(s))) return "date";

  if (samples.every((s) => s.length > 80)) return "long_text";

  return "text";
}

interface ParsedFile {
  fileName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  inferredCols: ColDraft[];
}

async function parseFile(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) throw new Error("Archivo vacío");
  const sheet = wb.Sheets[firstSheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  if (json.length === 0) throw new Error("La primera hoja no tiene datos");
  const headers = Object.keys(json[0]);

  const inferredCols: ColDraft[] = headers.map((h) => {
    const col_values = json.map((r) => r[h]);
    const data_type = inferDataType(col_values);
    return newCol({
      name: h,
      field_key: slugify(h),
      data_type,
    });
  });

  return { fileName: file.name, headers, rows: json, inferredCols };
}

// ── Component ────────────────────────────────────────────────────────────────
export default function CreateDataset() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const linkedName = searchParams.get("linkedName") ?? "";

  const fkPreset: ColDraft | null = linkedName
    ? { uid: crypto.randomUUID(), name: `ID ${linkedName}`, field_key: `id_${keyword(linkedName)}`, data_type: "text", required: true, options: "", currency_symbol: "$", max_rating: 5, locked: true }
    : null;

  // step: 'choose' shows the picker; 'form' shows the column editor.
  // If linkedName is set we skip the picker (legacy flow).
  const [step, setStep] = useState<"choose" | "form">(linkedName ? "form" : "choose");
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [importedRows, setImportedRows] = useState<Record<string, unknown>[]>([]);
  const [importStatus, setImportStatus] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);

  const [dsName, setDsName] = useState("");
  const [dsDesc, setDsDesc] = useState("");
  const [cols, setCols] = useState<ColDraft[]>(fkPreset ? [fkPreset, newCol()] : [newCol()]);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { current: currentWorkspace } = useWorkspace();
  // Cuando el Excel tiene 2+ hojas, abrimos ImportExcelModal con el archivo preseleccionado
  const [multiSheetFile, setMultiSheetFile] = useState<File | null>(null);

  const updateCol = (uid: string, patch: Partial<ColDraft>) =>
    setCols((prev) =>
      prev.map((c) => {
        if (c.uid !== uid) return c;
        const updated = { ...c, ...patch };
        if (patch.name !== undefined) updated.field_key = slugify(patch.name);
        return updated;
      })
    );

  // ── Apply a template ────────────────────────────────────────────────────
  const applyTemplate = (t: Template) => {
    setAppliedTemplate(t.id);
    setCols(templateToCols(t));
    if (!dsName.trim()) setDsName(t.name);
    setStep("form");
  };

  // ── Import file (XLSX / CSV) ────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setImportStatus(`Leyendo ${file.name}…`);
    try {
      // Para Excel chequeamos cuántas hojas tiene. Si son 2+, derivamos al
      // ImportExcelModal que sabe importar varias hojas como datasets distintos.
      const isExcel = /\.(xlsx|xls|xlsm)$/i.test(file.name);
      if (isExcel) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", bookSheets: true });
        const nonEmptySheets = wb.SheetNames.filter((n) => {
          // Si no podemos leer el sheet sin contenido, asumimos que sí tiene
          const s = wb.Sheets?.[n];
          return !s || true; // bookSheets=true no carga celdas; tratamos todas como válidas
        });
        if (nonEmptySheets.length > 1) {
          setMultiSheetFile(file);
          setImportStatus(`${nonEmptySheets.length} hojas detectadas — abriendo importador múltiple…`);
          return;
        }
      }
      const parsed = await parseFile(file);
      setCols(parsed.inferredCols);
      setImportedRows(parsed.rows);
      if (!dsName.trim()) {
        const baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, "");
        setDsName(baseName);
      }
      setImportStatus(`${parsed.rows.length} filas detectadas · ${parsed.inferredCols.length} columnas inferidas`);
      setAppliedTemplate(null);
      setStep("form");
    } catch (err) {
      setImportStatus(`Error: ${err instanceof Error ? err.message : "no se pudo leer el archivo"}`);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── Submit: create dataset + columns + (optional) rows ──────────────────
  const handleSubmit = async () => {
    if (!dsName.trim()) { setNameError("El nombre es requerido"); return; }
    const validCols = cols.filter((c) => c.name.trim() && c.field_key.trim());
    setSaving(true);
    try {
      const ds = await createDataset(dsName.trim(), dsDesc.trim() || undefined);
      // Create columns sequentially so the resulting field_keys are predictable for imports
      const createdCols: ColumnDefinition[] = [];
      for (let i = 0; i < validCols.length; i++) {
        const c = validCols[i];
        const rules: ColumnDefinition["rules"] = {};
        if (c.required) rules.required = true;
        if ((c.data_type === "enum" || c.data_type === "multiselect") && c.options)
          rules.options = c.options.split(",").map((o) => o.trim()).filter(Boolean);
        if (c.data_type === "currency") rules.currency_symbol = c.currency_symbol || "$";
        if (c.data_type === "rating") rules.max_rating = c.max_rating;
        const created = await createColumn(ds.id, {
          name: c.name.trim(), field_key: c.field_key.trim(),
          data_type: c.data_type, rules, position: i,
        });
        createdCols.push(created);
      }

      // If we have imported rows, post them. We map header -> field_key by name match.
      if (importedRows.length > 0) {
        const headerToKey = new Map<string, string>();
        for (let i = 0; i < validCols.length; i++) {
          const draft = validCols[i];
          const created = createdCols[i];
          if (created) headerToKey.set(draft.name, created.field_key);
        }
        // POST one record at a time to keep error handling simple. For huge files this could batch.
        const limit = Math.min(importedRows.length, 1000); // safety cap
        for (let i = 0; i < limit; i++) {
          const r = importedRows[i];
          const data: Record<string, unknown> = {};
          for (const [header, val] of Object.entries(r)) {
            const key = headerToKey.get(header);
            if (key) data[key] = val;
          }
          try {
            await client.post(`/datasets/${ds.id}/records`, { data });
          } catch {
            // silently skip rows that fail validation; user can fix later
          }
        }
      }

      qc.invalidateQueries({ queryKey: ["datasets"] });
      navigate(`/datasets/${ds.id}`);
    } catch { setSaving(false); }
  };

  // ── Indicador de pasos (wizard) ─────────────────────────────────────────
  const StepHeader = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 24px" }}>
      {["Elegir origen", "Configurar columnas"].map((label, i) => {
        const n = i + 1;
        const cur = step === "choose" ? 1 : 2;
        const on = cur === n;
        const done = cur > n;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, font: `${on ? 600 : 500} 13px/1 var(--font-sans)`, color: on ? "var(--text)" : "var(--text-mute)" }}>
              <span style={{
                display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: "var(--r-pill)",
                background: on || done ? "var(--accent-pri)" : "var(--surface-alt)",
                color: on || done ? "#fff" : "var(--text-mute)", font: "700 12px/1 var(--font-sans)",
              }}>{done ? <Check size={13} /> : n}</span>
              {label}
            </span>
            {i === 0 && <span style={{ flex: "0 0 40px", height: 2, background: "var(--border)" }} />}
          </div>
        );
      })}
    </div>
  );

  // ── Píldoras de contexto (relacionado / plantilla / filas importadas) ────
  const ContextPills = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {linkedName && <Badge tone="rel" dot>Relacionado con {linkedName}</Badge>}
      {appliedTemplate && <Badge tone="primary">Plantilla: {TEMPLATES.find((t) => t.id === appliedTemplate)?.name}</Badge>}
      {importedRows.length > 0 && <Badge tone="warn">{importedRows.length} filas listas para importar</Badge>}
    </div>
  );

  // ── Render: choose step ────────────────────────────────────────────────
  if (step === "choose") {
    return (
      <>
        <AppShell active="home">
          <main className="home-main" style={{ overflowY: "auto", padding: 0 }}>
            <div style={{ maxWidth: 880, margin: "0 auto", padding: "28px 32px 80px" }}>
              <button onClick={() => navigate("/")} style={{
                display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent",
                cursor: "pointer", color: "var(--text-soft)", font: "500 13px/1 var(--font-sans)", padding: 0, marginBottom: 14,
              }}><ChevronLeft size={16} /> Volver a Datasets</button>

              <h1 style={{ margin: 0, font: "700 26px/1.1 var(--font-sans)", letterSpacing: "-.02em", color: "var(--text)" }}>Nuevo dataset</h1>

              <StepHeader />

              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                style={{
                  border: `2px dashed ${dragOver ? "var(--accent-pri)" : "var(--border-strong)"}`,
                  borderRadius: "var(--r-3)", padding: "36px 20px", textAlign: "center",
                  background: dragOver ? "var(--pri-soft)" : "var(--surface)", cursor: "pointer",
                  transition: "all var(--t-fast)",
                }}>
                <span style={{
                  display: "grid", placeItems: "center", width: 52, height: 52, margin: "0 auto 14px",
                  borderRadius: "var(--r-3)", background: "var(--pri-soft)", color: "var(--accent-pri)",
                }}><Upload size={24} /></span>
                <div style={{ font: "600 15px/1 var(--font-sans)", color: "var(--text)" }}>Arrastra un Excel o CSV aquí</div>
                <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-mute)", marginTop: 5 }}>
                  .xlsx · .xls · .csv · hasta 10 MB · detección de tipos automática
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>
              {importStatus && (
                <p style={{ margin: "10px 2px 0", font: "400 12.5px/1.4 var(--font-sans)", color: "var(--text-soft)" }}>{importStatus}</p>
              )}

              {/* Separador */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "26px 0 16px" }}>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <span style={{ font: "500 12px/1 var(--font-sans)", color: "var(--text-mute)" }}>o elige una plantilla</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>

              {/* Galería de plantillas */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(232px, 1fr))", gap: 12 }}>
                {TEMPLATES.map((t) => (
                  <button key={t.id} className="og-card" onClick={() => applyTemplate(t)} style={{
                    textAlign: "left", display: "flex", gap: 11, padding: 14, borderRadius: "var(--r-3)",
                    border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer",
                    boxShadow: "var(--shadow-1)", transition: "all var(--t-fast)",
                  }}>
                    <span style={{ fontSize: 26, lineHeight: 1, flex: "none" }}>{t.emoji}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", font: "600 14px/1.2 var(--font-sans)", color: "var(--text)" }}>{t.name}</span>
                      <span style={{ display: "block", font: "400 12px/1.4 var(--font-sans)", color: "var(--text-mute)", marginTop: 2 }}>
                        {t.description} · {t.columns.length} col
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {/* Acciones */}
              <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 22, flexWrap: "wrap" }}>
                <button onClick={() => setStep("form")} style={{
                  display: "inline-flex", alignItems: "center", gap: 7, border: "none", background: "transparent",
                  cursor: "pointer", color: "var(--accent-pri)", font: "600 14px/1 var(--font-sans)",
                }}>o empieza desde cero <ArrowRight size={16} /></button>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 7, color: "var(--text-soft)",
                  font: "600 14px/1 var(--font-sans)",
                }}><Sparkles size={15} /> Detección de tipos automática</span>
              </div>
            </div>
          </main>
        </AppShell>

        <ImportExcelModal
          open={!!multiSheetFile}
          onClose={() => { setMultiSheetFile(null); setImportStatus(""); }}
          workspaceId={currentWorkspace?.id}
          initialFile={multiSheetFile}
          onSuccess={(datasetId) => {
            setMultiSheetFile(null);
            qc.invalidateQueries({ queryKey: ["datasets"] });
            navigate(`/datasets/${datasetId}`);
          }}
          onMultiSuccess={(summary) => {
            setMultiSheetFile(null);
            qc.invalidateQueries({ queryKey: ["datasets"] });
            if (summary.firstId) navigate(`/datasets/${summary.firstId}`);
            else navigate("/");
          }}
        />
      </>
    );
  }

  // ── Render: form step (Configurar columnas) ─────────────────────────────
  const validColCount = cols.filter((c) => c.name).length;
  const submitLabel = (() => {
    const colsPart = validColCount > 0 ? ` con ${validColCount} columna${validColCount !== 1 ? "s" : ""}` : "";
    const rowsPart = importedRows.length > 0 ? ` + ${importedRows.length} fila${importedRows.length !== 1 ? "s" : ""}` : "";
    return `Crear dataset${colsPart}${rowsPart}`;
  })();

  return (
    <>
      <AppShell active="home">
        <main className="home-main" style={{ overflowY: "auto", padding: 0 }}>
          <div style={{ maxWidth: 880, margin: "0 auto", padding: "28px 32px 80px" }}>
            <button
              onClick={() => (linkedName ? navigate("/") : setStep("choose"))}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent",
                cursor: "pointer", color: "var(--text-soft)", font: "500 13px/1 var(--font-sans)", padding: 0, marginBottom: 14,
              }}>
              <ChevronLeft size={16} /> {linkedName ? "Volver a Datasets" : "Cambiar origen"}
            </button>

            <h1 style={{ margin: 0, font: "700 26px/1.1 var(--font-sans)", letterSpacing: "-.02em", color: "var(--text)" }}>Nuevo dataset</h1>

            <StepHeader />

            {(linkedName || appliedTemplate || importedRows.length > 0) && (
              <div style={{ marginBottom: 20 }}><ContextPills /></div>
            )}

            {/* Nombre + descripción */}
            <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
              <label style={{ flex: 1, minWidth: 220 }}>
                <div style={{ font: "500 13px/1 var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>
                  Nombre <span style={{ color: "var(--danger)" }}>*</span>
                </div>
                <input
                  placeholder="Ej. Clientes 2025" value={dsName} autoFocus
                  onChange={(e) => { setDsName(e.target.value); setNameError(""); }}
                  style={{
                    width: "100%", height: 40, padding: "0 12px", boxSizing: "border-box",
                    borderRadius: "var(--r-2)", background: "var(--surface)", outline: "none",
                    color: "var(--text)", font: "500 14px/1 var(--font-sans)",
                    border: `1px solid ${nameError ? "var(--danger)" : "var(--accent-pri)"}`,
                    boxShadow: nameError ? "none" : "var(--shadow-focus)",
                  }} />
                {nameError && <span style={{ font: "400 12px/1 var(--font-sans)", color: "var(--danger)", display: "block", marginTop: 5 }}>{nameError}</span>}
              </label>
              <label style={{ flex: 1, minWidth: 220 }}>
                <div style={{ font: "500 13px/1 var(--font-sans)", color: "var(--text-soft)", marginBottom: 6 }}>Descripción</div>
                <input
                  placeholder="Opcional" value={dsDesc} onChange={(e) => setDsDesc(e.target.value)}
                  style={{
                    width: "100%", height: 40, padding: "0 12px", boxSizing: "border-box",
                    borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)",
                    outline: "none", color: "var(--text)", font: "400 14px/1 var(--font-sans)",
                  }} />
              </label>
            </div>

            <div style={{ font: "600 14px/1 var(--font-sans)", color: "var(--text)", marginBottom: 10 }}>Columnas</div>

            {/* Tabla de columnas */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
              {/* Header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1.3fr 1.1fr 1.2fr 90px 44px", padding: "10px 14px",
                background: "var(--surface-2)", borderBottom: "1px solid var(--border)",
                font: "600 12px/1 var(--font-sans)", color: "var(--text-mute)", gap: 8,
              }}>
                <span>Nombre</span><span>field_key</span><span>Tipo</span><span>Requerido</span><span />
              </div>

              {cols.map((col, i) => (
                <ColRow key={col.uid} col={col} linkedName={linkedName} isLast={i === cols.length - 1}
                  onChange={(patch) => updateCol(col.uid, patch)}
                  onRemove={() => setCols((p) => p.filter((c) => c.uid !== col.uid))} />
              ))}

              <button onClick={() => setCols((p) => [...p, newCol()])} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "11px 14px",
                border: "none", borderTop: cols.length > 0 ? "1px solid var(--border)" : "none",
                background: "transparent", cursor: "pointer", color: "var(--accent-pri)", font: "600 13px/1 var(--font-sans)",
              }}><Plus size={15} /> Añadir columna</button>
            </div>

            {cols.length === 0 && (
              <p style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-mute)", textAlign: "center", padding: "16px 0" }}>
                Sin columnas — puedes agregar más tarde desde el dataset.
              </p>
            )}

            {/* Acciones */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
              <Btn variant="ghost" onClick={() => navigate("/")}>Cancelar</Btn>
              <Btn variant="primary" icon={<Check size={16} />} onClick={handleSubmit}
                disabled={saving || !dsName.trim()}>
                {saving ? "Creando…" : submitLabel}
              </Btn>
            </div>
          </div>
        </main>
      </AppShell>
    </>
  );
}

function ColRow({ col, linkedName, isLast, onChange, onRemove }: {
  col: ColDraft; linkedName: string; isLast: boolean;
  onChange: (p: Partial<ColDraft>) => void;
  onRemove: () => void;
}) {
  const border = isLast ? "none" : "1px solid var(--border)";

  // FK preset (relacionado): fila bloqueada en tono relación.
  if (col.locked) {
    return (
      <div style={{
        display: "grid", gridTemplateColumns: "1.3fr 1.1fr 1.2fr 90px 44px", alignItems: "center",
        padding: "9px 14px", gap: 8, borderBottom: border, background: "var(--rel-soft)",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <Lock size={13} style={{ color: "var(--accent-rel)", flex: "none" }} />
          <span style={{ font: "600 13.5px/1.2 var(--font-sans)", color: "var(--accent-rel)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.name}</span>
        </span>
        <span className="mono" style={{ font: "400 12px/1 var(--font-mono)", color: "var(--text-mute)", overflow: "hidden", textOverflow: "ellipsis" }}>{col.field_key}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, font: "500 12.5px/1 var(--font-sans)", color: "var(--text-soft)" }}>
          <Link2 size={13} style={{ color: "var(--accent-rel)" }} /> FK → {linkedName}
        </span>
        <span style={{ display: "flex", justifyContent: "center" }}><Check size={15} style={{ color: "var(--accent-rel)" }} /></span>
        <span />
      </div>
    );
  }

  const isRelation = col.data_type === "relation";

  return (
    <div style={{ borderBottom: border }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1.3fr 1.1fr 1.2fr 90px 44px", alignItems: "center",
        padding: "9px 14px", gap: 8,
      }}>
        <input
          placeholder="Nombre de columna" value={col.name}
          onChange={(e) => onChange({ name: e.target.value })}
          style={{
            height: 32, padding: "0 9px", boxSizing: "border-box", borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--surface)", outline: "none",
            color: "var(--text)", font: "500 13.5px/1 var(--font-sans)",
          }} />
        <input
          className="mono" placeholder="field_key" value={col.field_key}
          onChange={(e) => onChange({ field_key: slugify(e.target.value) })}
          style={{
            height: 32, padding: "0 9px", boxSizing: "border-box", borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--surface)", outline: "none",
            color: "var(--text-mute)", font: "400 12px/1 var(--font-mono)",
          }} />
        <select
          value={col.data_type}
          onChange={(e) => onChange({ data_type: e.target.value as ColumnDefinition["data_type"] })}
          style={{
            height: 32, padding: "0 8px", boxSizing: "border-box", borderRadius: 6,
            border: `1px solid ${isRelation ? "color-mix(in srgb, var(--accent-rel) 45%, transparent)" : "var(--border)"}`,
            background: "var(--surface)", outline: "none",
            color: isRelation ? "var(--accent-rel)" : "var(--text)",
            font: "500 12.5px/1 var(--font-mono)", cursor: "pointer",
          }}>
          {DATA_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        {col.data_type !== "relation" ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Toggle on={col.required} onChange={(v) => onChange({ required: v })} size={0.85} />
          </div>
        ) : (
          <span style={{ display: "flex", justifyContent: "center", font: "400 11px/1 var(--font-sans)", color: "var(--text-mute)" }}>—</span>
        )}

        <button onClick={onRemove} title="Quitar columna" className="og-iconbtn" style={{
          width: 30, height: 30, display: "grid", placeItems: "center", border: "none",
          background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-mute)",
        }}><Trash2 size={15} /></button>
      </div>

      {/* Extras por tipo */}
      {(col.data_type === "enum" || col.data_type === "multiselect") && (
        <div style={{ padding: "0 14px 10px 14px" }}>
          <input
            placeholder="Opciones separadas por coma: Activo, Inactivo, Pendiente"
            value={col.options} onChange={(e) => onChange({ options: e.target.value })}
            style={{
              width: "100%", height: 32, padding: "0 9px", boxSizing: "border-box", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--surface-alt)", outline: "none",
              color: "var(--text)", font: "400 13px/1 var(--font-sans)",
            }} />
        </div>
      )}
      {col.data_type === "currency" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 10px 14px" }}>
          <span style={{ font: "400 12px/1 var(--font-sans)", color: "var(--text-mute)", whiteSpace: "nowrap" }}>Símbolo:</span>
          <input
            value={col.currency_symbol} onChange={(e) => onChange({ currency_symbol: e.target.value })}
            placeholder="$" maxLength={5}
            style={{
              width: 64, height: 32, padding: "0 9px", boxSizing: "border-box", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--surface-alt)", outline: "none",
              color: "var(--text)", font: "400 13px/1 var(--font-sans)",
            }} />
        </div>
      )}
      {col.data_type === "rating" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 10px 14px" }}>
          <span style={{ font: "400 12px/1 var(--font-sans)", color: "var(--text-mute)", whiteSpace: "nowrap" }}>Escala:</span>
          {[3, 5, 10].map((n) => {
            const on = col.max_rating === n;
            return (
              <button key={n} type="button" onClick={() => onChange({ max_rating: n })} style={{
                padding: "3px 11px", borderRadius: "var(--r-pill)", font: "600 12px/1 var(--font-sans)",
                cursor: "pointer", border: "1px solid",
                background: on ? "var(--warning)" : "transparent",
                color: on ? "#fff" : "var(--text-soft)",
                borderColor: on ? "var(--warning)" : "var(--border)",
              }}>★ {n}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

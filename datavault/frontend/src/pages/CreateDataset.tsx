import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { createDataset, createColumn } from "../api/datasets";
import client from "../api/client";
import type { ColumnDefinition } from "../types";
import ImportExcelModal from "../components/ImportExcelModal";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { IcUpload } from "../components/ui/icons";
import AppShell from "../components/chrome/AppShell";

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

const DATA_TYPES: { value: ColumnDefinition["data_type"]; label: string; icon: string; group: string }[] = [
  { value: "text",        label: "Texto",       icon: "Aa", group: "Texto"     },
  { value: "long_text",   label: "Texto largo",  icon: "¶",  group: "Texto"     },
  { value: "url",         label: "Enlace",       icon: "⎋",  group: "Texto"     },
  { value: "email",       label: "Email",        icon: "",  group: "Texto"     },
  { value: "phone",       label: "Teléfono",     icon: "",  group: "Texto"     },
  { value: "number",      label: "Número",       icon: "#",  group: "Número"    },
  { value: "currency",    label: "Moneda",       icon: "$",  group: "Número"    },
  { value: "percent",     label: "Porcentaje",   icon: "%",  group: "Número"    },
  { value: "rating",      label: "Calificación", icon: "★",  group: "Número"    },
  { value: "enum",        label: "Lista",        icon: "≡",  group: "Selección" },
  { value: "multiselect", label: "Multi-lista",  icon: "☰",  group: "Selección" },
  { value: "boolean",     label: "Sí / No",      icon: "✓",  group: "Selección" },
  { value: "date",        label: "Fecha",        icon: "▦",  group: "Especial"  },
  { value: "relation",    label: "Relación",     icon: "⇢",  group: "Especial"  },
];

const TYPE_COLORS: Partial<Record<ColumnDefinition["data_type"], string>> = {
  text: "#64748B", long_text: "#475569", url: "#0891B2", email: "#0284C7", phone: "#0369A1",
  number: "#2563EB", currency: "#16A34A", percent: "#7C3AED", rating: "#D97706",
  enum: "#EA580C", multiselect: "#C2410C", boolean: "#059669",
  date: "#9333EA", relation: "#DB2777",
};

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
    id: "clientes", emoji: "", name: "Clientes",
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
    id: "productos", emoji: "", name: "Productos",
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
    id: "tareas", emoji: "", name: "Tareas",
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
    id: "inventario", emoji: "", name: "Inventario",
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
    id: "presupuesto", emoji: "", name: "Presupuesto mensual",
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
    id: "contactos", emoji: "", name: "Contactos",
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

  // ── Render: choose step ────────────────────────────────────────────────
  if (step === "choose") {
    return (
      <>
        <AppShell>
        <header className="app-header" style={{ display: "none" }}>
          <button className="btn btn-ghost" onClick={() => navigate("/")} style={{ padding: "5px 8px", fontSize: 18 }}>←</button>
          <button className="app-brand-btn" onClick={() => navigate("/")}>
            <div className="app-header-logo" style={{ width: 28, height: 28, fontSize: 13, borderRadius: "var(--radius-xs)" }}>T</div>
            <span className="app-header-name">Trans<em>Excel</em></span>
          </button>
          <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Nuevo dataset</span>
        </header>

        <main className="page" style={{ maxWidth: 920, overflowY: "auto", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <button className="btn btn-ghost" onClick={() => navigate("/")} style={{ padding: "5px 8px", fontSize: 18 }}>←</button>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Nuevo dataset</span>
          </div>
          {/* Import zone */}
          <div className="card"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{
              padding: "28px 32px",
              marginBottom: 20,
              border: dragOver ? "2px dashed var(--color-primary)" : "2px dashed var(--color-border)",
              background: dragOver ? "var(--color-primary-bg)" : undefined,
              textAlign: "center",
              transition: "background 0.12s",
            }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8, color: "var(--color-text-muted)" }}><IcUpload size={28} /></div>
            <h3 style={{ margin: "0 0 6px" }}>Importa desde Excel o CSV</h3>
            <p style={{ color: "var(--color-text-muted)", fontSize: 13, margin: "0 0 14px" }}>
              Arrastrá un archivo <strong>.xlsx</strong>, <strong>.xls</strong> o <strong>.csv</strong> acá,
              o usá el botón. Detectamos columnas y tipos de datos automáticamente.
            </p>
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
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
              Elegir archivo
            </button>
            {importStatus && (
              <p style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-secondary)" }}>{importStatus}</p>
            )}
          </div>

          {/* Templates */}
          <div className="card" style={{ padding: "20px 24px", marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 6px" }}>O empezá desde una plantilla</h3>
            <p style={{ color: "var(--color-text-muted)", fontSize: 13, margin: "0 0 14px" }}>
              Cada plantilla viene con columnas y tipos pre-configurados. Las podés ajustar después.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {TEMPLATES.map((t) => (
                <button key={t.id}
                  onClick={() => applyTemplate(t)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    border: "1.5px solid var(--color-border)",
                    borderRadius: 8,
                    background: "var(--color-surface)",
                    cursor: "pointer",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    transition: "border-color 0.12s, background 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{t.emoji}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: "block", fontSize: 14 }}>{t.name}</strong>
                    <span style={{ fontSize: 11.5, color: "var(--color-text-muted)", display: "block", marginTop: 2 }}>{t.description}</span>
                    <span style={{ fontSize: 10, color: "var(--color-text-muted)", display: "block", marginTop: 4 }}>
                      {t.columns.length} columnas
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* From scratch */}
          <div style={{ textAlign: "center" }}>
            <button className="btn btn-ghost" onClick={() => setStep("form")}>
              o empezá desde cero →
            </button>
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

  // ── Render: form step (original UI) ────────────────────────────────────
  return (
    <>
      <AppShell>
      <header className="app-header" style={{ display: "none" }}>
        <button className="btn btn-ghost" onClick={() => navigate("/")} style={{ padding: "5px 8px", fontSize: 18 }}>←</button>
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo" style={{ width: 28, height: 28, fontSize: 13, borderRadius: "var(--radius-xs)" }}><img src="/opsgrid-logo.svg" alt="OpsGrid" style={{ width: "100%", height: "100%" }} /></div>
          <span className="app-header-name">Ops<em>Grid</em></span>
        </button>
        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Nuevo dataset</span>
        {linkedName && (
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--color-primary-bg)", color: "var(--pm-green-600)", fontWeight: 600, border: "1px solid var(--color-primary-border)", marginLeft: 6 }}>
            Relacionado con {linkedName}
          </span>
        )}
        {appliedTemplate && (
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--color-primary-bg)", color: "var(--color-primary)", fontWeight: 600, border: "1px solid var(--color-primary-border)", marginLeft: 6 }}>
            Plantilla: {TEMPLATES.find((t) => t.id === appliedTemplate)?.name}
          </span>
        )}
        {importedRows.length > 0 && (
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "#FEF3C7", color: "#92400E", fontWeight: 600, border: "1px solid #FDE68A", marginLeft: 6 }}>
            {importedRows.length} filas listas para importar
          </span>
        )}
        {!linkedName && (
          <button className="btn btn-ghost" onClick={() => setStep("choose")} style={{ marginLeft: "auto", fontSize: 12 }}>
            ← Cambiar plantilla
          </button>
        )}
      </header>

      <main className="page" style={{ maxWidth: 820, overflowY: "auto", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={() => navigate("/")} style={{ padding: "5px 8px", fontSize: 18 }}>←</button>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Nuevo dataset</span>
          {linkedName && (
            <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--color-primary-bg)", color: "var(--pm-green-600)", fontWeight: 600, border: "1px solid var(--color-primary-border)" }}>
              Relacionado con {linkedName}
            </span>
          )}
          {appliedTemplate && (
            <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--color-primary-bg)", color: "var(--color-primary)", fontWeight: 600, border: "1px solid var(--color-primary-border)" }}>
              Plantilla: {TEMPLATES.find((t) => t.id === appliedTemplate)?.name}
            </span>
          )}
          {importedRows.length > 0 && (
            <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "#FEF3C7", color: "#92400E", fontWeight: 600, border: "1px solid #FDE68A" }}>
              {importedRows.length} filas listas para importar
            </span>
          )}
          {!linkedName && (
            <button className="btn btn-ghost" onClick={() => setStep("choose")} style={{ marginLeft: "auto", fontSize: 12 }}>
              ← Cambiar plantilla
            </button>
          )}
        </div>
        <div className="card" style={{ padding: "28px 32px" }}>
          <h2 style={{ marginBottom: 20 }}>Crear dataset</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 20px" }}>
            <div className="form-group">
              <label className="form-label">Nombre <span style={{ color: "var(--pm-red-500)" }}>*</span></label>
              <input placeholder="Ej. Clientes 2025" value={dsName} autoFocus
                onChange={(e) => { setDsName(e.target.value); setNameError(""); }}
                style={nameError ? { borderColor: "var(--pm-red-500)" } : undefined} />
              {nameError && <span style={{ fontSize: 12, color: "var(--pm-red-500)" }}>{nameError}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Descripción</label>
              <input placeholder="Opcional" value={dsDesc} onChange={(e) => setDsDesc(e.target.value)} />
            </div>
          </div>

          <div style={{ height: 1, background: "var(--color-border-light)", margin: "20px 0" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p className="section-title" style={{ margin: 0 }}>Columnas</p>
            <button className="btn btn-secondary" onClick={() => setCols((p) => [...p, newCol()])} style={{ fontSize: 12, padding: "4px 12px" }}>
              + Agregar columna
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {cols.map((col) => (
              <ColRow key={col.uid} col={col} linkedName={linkedName}
                onChange={(patch) => updateCol(col.uid, patch)}
                onRemove={() => setCols((p) => p.filter((c) => c.uid !== col.uid))} />
            ))}
          </div>

          {cols.length === 0 && (
            <p style={{ color: "var(--color-text-muted)", fontSize: 13, textAlign: "center", padding: "16px 0" }}>
              Sin columnas — puedes agregar más tarde desde el dataset.
            </p>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--color-border-light)" }}>
            <button className="btn btn-secondary" onClick={() => navigate("/")}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !dsName.trim()}>
              {saving ? "Creando..." : (() => {
                const n = cols.filter(c => c.name).length;
                const colsPart = n > 0 ? ` con ${n} columna${n !== 1 ? "s" : ""}` : "";
                const rowsPart = importedRows.length > 0 ? ` + ${importedRows.length} fila${importedRows.length !== 1 ? "s" : ""}` : "";
                return `Crear dataset${colsPart}${rowsPart}`;
              })()}
            </button>
          </div>
        </div>
      </main>
      </AppShell>
    </>
  );
}

function ColRow({ col, linkedName, onChange, onRemove }: {
  col: ColDraft; linkedName: string;
  onChange: (p: Partial<ColDraft>) => void;
  onRemove: () => void;
}) {
  const color = TYPE_COLORS[col.data_type] ?? "#64748B";

  if (col.locked) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 130px 64px 32px", gap: 8, alignItems: "start",
        background: "var(--color-primary-bg)", borderRadius: 8, padding: "8px 10px",
        margin: "0 -10px", border: "1px solid var(--color-primary-border)" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "var(--pm-green-600)" }}>{col.name}</p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>Clave foránea — apunta a {linkedName}</p>
        </div>
        <code style={{ fontSize: 12, padding: "5px 0", display: "block", color: "var(--color-text-secondary)" }}>{col.field_key}</code>
        <span style={{ fontSize: 12, padding: "5px 0", color: "var(--color-text-muted)" }}>Texto</span>
        <span style={{ fontSize: 12, padding: "5px 0", color: "var(--pm-green-600)", textAlign: "center" }}>✓</span>
        <span />
      </div>
    );
  }

  return (
    <div style={{ border: "1.5px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 130px 64px 32px", gap: 8, alignItems: "start", padding: "8px 10px" }}>
        <input placeholder="Nombre de columna" value={col.name}
          onChange={(e) => onChange({ name: e.target.value })} />
        <input className="mono" placeholder="field_key" value={col.field_key}
          onChange={(e) => onChange({ field_key: slugify(e.target.value) })} />

        {/* Type selector */}
        <div style={{ position: "relative" }}>
          <select value={col.data_type} onChange={(e) => onChange({ data_type: e.target.value as ColumnDefinition["data_type"] })}
            style={{ paddingLeft: 28, borderColor: color, color }}>
            {DATA_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </select>
        </div>

        {/* Required checkbox */}
        {col.data_type !== "relation" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 7 }}>
            <label className="checkbox-row" style={{ gap: 4 }}>
              <input type="checkbox" checked={col.required} onChange={(e) => onChange({ required: e.target.checked })} />
              <span style={{ fontSize: 12 }}>Sí</span>
            </label>
          </div>
        )}

        <button className="btn btn-danger-ghost" onClick={onRemove}
          style={{ padding: "4px 6px", marginTop: 2 }} title="Quitar columna">×</button>
      </div>

      {/* Type-specific extras */}
      {(col.data_type === "enum" || col.data_type === "multiselect") && (
        <div style={{ padding: "0 10px 8px", borderTop: "1px solid var(--color-border-light)" }}>
          <input placeholder="Opciones separadas por coma: Activo, Inactivo, Pendiente"
            value={col.options} onChange={(e) => onChange({ options: e.target.value })}
            style={{ fontSize: 13, background: "var(--color-bg)" }} />
        </div>
      )}
      {col.data_type === "currency" && (
        <div style={{ padding: "0 10px 8px", borderTop: "1px solid var(--color-border-light)", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>Símbolo:</span>
          <input value={col.currency_symbol} onChange={(e) => onChange({ currency_symbol: e.target.value })}
            placeholder="$" maxLength={5} style={{ width: 60, fontSize: 13 }} />
        </div>
      )}
      {col.data_type === "rating" && (
        <div style={{ padding: "0 10px 8px", borderTop: "1px solid var(--color-border-light)", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>Escala:</span>
          {[3, 5, 10].map((n) => (
            <button key={n} type="button" onClick={() => onChange({ max_rating: n })}
              style={{ padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid",
                background: col.max_rating === n ? "#D97706" : "transparent",
                color: col.max_rating === n ? "#fff" : "var(--color-text-secondary)",
                borderColor: col.max_rating === n ? "#D97706" : "var(--color-border)" }}>
              ★ {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useRef } from "react";
import type { CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Plus, Table2, Link2, Hash, CircleDollarSign, Percent,
  Calendar, ChevronDown, ChevronRight, FileText, Type, ToggleLeft, Mail, Phone, Link, Star, Check,
} from "lucide-react";
import { getDatasets, getColumns, getRecords, createRecord, deleteRecord } from "../api/datasets";
import type { ColumnDefinition, Record as DRecord } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";
import AppShell from "../components/chrome/AppShell";
import { Badge, Btn } from "../components/ui/kit";

// ─── Type metadata (icon + label for the field "ty" badge) ─────────────────────
const TYPE_META: Record<
  ColumnDefinition["data_type"],
  { Icon: typeof Hash; label: string }
> = {
  text:        { Icon: Type,             label: "texto" },
  long_text:   { Icon: FileText,         label: "texto largo" },
  number:      { Icon: Hash,             label: "número" },
  currency:    { Icon: CircleDollarSign, label: "moneda" },
  percent:     { Icon: Percent,          label: "porcentaje" },
  rating:      { Icon: Star,             label: "calificación" },
  date:        { Icon: Calendar,         label: "fecha" },
  enum:        { Icon: ChevronDown,      label: "lista" },
  multiselect: { Icon: ChevronDown,      label: "multi-lista" },
  boolean:     { Icon: ToggleLeft,       label: "sí / no" },
  email:       { Icon: Mail,             label: "email" },
  phone:       { Icon: Phone,            label: "teléfono" },
  url:         { Icon: Link,             label: "enlace" },
  relation:    { Icon: Link2,            label: "relación" },
};

// ─── Shared inline styles (token-driven, fiel al prototipo) ────────────────────
const inputStyle: CSSProperties = {
  width: "100%", height: 38, padding: "0 11px", boxSizing: "border-box",
  borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)",
  font: "400 13.5px/1 var(--font-sans)", color: "var(--text)", outline: "none",
  transition: "border-color var(--t-fast), box-shadow var(--t-fast)",
};
const textareaStyle: CSSProperties = {
  ...inputStyle, height: "auto", minHeight: 72, padding: "9px 11px",
  resize: "vertical", lineHeight: 1.45,
};
const labelStyle: CSSProperties = {
  display: "block", font: "500 12.5px/1 var(--font-sans)", color: "var(--text-soft)", marginBottom: 6,
};
const errorRing: CSSProperties = {
  borderColor: "var(--danger)", boxShadow: "0 0 0 3px var(--danger-soft)",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChildDataset {
  datasetId: string;
  datasetName: string;
  fkCol: string;
  columns: ColumnDefinition[];
  grandchildren: GrandchildDataset[];
}

interface GrandchildDataset {
  datasetId: string;
  datasetName: string;
  fkCol: string;
  columns: ColumnDefinition[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RecordForm() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { current: workspace } = useWorkspace();
  const wsId = workspace?.id;

  // ── Base data ────────────────────────────────────────────────────────────
  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", wsId],
    queryFn: () => getDatasets(wsId ? { workspace_id: wsId } : undefined),
  });
  const { data: columns = [], isLoading } = useQuery({
    queryKey: ["columns", datasetId],
    queryFn: () => getColumns(datasetId!),
  });

  const dataset = datasets.find((d) => d.id === datasetId);

  // ── Parent form state ────────────────────────────────────────────────────
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors]     = useState<Record<string, string>>({});

  // ── Relation columns ─────────────────────────────────────────────────────
  const relationCols = columns.filter(
    (c) => c.data_type === "relation" && c.rules.related_dataset_id
  );

  // Pre-load existing records for FK dropdowns
  const relRecordQueries = useQueries({
    queries: relationCols.map((col) => ({
      queryKey: ["records", col.rules.related_dataset_id!, "fk-lookup"],
      queryFn: () => getRecords(col.rules.related_dataset_id!, { limit: 1000 }),
      staleTime: 60_000,
    })),
  });

  // Pre-load columns of related datasets (needed for inline "create new" forms)
  const relColsQueries = useQueries({
    queries: relationCols.map((col) => ({
      queryKey: ["columns", col.rules.related_dataset_id!],
      queryFn: () => getColumns(col.rules.related_dataset_id!),
      staleTime: 5 * 60_000,
    })),
  });

  // Maps: related_dataset_id → records / columns
  const relRecordsMap: Record<string, DRecord[]> = {};
  const relColsMap: Record<string, ColumnDefinition[]> = {};
  relationCols.forEach((col, i) => {
    relRecordsMap[col.rules.related_dataset_id!] = relRecordQueries[i]?.data?.data ?? [];
    relColsMap[col.rules.related_dataset_id!]   = relColsQueries[i]?.data ?? [];
  });

  // ── "Create new" mode for FK fields ─────────────────────────────────────
  // relCreateMode[fieldKey] = true → showing inline create form instead of dropdown
  const [relCreateMode, setRelCreateMode] = useState<Record<string, boolean>>({});
  // relCreateData[fieldKey][subFieldKey] = value for the new inline record
  const [relCreateData, setRelCreateData] = useState<Record<string, Record<string, string>>>({});
  // Validation errors per FK inline-create form (fieldKey → list of error strings)
  const [relCreateErrors, setRelCreateErrors] = useState<Record<string, string[]>>({});
  // Tracks pre-created FK records so we can roll them back if parent creation fails
  const createdFKRefsRef = useRef<{ dsId: string; id: string }[]>([]);

  const toggleRelCreate = (fieldKey: string) => {
    setRelCreateMode((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
    setRelCreateData((prev) => ({ ...prev, [fieldKey]: {} }));
    setRelCreateErrors((prev) => { const n = { ...prev }; delete n[fieldKey]; return n; });
    setFormData((prev) => ({ ...prev, [fieldKey]: "" }));
  };

  const setRelCreateValue = (fkFieldKey: string, subKey: string, val: string) =>
    setRelCreateData((prev) => ({
      ...prev,
      [fkFieldKey]: { ...(prev[fkFieldKey] ?? {}), [subKey]: val },
    }));

  // ── Detect child datasets (other datasets with relation col → this dataset) ──
  const allOtherDatasetIds = datasets
    .filter((d) => d.id !== datasetId && !d.is_computed)
    .map((d) => d.id);

  const allColumnQueries = useQueries({
    queries: allOtherDatasetIds.map((dsId) => ({
      queryKey: ["columns", dsId],
      queryFn: () => getColumns(dsId),
      staleTime: 5 * 60_000,
    })),
  });

  const childDatasets: ChildDataset[] = [];
  allOtherDatasetIds.forEach((dsId, idx) => {
    const cols = allColumnQueries[idx]?.data ?? [];
    const fkCol = cols.find(
      (c) => c.data_type === "relation" && c.rules.related_dataset_id === datasetId
    );
    if (!fkCol) return;

    const childName = datasets.find((d) => d.id === dsId)?.name ?? dsId;
    const nonFkCols = cols.filter((c) => c.id !== fkCol.id);

    const grandchildren: GrandchildDataset[] = [];
    allOtherDatasetIds.forEach((gcId, gcIdx) => {
      if (gcId === dsId) return;
      const gcCols = allColumnQueries[gcIdx]?.data ?? [];
      const gcFkCol = gcCols.find(
        (c) => c.data_type === "relation" && c.rules.related_dataset_id === dsId
      );
      if (!gcFkCol) return;
      grandchildren.push({
        datasetId: gcId,
        datasetName: datasets.find((d) => d.id === gcId)?.name ?? gcId,
        fkCol: gcFkCol.field_key,
        columns: gcCols.filter((c) => c.id !== gcFkCol.id),
      });
    });

    childDatasets.push({ datasetId: dsId, datasetName: childName, fkCol: fkCol.field_key, columns: nonFkCols, grandchildren });
  });

  // ── Child form state ─────────────────────────────────────────────────────
  const [childData, setChildData] = useState<Record<string, Record<string, string>>>({});
  const [childOpen, setChildOpen] = useState<Record<string, boolean>>({});
  const [gcData, setGcData]       = useState<Record<string, Record<string, string>>>({});
  const [gcOpen, setGcOpen]       = useState<Record<string, boolean>>({});

  const setChildValue = (dsId: string, key: string, val: string) =>
    setChildData((prev) => ({ ...prev, [dsId]: { ...(prev[dsId] ?? {}), [key]: val } }));
  const setGcValue = (gcId: string, key: string, val: string) =>
    setGcData((prev) => ({ ...prev, [gcId]: { ...(prev[gcId] ?? {}), [key]: val } }));

  // ── Helper: extract human-readable errors from an axios 422 response ──────
  const extractApiErrors = (err: unknown): string[] => {
    const res = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    if (Array.isArray(res)) return res.map(String);
    if (typeof res === "string") return [res];
    return ["Error al guardar. Verifica los datos e intenta de nuevo."];
  };

  // ── Helper: validate inline-create payload against column rules ────────────
  const validateInlinePayload = (dsId: string, inlineData: Record<string, string>): string[] => {
    const errors: string[] = [];
    (relColsMap[dsId] ?? []).forEach((rc) => {
      const raw = inlineData[rc.field_key] ?? "";
      if (raw === "") return;
      if (rc.data_type === "number") {
        const num = Number(raw);
        if (isNaN(num)) { errors.push(`${rc.name}: debe ser un número`); return; }
        if (rc.rules.min !== undefined && num < rc.rules.min)
          errors.push(`${rc.name}: debe ser ≥ ${rc.rules.min}`);
        if (rc.rules.max !== undefined && num > rc.rules.max)
          errors.push(`${rc.name}: debe ser ≤ ${rc.rules.max}`);
      }
      if (rc.data_type === "enum") {
        const opts = rc.rules.options ?? [];
        if (!opts.includes(raw)) errors.push(`${rc.name}: valor no válido`);
      }
    });
    return errors;
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const [saveError, setSaveError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      setSaveError(null);

      // Validate parent required fields (skip relation fields in create-mode — they'll get IDs)
      const newErrors: Record<string, string> = {};
      columns.forEach((col) => {
        if (col.rules.required) {
          const inCreateMode = col.data_type === "relation" && relCreateMode[col.field_key];
          if (!inCreateMode && !formData[col.field_key]?.trim()) {
            newErrors[col.field_key] = "Este campo es requerido";
          }
        }
      });
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        throw new Error("validation");
      }

      // Validate inline create forms before hitting the API
      const inlineErrs: Record<string, string[]> = {};
      for (const col of relationCols) {
        if (!relCreateMode[col.field_key]) continue;
        const errs = validateInlinePayload(
          col.rules.related_dataset_id!,
          relCreateData[col.field_key] ?? {}
        );
        if (errs.length > 0) inlineErrs[col.field_key] = errs;
      }
      if (Object.keys(inlineErrs).length > 0) {
        setRelCreateErrors(inlineErrs);
        throw new Error("validation");
      }
      setRelCreateErrors({});

      // Step 1: Pre-create inline "new" related records and collect their IDs
      const resolvedFKs: Record<string, string> = {};
      createdFKRefsRef.current = [];
      for (const col of relationCols) {
        if (!relCreateMode[col.field_key]) continue;
        const inlineData = relCreateData[col.field_key] ?? {};
        const payload: Record<string, unknown> = {};
        (relColsMap[col.rules.related_dataset_id!] ?? []).forEach((rc) => {
          const raw = inlineData[rc.field_key] ?? "";
          if (raw !== "") payload[rc.field_key] = rc.data_type === "number" ? Number(raw) : raw;
        });
        const newRec = await createRecord(col.rules.related_dataset_id!, payload);
        createdFKRefsRef.current.push({ dsId: col.rules.related_dataset_id!, id: newRec.id });
        resolvedFKs[col.field_key] = newRec.id;
        qc.invalidateQueries({ queryKey: ["records", col.rules.related_dataset_id!, "fk-lookup"] });
      }

      // Steps 2 & 3: wrapped in try/catch to roll back Step-1 records on failure
      try {
        // Step 2: Build and create parent record
        const parentPayload: Record<string, unknown> = {};
        columns.forEach((col) => {
          const raw = resolvedFKs[col.field_key] ?? formData[col.field_key] ?? "";
          if (raw === "") return;
          parentPayload[col.field_key] = col.data_type === "number" ? Number(raw) : raw;
        });
        const parent = await createRecord(datasetId!, parentPayload);

        // Step 3: Create active child records
        for (const child of childDatasets) {
          if (!childOpen[child.datasetId]) continue;
          const cData = childData[child.datasetId] ?? {};
          const childPayload: Record<string, unknown> = { [child.fkCol]: parent.id };
          child.columns.forEach((col) => {
            const raw = cData[col.field_key] ?? "";
            if (raw === "") return;
            childPayload[col.field_key] = col.data_type === "number" ? Number(raw) : raw;
          });
          const childRec = await createRecord(child.datasetId, childPayload);

          for (const gc of child.grandchildren) {
            if (!gcOpen[gc.datasetId]) continue;
            const gcPayloadData = gcData[gc.datasetId] ?? {};
            const gcPayload: Record<string, unknown> = { [gc.fkCol]: childRec.id };
            gc.columns.forEach((col) => {
              const raw = gcPayloadData[col.field_key] ?? "";
              if (raw === "") return;
              gcPayload[col.field_key] = col.data_type === "number" ? Number(raw) : raw;
            });
            await createRecord(gc.datasetId, gcPayload);
          }
        }

        return parent;
      } catch (err) {
        // Roll back any pre-created FK records to avoid orphans
        for (const { dsId, id } of createdFKRefsRef.current) {
          await deleteRecord(dsId, id).catch(() => {});
          qc.invalidateQueries({ queryKey: ["records", dsId, "fk-lookup"] });
        }
        createdFKRefsRef.current = [];
        setSaveError(extractApiErrors(err).join(" · "));
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records", datasetId] });
      childDatasets.forEach((c) => {
        if (childOpen[c.datasetId])
          qc.invalidateQueries({ queryKey: ["records", c.datasetId] });
      });
      navigate(`/datasets/${datasetId}`);
    },
  });

  const setValue = (fieldKey: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldKey]: value }));
    if (errors[fieldKey]) setErrors((prev) => ({ ...prev, [fieldKey]: "" }));
  };

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderRelationField = (
    col: ColumnDefinition,
    value: string,
    onChange: (v: string) => void,
    hasError: boolean,
    // If true, this is inside a child/grandchild form (no "create new" toggle)
    nested = false
  ) => {
    const baseStyle: CSSProperties = { ...inputStyle, ...(hasError ? errorRing : {}) };

    if (col.data_type !== "relation") return null; // handled by inputFor below

    const relRecords = relRecordsMap[col.rules.related_dataset_id!] ?? [];
    const relCols    = relColsMap[col.rules.related_dataset_id!] ?? [];
    const df         = col.rules.display_field;
    const inCreateMode = !nested && !!relCreateMode[col.field_key];
    const relName = datasets.find((d) => d.id === col.rules.related_dataset_id)?.name ?? "tabla";

    return (
      <div>
        {/* Dropdown mode */}
        {!inCreateMode && (
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              style={{ ...baseStyle, flex: 1, cursor: "pointer", appearance: "auto" }}
            >
              <option value="">— Seleccionar —</option>
              {relRecords.map((r) => (
                <option key={r.id} value={r.id}>
                  {df && r.data[df] ? String(r.data[df]) : r.id}
                </option>
              ))}
            </select>
            {!nested && (
              <Btn
                variant="tint" tone="rel" size="md"
                icon={<Plus size={15} />}
                onClick={() => toggleRelCreate(col.field_key)}
                style={{ flex: "none" }}
              >
                Crear nuevo
              </Btn>
            )}
          </div>
        )}

        {/* Inline create mode */}
        {inCreateMode && (
          <div style={{
            padding: "13px 14px", borderRadius: "var(--r-2)", marginTop: 2,
            border: "1.5px dashed var(--accent-rel)", background: "var(--rel-soft)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 11 }}>
              <span style={{ font: "600 12px/1 var(--font-sans)", color: "var(--accent-rel)" }}>
                Nuevo registro en {relName}
              </span>
              <button
                type="button"
                onClick={() => toggleRelCreate(col.field_key)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5, border: "none",
                  background: "transparent", cursor: "pointer", color: "var(--text-soft)",
                  font: "600 11.5px/1 var(--font-sans)", padding: 0,
                }}
              >
                <ChevronLeft size={13} /> Seleccionar existente
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px 16px" }}>
              {relCols.map((rc) => (
                <div key={rc.id}>
                  <label style={{ ...labelStyle, fontSize: 11.5 }}>
                    {rc.name}
                    {rc.rules.required && <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>}
                    {rc.data_type === "number" && (rc.rules.min !== undefined || rc.rules.max !== undefined) && (
                      <span style={{ fontWeight: 400, color: "var(--text-mute)", marginLeft: 4 }}>
                        ({rc.rules.min ?? ""}–{rc.rules.max ?? ""})
                      </span>
                    )}
                  </label>
                  {renderInputByType(
                    rc,
                    relCreateData[col.field_key]?.[rc.field_key] ?? "",
                    (v) => setRelCreateValue(col.field_key, rc.field_key, v),
                    false,
                    true // nested — no create-new toggle in sub-forms
                  )}
                </div>
              ))}
            </div>
            {relCreateErrors[col.field_key]?.length > 0 && (
              <div style={{
                marginTop: 10, padding: "7px 11px", borderRadius: "var(--r-2)",
                background: "var(--danger-soft)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
              }}>
                {relCreateErrors[col.field_key].map((e, i) => (
                  <p key={i} style={{ margin: 0, font: "500 12px/1.5 var(--font-sans)", color: "var(--danger)" }}>{e}</p>
                ))}
              </div>
            )}
            <p style={{ margin: "9px 0 0", font: "400 11.5px/1.5 var(--font-sans)", color: "var(--text-mute)" }}>
              Este registro se creará automáticamente al guardar, y su ID quedará vinculado aquí.
            </p>
          </div>
        )}
      </div>
    );
  };

  // Generic input renderer for any column type
  const renderInputByType = (
    col: ColumnDefinition,
    value: string,
    onChange: (v: string) => void,
    hasError: boolean,
    nested = false
  ): React.ReactNode => {
    const baseStyle: CSSProperties = { ...inputStyle, ...(hasError ? errorRing : {}) };

    if (col.data_type === "relation") {
      return renderRelationField(col, value, onChange, hasError, nested);
    }
    if (col.data_type === "enum") {
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...baseStyle, cursor: "pointer", appearance: "auto" }}>
          <option value="">— Seleccionar —</option>
          {(col.rules.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    if (col.data_type === "boolean") {
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...baseStyle, cursor: "pointer", appearance: "auto" }}>
          <option value="">— Seleccionar —</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (col.data_type === "long_text") {
      return (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={col.rules.required ? "Requerido" : "Opcional"}
          style={{ ...textareaStyle, ...(hasError ? errorRing : {}) }}
        />
      );
    }
    const type = col.data_type === "number" ? "number" : col.data_type === "date" ? "date" : "text";
    return (
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={col.rules.required ? "Requerido" : "Opcional"}
        style={baseStyle}
        onKeyDown={(e) => e.key === "Enter" && !nested && createMut.mutate()}
        min={col.data_type === "number" && col.rules.min !== undefined ? col.rules.min : undefined}
        max={col.data_type === "number" && col.rules.max !== undefined ? col.rules.max : undefined}
      />
    );
  };

  const inputFor = (col: ColumnDefinition) =>
    renderInputByType(col, formData[col.field_key] ?? "", (v) => setValue(col.field_key, v), !!errors[col.field_key]);

  // Renders one column as a field (label + control), reusing inputFor() for the control.
  const renderField = (col: ColumnDefinition) => {
    const meta = TYPE_META[col.data_type];
    const TyIcon = meta.Icon;
    return (
      <div key={col.id} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ font: "500 12.5px/1 var(--font-sans)", color: "var(--text-soft)" }}>
            {col.name}
            {col.rules.required && <span style={{ color: "var(--danger)" }}> *</span>}
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            font: "500 11px/1 var(--font-sans)", color: "var(--text-mute)",
          }}>
            <TyIcon size={12} /> {meta.label}
          </span>
          {col.data_type === "number" && (col.rules.min !== undefined || col.rules.max !== undefined) && (
            <span style={{ font: "400 11px/1 var(--font-sans)", color: "var(--text-mute)" }}>
              Rango: {col.rules.min ?? "—"} a {col.rules.max ?? "—"}
            </span>
          )}
        </div>
        {inputFor(col)}
        {errors[col.field_key] && (
          <span style={{ display: "block", font: "500 12px/1 var(--font-sans)", color: "var(--danger)", marginTop: 5 }}>
            {errors[col.field_key]}
          </span>
        )}
      </div>
    );
  };

  const renderChildForm = (
    cols: ColumnDefinition[],
    data: Record<string, string>,
    onSet: (key: string, val: string) => void
  ) => (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "13px 16px",
      padding: 14, borderRadius: "var(--r-2)", background: "var(--surface-alt)",
    }}>
      {cols.map((col) => (
        <div key={col.id}>
          <label style={labelStyle}>
            {col.name}
            {col.rules.required && <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>}
            <span style={{ fontWeight: 400, color: "var(--text-mute)", marginLeft: 6 }}>
              {col.data_type}
            </span>
          </label>
          {renderInputByType(col, data[col.field_key] ?? "", (v) => onSet(col.field_key, v), false, true)}
        </div>
      ))}
    </div>
  );

  const dsName = dataset?.name ?? "Dataset";

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppShell active="home">
        <main className="form-main">
          <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 32px 110px" }}>
            <div style={{
              padding: 40, textAlign: "center", borderRadius: "var(--r-3)",
              border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-1)",
              font: "400 14px/1 var(--font-sans)", color: "var(--text-mute)",
            }}>
              Cargando campos…
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  const nativeCols     = columns.filter((c) => c.data_type !== "relation");
  const relationFields = columns.filter((c) => c.data_type === "relation");

  // ── Section card wrapper (fiel al prototipo "Sec") ─────────────────────────
  const SectionCard = ({
    Icon, color, title, count, children,
  }: {
    Icon: typeof Hash; color: string; title: string; count: string; children: React.ReactNode;
  }) => (
    <section style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
      padding: 18, boxShadow: "var(--shadow-1)", marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Icon size={17} color={color} />
        <span style={{ font: "600 14px/1 var(--font-sans)", color: "var(--text)" }}>{title}</span>
        <span style={{ font: "400 12px/1 var(--font-sans)", color: "var(--text-mute)" }}>· {count}</span>
      </div>
      {children}
    </section>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AppShell active="home">
      <main className="form-main">
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 32px 110px" }}>

          <button
            onClick={() => navigate(`/datasets/${datasetId}`)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, border: "none",
              background: "transparent", cursor: "pointer", color: "var(--text-soft)",
              font: "500 13px/1 var(--font-sans)", padding: 0, marginBottom: 14,
            }}
          >
            <ChevronLeft size={16} /> Volver a {dsName}
          </button>

          <h1 style={{ margin: "0 0 22px", font: "700 24px/1.1 var(--font-sans)", letterSpacing: "-.02em", color: "var(--text)" }}>
            Nuevo registro · {dsName}
          </h1>

          {/* ── Campos nativos ─────────────────────────────────────────── */}
          {nativeCols.length > 0 && (
            <SectionCard
              Icon={Table2} color="var(--accent-pri)" title={dsName}
              count={`${nativeCols.length} ${nativeCols.length === 1 ? "campo" : "campos"} · propios de esta tabla`}
            >
              {nativeCols.map(renderField)}
            </SectionCard>
          )}

          {/* ── Relaciones ─────────────────────────────────────────────── */}
          {relationFields.length > 0 && (
            <SectionCard
              Icon={Link2} color="var(--accent-rel)" title="Relaciones"
              count={`${relationFields.length} ${relationFields.length === 1 ? "campo" : "campos"} · apuntan a otras tablas`}
            >
              {relationFields.map(renderField)}
            </SectionCard>
          )}

          {saveError && (
            <p style={{
              margin: "0 0 16px", padding: "9px 13px", borderRadius: "var(--r-2)",
              background: "var(--danger-soft)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
              font: "500 13px/1.5 var(--font-sans)", color: "var(--danger)",
            }}>
              {saveError}
            </p>
          )}

          {/* ── Child dataset sections ───────────────────────────────────── */}
          {childDatasets.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", margin: "4px 4px 12px" }}>
                Puedes crear registros vinculados en estas tablas al mismo tiempo (la FK se asigna sola):
              </div>

              {childDatasets.map((child) => {
                const isOpen = !!childOpen[child.datasetId];
                return (
                  <div key={child.datasetId} style={{
                    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
                    boxShadow: "var(--shadow-1)", overflow: "hidden", marginBottom: 12,
                  }}>
                    <button
                      type="button"
                      onClick={() => setChildOpen((prev) => ({ ...prev, [child.datasetId]: !isOpen }))}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, width: "100%",
                        padding: "14px 18px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
                      }}
                    >
                      {isOpen
                        ? <ChevronDown size={16} color="var(--text-mute)" />
                        : <ChevronRight size={16} color="var(--text-mute)" />}
                      <Link2 size={16} color="var(--accent-rel)" />
                      <span style={{ font: "600 14px/1 var(--font-sans)", color: "var(--text)" }}>{child.datasetName}</span>
                      <div style={{ flex: 1 }} />
                      {isOpen
                        ? <Badge tone="success">Se creará</Badge>
                        : <Badge tone="neutral">Omitir</Badge>}
                    </button>

                    {isOpen && (
                      <div style={{ padding: "0 18px 18px" }}>
                        {renderChildForm(child.columns, childData[child.datasetId] ?? {}, (key, val) => setChildValue(child.datasetId, key, val))}

                        {child.grandchildren.length > 0 && (
                          <div style={{ marginTop: 16 }}>
                            <div style={{
                              font: "600 11.5px/1 var(--font-sans)", color: "var(--text-mute)", marginBottom: 10,
                              textTransform: "uppercase", letterSpacing: "0.05em",
                            }}>
                              Sub-tablas de {child.datasetName}
                            </div>
                            {child.grandchildren.map((gc) => {
                              const gcIsOpen = !!gcOpen[gc.datasetId];
                              return (
                                <div key={gc.datasetId} style={{
                                  border: "1px solid var(--border)", borderRadius: "var(--r-2)",
                                  marginBottom: 8, overflow: "hidden", background: "var(--surface)",
                                }}>
                                  <button
                                    type="button"
                                    onClick={() => setGcOpen((prev) => ({ ...prev, [gc.datasetId]: !gcIsOpen }))}
                                    style={{
                                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                                      padding: "10px 16px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
                                    }}
                                  >
                                    {gcIsOpen
                                      ? <ChevronDown size={14} color="var(--text-mute)" />
                                      : <ChevronRight size={14} color="var(--text-mute)" />}
                                    <span style={{ font: "600 13px/1 var(--font-sans)", color: "var(--text)" }}>{gc.datasetName}</span>
                                    <div style={{ flex: 1 }} />
                                    {gcIsOpen
                                      ? <Badge tone="success">Se creará</Badge>
                                      : <Badge tone="neutral">Omitir</Badge>}
                                  </button>
                                  {gcIsOpen && (
                                    <div style={{ padding: "0 16px 16px" }}>
                                      {renderChildForm(gc.columns, gcData[gc.datasetId] ?? {}, (key, val) => setGcValue(gc.datasetId, key, val))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Sticky footer ───────────────────────────────────────────── */}
          <div style={{
            position: "sticky", bottom: 0, marginTop: 8, display: "flex", alignItems: "center", gap: 12,
            padding: "14px 18px", borderRadius: "var(--r-3)", background: "var(--surface)",
            border: "1px solid var(--border)", boxShadow: "var(--shadow-3)",
          }}>
            <span style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)" }}>
              Guardando en <strong style={{ color: "var(--text)" }}>{dsName}</strong> · cambios sin guardar
            </span>
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={() => navigate(`/datasets/${datasetId}`)}>Cancelar</Btn>
            <Btn
              variant="primary"
              icon={<Check size={16} />}
              disabled={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "Guardando…" : "Guardar registro"}
            </Btn>
          </div>

        </div>
      </main>
    </AppShell>
  );
}

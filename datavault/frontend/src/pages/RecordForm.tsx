import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Circle, Link2, Hash, CircleDollarSign, Percent,
  Calendar, ChevronDown, FileText, Type, ToggleLeft, Mail, Phone, Link, Star, Check,
} from "lucide-react";
import { getDatasets, getColumns, getRecords, createRecord, deleteRecord } from "../api/datasets";
import type { ColumnDefinition, Record as DRecord } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";
import AppShell from "../components/chrome/AppShell";

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
    const baseStyle: React.CSSProperties = hasError
      ? { borderColor: "var(--pm-red-500)", boxShadow: "0 0 0 3px rgba(229,62,62,.1)" }
      : {};

    if (col.data_type !== "relation") return null; // handled by inputFor below

    const relRecords = relRecordsMap[col.rules.related_dataset_id!] ?? [];
    const relCols    = relColsMap[col.rules.related_dataset_id!] ?? [];
    const df         = col.rules.display_field;
    const inCreateMode = !nested && !!relCreateMode[col.field_key];

    return (
      <div>
        {/* Toggle button */}
        {!nested && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => toggleRelCreate(col.field_key)}
              style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 99, cursor: "pointer",
                background: inCreateMode ? "#DB277718" : "var(--color-bg-secondary)",
                border: `1px solid ${inCreateMode ? "#DB2777" : "var(--color-border)"}`,
                color: inCreateMode ? "#DB2777" : "var(--color-text-muted)",
                fontWeight: 600,
              }}
            >
              {inCreateMode ? "← Seleccionar existente" : "+ Crear nuevo"}
            </button>
          </div>
        )}

        {/* Dropdown mode */}
        {!inCreateMode && (
          <select className="input" value={value} onChange={(e) => onChange(e.target.value)} style={baseStyle}>
            <option value="">— Seleccionar —</option>
            {relRecords.map((r) => (
              <option key={r.id} value={r.id}>
                {df && r.data[df] ? String(r.data[df]) : r.id}
              </option>
            ))}
          </select>
        )}

        {/* Inline create mode */}
        {inCreateMode && (
          <div style={{
            padding: "12px 14px", borderRadius: 8, marginTop: 2,
            border: "1.5px dashed #DB2777",
            background: "#DB277708",
          }}>
            <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "#DB2777", fontWeight: 600 }}>
              Nuevo registro en {datasets.find((d) => d.id === col.rules.related_dataset_id)?.name}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0 16px" }}>
              {relCols.map((rc) => (
                <div key={rc.id} className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>
                    {rc.name}
                    {rc.rules.required && <span style={{ color: "var(--pm-red-500)", marginLeft: 2 }}>*</span>}
                    {rc.data_type === "number" && (rc.rules.min !== undefined || rc.rules.max !== undefined) && (
                      <span style={{ fontWeight: 400, color: "var(--color-text-muted)", marginLeft: 4 }}>
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
              <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "var(--pm-red-50, #fef2f2)", border: "1px solid var(--pm-red-200, #fecaca)" }}>
                {relCreateErrors[col.field_key].map((e, i) => (
                  <p key={i} style={{ margin: 0, fontSize: 12, color: "var(--pm-red-500)" }}>{e}</p>
                ))}
              </div>
            )}
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>
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
    const baseStyle: React.CSSProperties = hasError
      ? { borderColor: "var(--pm-red-500)", boxShadow: "0 0 0 3px rgba(229,62,62,.1)" }
      : {};

    if (col.data_type === "relation") {
      return renderRelationField(col, value, onChange, hasError, nested);
    }
    if (col.data_type === "enum") {
      return (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)} style={baseStyle}>
          <option value="">— Seleccionar —</option>
          {(col.rules.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    if (col.data_type === "boolean") {
      return (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)} style={baseStyle}>
          <option value="">— Seleccionar —</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (col.data_type === "long_text") {
      return (
        <textarea
          className="input"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={col.rules.required ? "Requerido" : "Opcional"}
          style={baseStyle}
        />
      );
    }
    const type = col.data_type === "number" ? "number" : col.data_type === "date" ? "date" : "text";
    return (
      <input
        className="input"
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

  // Renders one column as a `.form-field` row (label column + control column),
  // reusing inputFor() for the actual control markup.
  const renderField = (col: ColumnDefinition) => {
    const meta = TYPE_META[col.data_type];
    const TyIcon = meta.Icon;
    return (
      <div key={col.id} className="form-field">
        <div className="form-field__lbl">
          <span className="name">
            {col.name}
            {col.rules.required && <span className="req"> *</span>}
          </span>
          <span className="ty"><TyIcon /> {meta.label}</span>
          {col.data_type === "number" && (col.rules.min !== undefined || col.rules.max !== undefined) && (
            <span className="help">
              Rango: {col.rules.min ?? "—"} a {col.rules.max ?? "—"}
            </span>
          )}
        </div>
        <div className="form-field__ctrl">
          {inputFor(col)}
          {errors[col.field_key] && (
            <span style={{ fontSize: 12, color: "var(--accent-rel)", marginTop: 4, display: "block" }}>
              {errors[col.field_key]}
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderChildForm = (
    cols: ColumnDefinition[],
    data: Record<string, string>,
    onSet: (key: string, val: string) => void
  ) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "0 24px" }}>
      {cols.map((col) => (
        <div key={col.id} className="form-group">
          <label className="form-label">
            {col.name}
            {col.rules.required && <span style={{ color: "var(--pm-red-500)", marginLeft: 2 }}>*</span>}
            <span style={{ fontWeight: 400, color: "var(--color-text-muted)", marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>
              {col.data_type}
            </span>
          </label>
          {renderInputByType(col, data[col.field_key] ?? "", (v) => onSet(col.field_key, v), false, true)}
        </div>
      ))}
    </div>
  );

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppShell>
        <main className="form-main">
          <div className="form-shell" style={{ padding: 40, color: "var(--text-mute)", textAlign: "center" }}>
            Cargando campos…
          </div>
        </main>
      </AppShell>
    );
  }

  const nativeCols   = columns.filter((c) => c.data_type !== "relation");
  const relationFields = columns.filter((c) => c.data_type === "relation");
  const dsName = dataset?.name ?? "Dataset";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <main className="form-main">
        <div className="form-shell">

          <a
            href={`/datasets/${datasetId}`}
            className="form-back"
            onClick={(e) => { e.preventDefault(); navigate(`/datasets/${datasetId}`); }}
          >
            <ArrowLeft /> Volver a {dsName}
          </a>

          <div className="form-head">
            <div>
              <h1>Nuevo registro · {dsName}</h1>
              <p className="form-head__sub">
                Crea una fila nueva en <b>{dsName}</b>. Los campos marcados con <span className="req">*</span> son obligatorios.
              </p>
            </div>
            <span className="form-head__pill"><Plus /> Nuevo</span>
          </div>

          {/* ── Campos nativos ─────────────────────────────────────────── */}
          {nativeCols.length > 0 && (
            <section className="form-section">
              <div className="form-section__head">
                <span className="form-section__label is-native">
                  <Circle /> {dsName} · {nativeCols.length} {nativeCols.length === 1 ? "campo" : "campos"}
                </span>
                <span className="form-section__count">propios de esta tabla</span>
              </div>
              {nativeCols.map(renderField)}
            </section>
          )}

          {/* ── Relaciones ─────────────────────────────────────────────── */}
          {relationFields.length > 0 && (
            <section className="form-section">
              <div className="form-section__head">
                <span className="form-section__label is-rel">
                  <Link2 /> Relaciones · {relationFields.length} {relationFields.length === 1 ? "campo" : "campos"}
                </span>
                <span className="form-section__count">apuntan a otras tablas</span>
              </div>
              {relationFields.map(renderField)}
            </section>
          )}

          {saveError && (
            <p style={{ marginTop: 16, color: "var(--accent-rel)", fontSize: 13, textAlign: "right" }}>
              {saveError}
            </p>
          )}

        {/* ── Child dataset sections ───────────────────────────────────── */}
        {childDatasets.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Tablas relacionadas (opcional)
            </p>
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16 }}>
              Puedes crear registros vinculados en estos datasets al mismo tiempo. La FK se asigna automáticamente.
            </p>

            {childDatasets.map((child) => {
              const isOpen = !!childOpen[child.datasetId];
              return (
                <div key={child.datasetId} className="card" style={{ marginBottom: 12, overflow: "hidden" }}>
                  <button type="button"
                    onClick={() => setChildOpen((prev) => ({ ...prev, [child.datasetId]: !isOpen }))}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "14px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ fontSize: 13, transform: isOpen ? "rotate(90deg)" : "none",
                      transition: "transform 0.15s", color: "var(--color-text-muted)", display: "inline-block", lineHeight: 1 }}>▶</span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{child.datasetName}</span>
                    <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10,
                      background: isOpen ? "var(--pm-violet-50)" : "var(--color-bg-secondary)",
                      color: isOpen ? "var(--pm-violet-600)" : "var(--color-text-muted)", marginLeft: "auto" }}>
                      {isOpen ? "Se creará" : "Omitir"}
                    </span>
                  </button>

                  {isOpen && (
                    <div style={{ padding: "0 20px 20px" }}>
                      {renderChildForm(child.columns, childData[child.datasetId] ?? {}, (key, val) => setChildValue(child.datasetId, key, val))}

                      {child.grandchildren.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <p style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginBottom: 10,
                            textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                            Sub-tablas de {child.datasetName}
                          </p>
                          {child.grandchildren.map((gc) => {
                            const gcIsOpen = !!gcOpen[gc.datasetId];
                            return (
                              <div key={gc.datasetId} style={{ border: "1px solid var(--color-border-light)", borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
                                <button type="button"
                                  onClick={() => setGcOpen((prev) => ({ ...prev, [gc.datasetId]: !gcIsOpen }))}
                                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8,
                                    padding: "10px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                                  <span style={{ fontSize: 11, transform: gcIsOpen ? "rotate(90deg)" : "none",
                                    transition: "transform 0.15s", color: "var(--color-text-muted)", display: "inline-block", lineHeight: 1 }}>▶</span>
                                  <span style={{ fontWeight: 600, fontSize: 13 }}>{gc.datasetName}</span>
                                  <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10,
                                    background: gcIsOpen ? "var(--pm-violet-50)" : "var(--color-bg-secondary)",
                                    color: gcIsOpen ? "var(--pm-violet-600)" : "var(--color-text-muted)", marginLeft: "auto" }}>
                                    {gcIsOpen ? "Se creará" : "Omitir"}
                                  </span>
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

          {/* ── Footer de acciones ───────────────────────────────────── */}
          <div className="form-foot">
            <div className="form-foot__meta">
              Guardando en <b>{dsName}</b> · cambios sin guardar
            </div>
            <div className="form-foot__actions">
              <button className="btn btn--secondary" onClick={() => navigate(`/datasets/${datasetId}`)}>
                Cancelar
              </button>
              <button className="btn btn--primary" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                <Check /> {createMut.isPending ? "Guardando…" : "Guardar registro"}
              </button>
            </div>
          </div>

        </div>
      </main>
    </AppShell>
  );
}

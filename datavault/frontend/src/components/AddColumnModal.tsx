import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";

interface Props {
  onSave: (col: Omit<ColumnDefinition, "id" | "dataset_id" | "created_at">) => void;
  onClose: () => void;
}

const TYPE_OPTIONS: { value: ColumnDefinition["data_type"]; label: string; icon: string; desc: string; color: string }[] = [
  { value: "text",     label: "Texto",     icon: "Aa", desc: "Nombres, descripciones",          color: "#64748B" },
  { value: "number",   label: "Número",    icon: "#",  desc: "Cantidades, importes",             color: "#2563EB" },
  { value: "date",     label: "Fecha",     icon: "▦",  desc: "Fechas y horarios",                color: "#7C3AED" },
  { value: "enum",     label: "Lista",     icon: "≡",  desc: "Opciones predefinidas",            color: "#D97706" },
  { value: "boolean",  label: "Booleano",  icon: "✓",  desc: "Sí / No, verdadero / falso",      color: "#059669" },
  { value: "relation", label: "Relación",  icon: "⇢",  desc: "Apunta a registros de otro dataset", color: "#DB2777" },
];

export default function AddColumnModal({ onSave, onClose }: Props) {
  const [name, setName]                       = useState("");
  const [fieldKey, setFieldKey]               = useState("");
  const [dataType, setDataType]               = useState<ColumnDefinition["data_type"]>("text");
  const [required, setRequired]               = useState(false);
  const [options, setOptions]                 = useState("");
  const [min, setMin]                         = useState("");
  const [max, setMax]                         = useState("");
  const [relatedDatasetId, setRelatedDatasetId] = useState("");
  const [displayField, setDisplayField]       = useState("");

  const { current: workspace } = useWorkspace();
  const wsId = workspace?.id;

  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", wsId],
    queryFn: () => getDatasets(wsId ? { workspace_id: wsId } : undefined),
    enabled: dataType === "relation",
  });

  const { data: relatedColumns = [] } = useQuery({
    queryKey: ["columns", relatedDatasetId],
    queryFn: () => getColumns(relatedDatasetId),
    enabled: dataType === "relation" && !!relatedDatasetId,
  });

  const handleNameChange = (v: string) => {
    setName(v);
    setFieldKey(v.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
  };

  const handleTypeChange = (t: ColumnDefinition["data_type"]) => {
    setDataType(t);
    setRelatedDatasetId("");
    setDisplayField("");
  };

  const handleSave = () => {
    const rules: ColumnDefinition["rules"] = {};
    if (required) rules.required = true;
    if (dataType === "enum" && options)
      rules.options = options.split(",").map((o) => o.trim()).filter(Boolean);
    if (dataType === "number") {
      if (min !== "") rules.min = Number(min);
      if (max !== "") rules.max = Number(max);
    }
    if (dataType === "relation") {
      rules.related_dataset_id = relatedDatasetId;
      if (displayField) rules.display_field = displayField;
    }
    onSave({ name, field_key: fieldKey, data_type: dataType, rules, position: 0 });
  };

  const selectedType = TYPE_OPTIONS.find((t) => t.value === dataType)!;
  const saveDisabled =
    !name || !fieldKey ||
    (dataType === "relation" && !relatedDatasetId);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-v2">
        {/* Accent bar */}
        <div className="modal-accent" style={{ background: selectedType.color }} />

        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="modal-header-icon" style={{ background: selectedType.color + "18", color: selectedType.color }}>
              {selectedType.icon}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Nueva columna</h3>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-text-muted)" }}>
                Define nombre, tipo y reglas de validación
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Cerrar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Name + field key */}
          <div className="form-group">
            <label className="form-label">Nombre visible</label>
            <input placeholder="Ej. Nombre del cliente" value={name}
              onChange={(e) => handleNameChange(e.target.value)} autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">
              Field key
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6, color: "var(--color-text-muted)" }}>
                — identificador interno
              </span>
            </label>
            <input className="mono" placeholder="campo_clave" value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)} />
          </div>

          {/* Type selector — visual cards */}
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Tipo de dato</label>
            <div className="type-selector">
              {TYPE_OPTIONS.map((t) => (
                <button key={t.value} type="button"
                  className={`type-option${dataType === t.value ? " active" : ""}`}
                  style={dataType === t.value ? {
                    borderColor: t.color,
                    background: t.color + "10",
                    "--type-color": t.color,
                  } as React.CSSProperties : {}}
                  onClick={() => handleTypeChange(t.value)}>
                  <span className="type-option-icon" style={{ color: dataType === t.value ? t.color : "var(--color-text-muted)" }}>
                    {t.icon}
                  </span>
                  <span className="type-option-label">{t.label}</span>
                  <span className="type-option-desc">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Relation config */}
          {dataType === "relation" && (
            <>
              <div className="form-group">
                <label className="form-label">Dataset destino</label>
                <select value={relatedDatasetId} onChange={(e) => { setRelatedDatasetId(e.target.value); setDisplayField(""); }}>
                  <option value="">— Seleccionar dataset —</option>
                  {datasets.map((ds) => (
                    <option key={ds.id} value={ds.id}>{ds.name}</option>
                  ))}
                </select>
                <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                  El dropdown mostrará registros de este dataset
                </span>
              </div>
              {relatedDatasetId && (
                <div className="form-group">
                  <label className="form-label">Campo a mostrar como label</label>
                  <select value={displayField} onChange={(e) => setDisplayField(e.target.value)}>
                    <option value="">— Mostrar ID (por defecto) —</option>
                    {relatedColumns.map((col) => (
                      <option key={col.id} value={col.field_key}>{col.name} ({col.field_key})</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                    El valor guardado siempre será el ID del registro seleccionado
                  </span>
                </div>
              )}
            </>
          )}

          {/* Enum options */}
          {dataType === "enum" && (
            <div className="form-group">
              <label className="form-label">Opciones de la lista</label>
              <input placeholder="Activo, Inactivo, Pendiente" value={options}
                onChange={(e) => setOptions(e.target.value)} />
              <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Separa cada opción con una coma</span>
            </div>
          )}

          {/* Number range */}
          {dataType === "number" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Mínimo</label>
                <input type="number" placeholder="Sin límite" value={min} onChange={(e) => setMin(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Máximo</label>
                <input type="number" placeholder="Sin límite" value={max} onChange={(e) => setMax(e.target.value)} />
              </div>
            </div>
          )}

          {dataType !== "relation" && (
            <label className="checkbox-row-v2">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              <span className="checkbox-row-v2-text">
                Campo requerido
                <span>No permite guardar el registro si está vacío</span>
              </span>
            </label>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saveDisabled}>
            Crear columna
          </button>
        </div>
      </div>
    </div>
  );
}

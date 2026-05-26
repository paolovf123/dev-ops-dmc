import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useEscapeKey } from "../utils/useEscapeKey";

interface Props {
  onSave: (col: Omit<ColumnDefinition, "id" | "dataset_id" | "created_at">) => void;
  onClose: () => void;
}

type ColType = ColumnDefinition["data_type"];

interface TypeOption {
  value: ColType;
  label: string;
  icon: string;
  desc: string;
  color: string;
  group: string;
}

const TYPE_OPTIONS: TypeOption[] = [
  // Texto
  { value: "text",       label: "Texto",        icon: "Aa", desc: "Nombres, descripciones cortas",      color: "#64748B", group: "Texto" },
  { value: "long_text",  label: "Texto largo",  icon: "¶",  desc: "Párrafos, notas, comentarios",       color: "#475569", group: "Texto" },
  { value: "url",        label: "Enlace",        icon: "⎋",  desc: "Dirección web (https://...)",        color: "#0891B2", group: "Texto" },
  { value: "email",      label: "Email",         icon: "✉",  desc: "Dirección de correo electrónico",    color: "#0284C7", group: "Texto" },
  { value: "phone",      label: "Teléfono",      icon: "☎",  desc: "Número de teléfono",                 color: "#0369A1", group: "Texto" },
  // Número
  { value: "number",     label: "Número",        icon: "#",  desc: "Cantidades, decimales",              color: "#2563EB", group: "Número" },
  { value: "currency",   label: "Moneda",        icon: "$",  desc: "Importes con símbolo de moneda",     color: "#16A34A", group: "Número" },
  { value: "percent",    label: "Porcentaje",    icon: "%",  desc: "Valor de 0 a 100",                   color: "#7C3AED", group: "Número" },
  { value: "rating",     label: "Calificación",  icon: "★",  desc: "Estrellas (1–5 por defecto)",        color: "#D97706", group: "Número" },
  // Selección
  { value: "enum",       label: "Lista",         icon: "≡",  desc: "Una opción de una lista fija",       color: "#EA580C", group: "Selección" },
  { value: "multiselect",label: "Multi-lista",   icon: "☰",  desc: "Varias opciones de una lista fija",  color: "#C2410C", group: "Selección" },
  { value: "boolean",    label: "Sí / No",       icon: "✓",  desc: "Verdadero o falso",                  color: "#059669", group: "Selección" },
  // Especial
  { value: "date",       label: "Fecha",         icon: "▦",  desc: "Fechas y horarios",                  color: "#9333EA", group: "Especial" },
  { value: "relation",   label: "Relación",      icon: "⇢",  desc: "Apunta a registros de otro dataset", color: "#DB2777", group: "Especial" },
];

const GROUPS = ["Texto", "Número", "Selección", "Especial"];

export default function AddColumnModal({ onSave, onClose }: Props) {
  const [name, setName]                         = useState("");
  const [fieldKey, setFieldKey]                 = useState("");
  const [dataType, setDataType]                 = useState<ColType>("text");
  const [required, setRequired]                 = useState(false);
  const [options, setOptions]                   = useState("");
  const [min, setMin]                           = useState("");
  const [max, setMax]                           = useState("");
  const [relatedDatasetId, setRelatedDatasetId] = useState("");
  const [displayField, setDisplayField]         = useState("");
  const [currencySymbol, setCurrencySymbol]     = useState("$");
  const [unique, setUnique]                     = useState(false);
  const [regex, setRegex]                       = useState("");
  const [regexMessage, setRegexMessage]         = useState("");
  const [maxRating, setMaxRating]               = useState(5);
  useEscapeKey(onClose);

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

  const handleTypeChange = (t: ColType) => {
    setDataType(t);
    setRelatedDatasetId("");
    setDisplayField("");
  };

  const handleSave = () => {
    const rules: ColumnDefinition["rules"] = {};
    if (required) rules.required = true;
    if ((dataType === "enum" || dataType === "multiselect") && options)
      rules.options = options.split(",").map((o) => o.trim()).filter(Boolean);
    if (dataType === "number") {
      if (min !== "") rules.min = Number(min);
      if (max !== "") rules.max = Number(max);
    }
    if (dataType === "currency") {
      rules.currency_symbol = currencySymbol || "$";
      if (min !== "") rules.min = Number(min);
      if (max !== "") rules.max = Number(max);
    }
    if (dataType === "rating") {
      rules.max_rating = maxRating;
    }
    if (dataType === "relation") {
      rules.related_dataset_id = relatedDatasetId;
      if (displayField) rules.display_field = displayField;
    }
    if (unique && dataType !== "relation") rules.unique = true;
    if (regex.trim() && dataType !== "relation") {
      rules.regex = regex.trim();
      if (regexMessage.trim()) rules.regex_message = regexMessage.trim();
    }
    onSave({ name, field_key: fieldKey, data_type: dataType, rules, position: 0 });
  };

  const selectedType = TYPE_OPTIONS.find((t) => t.value === dataType)!;
  const saveDisabled =
    !name || !fieldKey ||
    (dataType === "relation" && !relatedDatasetId);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-v2" style={{ maxWidth: "min(560px, 100%)" }}>
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

          {/* Type selector — grouped */}
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Tipo de dato</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {GROUPS.map((group) => {
                const groupTypes = TYPE_OPTIONS.filter((t) => t.group === group);
                return (
                  <div key={group}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)",
                      textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                      {group}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 6 }}>
                      {groupTypes.map((t) => (
                        <button key={t.value} type="button"
                          className={`type-option${dataType === t.value ? " active" : ""}`}
                          style={dataType === t.value ? {
                            borderColor: t.color,
                            background: t.color + "12",
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
                );
              })}
            </div>
          </div>

          {/* ── Type-specific rules ── */}

          {/* Relation */}
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

          {/* Enum / Multiselect options */}
          {(dataType === "enum" || dataType === "multiselect") && (
            <div className="form-group">
              <label className="form-label">Opciones</label>
              <input placeholder="Activo, Inactivo, Pendiente" value={options}
                onChange={(e) => setOptions(e.target.value)} />
              <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Separa cada opción con una coma</span>
            </div>
          )}

          {/* Number range */}
          {dataType === "number" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
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

          {/* Currency */}
          {dataType === "currency" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Símbolo</label>
                <input value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} placeholder="$" maxLength={5} />
              </div>
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

          {/* Rating max */}
          {dataType === "rating" && (
            <div className="form-group">
              <label className="form-label">Escala máxima</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[3, 5, 10].map((n) => (
                  <button key={n} type="button"
                    onClick={() => setMaxRating(n)}
                    style={{
                      padding: "4px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                      cursor: "pointer", border: "1.5px solid",
                      background: maxRating === n ? "#D97706" : "transparent",
                      color: maxRating === n ? "#fff" : "var(--color-text-secondary)",
                      borderColor: maxRating === n ? "#D97706" : "var(--color-border)",
                    }}>
                    {"★".repeat(n > 5 ? 1 : n)} {n}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 4, display: "block" }}>
                Vista previa: {"★".repeat(maxRating)}
              </span>
            </div>
          )}

          {dataType !== "relation" && (
            <>
              <label className="checkbox-row-v2">
                <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
                <span className="checkbox-row-v2-text">
                  Campo requerido
                  <span>No permite guardar el registro si está vacío</span>
                </span>
              </label>
              <label className="checkbox-row-v2">
                <input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} />
                <span className="checkbox-row-v2-text">
                  Valor único
                  <span>Bloquea registros con un valor que ya exista en este dataset</span>
                </span>
              </label>
              <div className="form-group">
                <label className="form-label">Patrón (regex) opcional</label>
                <input
                  value={regex}
                  onChange={(e) => setRegex(e.target.value)}
                  placeholder="Ej: ^[A-Z]{2}\d{4}$  o  ^\d{8}$"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
                />
                <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                  Si se define, el valor debe cumplir esta expresión regular.
                </span>
              </div>
              {regex.trim() && (
                <div className="form-group">
                  <label className="form-label">Mensaje cuando no cumple</label>
                  <input
                    value={regexMessage}
                    onChange={(e) => setRegexMessage(e.target.value)}
                    placeholder="Ej: El DNI debe tener 8 dígitos"
                  />
                </div>
              )}
            </>
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

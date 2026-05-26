import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";

interface Props {
  column: ColumnDefinition;
  onSave: (updates: Partial<ColumnDefinition>) => void;
  onClose: () => void;
}

type ColType = ColumnDefinition["data_type"];

const TYPE_OPTIONS: { value: ColType; label: string; icon: string; color: string }[] = [
  { value: "text",        label: "Texto",       icon: "Aa", color: "#64748B" },
  { value: "long_text",   label: "Texto largo", icon: "¶",  color: "#475569" },
  { value: "url",         label: "Enlace",      icon: "⎋",  color: "#0891B2" },
  { value: "email",       label: "Email",       icon: "✉",  color: "#0284C7" },
  { value: "phone",       label: "Teléfono",    icon: "☎",  color: "#0369A1" },
  { value: "number",      label: "Número",      icon: "#",  color: "#2563EB" },
  { value: "currency",    label: "Moneda",      icon: "$",  color: "#16A34A" },
  { value: "percent",     label: "Porcentaje",  icon: "%",  color: "#7C3AED" },
  { value: "rating",      label: "Calific.",    icon: "★",  color: "#D97706" },
  { value: "enum",        label: "Lista",       icon: "≡",  color: "#EA580C" },
  { value: "multiselect", label: "Multi-lista", icon: "☰",  color: "#C2410C" },
  { value: "boolean",     label: "Sí / No",     icon: "✓",  color: "#059669" },
  { value: "date",        label: "Fecha",       icon: "▦",  color: "#9333EA" },
  { value: "relation",    label: "Relación",    icon: "⇢",  color: "#DB2777" },
];

export default function EditColumnModal({ column, onSave, onClose }: Props) {
  const [name, setName]                         = useState(column.name);
  const [dataType, setDataType]                 = useState<ColType>(column.data_type);
  const [required, setRequired]                 = useState(!!column.rules.required);
  const [options, setOptions]                   = useState((column.rules.options ?? []).join(", "));
  const [min, setMin]                           = useState(column.rules.min !== undefined ? String(column.rules.min) : "");
  const [max, setMax]                           = useState(column.rules.max !== undefined ? String(column.rules.max) : "");
  const [relatedDatasetId, setRelatedDatasetId] = useState(column.rules.related_dataset_id ?? "");
  const [displayField, setDisplayField]         = useState(column.rules.display_field ?? "");
  const [currencySymbol, setCurrencySymbol]     = useState(column.rules.currency_symbol ?? "$");
  const [maxRating, setMaxRating]               = useState(column.rules.max_rating ?? 5);
  const [unique, setUnique]                     = useState(!!column.rules.unique);
  const [regex, setRegex]                       = useState((column.rules.regex as string) ?? "");
  const [regexMessage, setRegexMessage]         = useState((column.rules.regex_message as string) ?? "");

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

  const handleTypeChange = (t: ColType) => {
    setDataType(t);
    if (t !== "relation") {
      setRelatedDatasetId("");
      setDisplayField("");
    }
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
    onSave({ name, data_type: dataType, rules });
  };

  const selectedType = TYPE_OPTIONS.find((t) => t.value === dataType) ?? TYPE_OPTIONS[0];
  const saveDisabled = !name.trim() || (dataType === "relation" && !relatedDatasetId);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-v2" style={{ maxWidth: 560 }}>
        <div className="modal-accent" style={{ background: selectedType.color }} />

        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="modal-header-icon" style={{ background: selectedType.color + "18", color: selectedType.color }}>
              ✎
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Editar columna</h3>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-text-muted)" }}>
                Modifica nombre, tipo y reglas
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
          {/* field_key read-only badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18,
            padding: "8px 12px", background: "var(--color-bg)", borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border-light)" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)",
              textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>key</span>
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5,
              color: "var(--color-text-secondary)", flex: 1 }}>{column.field_key}</code>
            <span style={{ fontSize: 10, color: "var(--color-text-muted)", background: "var(--color-border-light)",
              padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>no editable</span>
          </div>

          <div className="form-group">
            <label className="form-label">Nombre visible</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la columna" />
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Tipo de dato</label>
            <div className="type-selector type-selector--compact"
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(86px, 1fr))", gap: 6 }}>
              {TYPE_OPTIONS.map((t) => (
                <button key={t.value} type="button"
                  className={`type-option type-option--compact${dataType === t.value ? " active" : ""}`}
                  style={dataType === t.value ? { borderColor: t.color, background: t.color + "10" } : {}}
                  onClick={() => handleTypeChange(t.value)}>
                  <span className="type-option-icon" style={{ color: dataType === t.value ? t.color : "var(--color-text-muted)" }}>
                    {t.icon}
                  </span>
                  <span className="type-option-label">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Type-specific rules ── */}

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
                </div>
              )}
            </>
          )}

          {(dataType === "enum" || dataType === "multiselect") && (
            <div className="form-group">
              <label className="form-label">Opciones (separadas por coma)</label>
              <input placeholder="Activo, Inactivo, Pendiente" value={options}
                onChange={(e) => setOptions(e.target.value)} />
            </div>
          )}

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

          {dataType === "currency" && (
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 12 }}>
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
                    ★ {n}
                  </button>
                ))}
              </div>
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
                  <span>No permite guardar el registro si ya existe otro con el mismo valor en este dataset</span>
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
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

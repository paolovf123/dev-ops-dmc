import { useState } from "react";
import type { ColumnDefinition } from "../types";

interface Props {
  column: ColumnDefinition;
  onSave: (updates: Partial<ColumnDefinition>) => void;
  onClose: () => void;
}

const TYPE_OPTIONS: { value: ColumnDefinition["data_type"]; label: string; icon: string; color: string }[] = [
  { value: "text",   label: "Texto",  icon: "Aa", color: "#64748B" },
  { value: "number", label: "Número", icon: "#",  color: "#2563EB" },
  { value: "date",   label: "Fecha",  icon: "▦",  color: "#7C3AED" },
  { value: "enum",   label: "Lista",  icon: "≡",  color: "#D97706" },
];

export default function EditColumnModal({ column, onSave, onClose }: Props) {
  const [name, setName]         = useState(column.name);
  const [dataType, setDataType] = useState(column.data_type);
  const [required, setRequired] = useState(!!column.rules.required);
  const [options, setOptions]   = useState((column.rules.options ?? []).join(", "));
  const [min, setMin]           = useState(column.rules.min !== undefined ? String(column.rules.min) : "");
  const [max, setMax]           = useState(column.rules.max !== undefined ? String(column.rules.max) : "");

  const handleSave = () => {
    const rules: ColumnDefinition["rules"] = {};
    if (required) rules.required = true;
    if (dataType === "enum" && options)
      rules.options = options.split(",").map((o) => o.trim()).filter(Boolean);
    if (dataType === "number") {
      if (min !== "") rules.min = Number(min);
      if (max !== "") rules.max = Number(max);
    }
    onSave({ name, data_type: dataType, rules });
  };

  const selectedType = TYPE_OPTIONS.find((t) => t.value === dataType)!;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-v2">
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
          {/* field_key read-only */}
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
            <div className="type-selector type-selector--compact">
              {TYPE_OPTIONS.map((t) => (
                <button key={t.value} type="button"
                  className={`type-option type-option--compact${dataType === t.value ? " active" : ""}`}
                  style={dataType === t.value ? { borderColor: t.color, background: t.color + "10" } : {}}
                  onClick={() => setDataType(t.value)}>
                  <span className="type-option-icon" style={{ color: dataType === t.value ? t.color : "var(--color-text-muted)" }}>
                    {t.icon}
                  </span>
                  <span className="type-option-label">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {dataType === "enum" && (
            <div className="form-group">
              <label className="form-label">Opciones de la lista</label>
              <input placeholder="Activo, Inactivo, Pendiente" value={options}
                onChange={(e) => setOptions(e.target.value)} />
              <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>Separa cada opción con una coma</span>
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

          <label className="checkbox-row-v2">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            <span className="checkbox-row-v2-text">
              Campo requerido
              <span>No permite guardar el registro si está vacío</span>
            </span>
          </label>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

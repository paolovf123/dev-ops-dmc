import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X, Pencil, Type, AlignLeft, Link, Mail, Phone, Hash, DollarSign,
  Percent, Star, List, ListChecks, ToggleLeft, Calendar, Link2, Check,
} from "lucide-react";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useEscapeKey } from "../utils/useEscapeKey";
import { Btn, Toggle, TONE } from "./ui/kit";
import type { Tone } from "./ui/kit";

interface Props {
  column: ColumnDefinition;
  onSave: (updates: Partial<ColumnDefinition>) => void;
  onClose: () => void;
}

type ColType = ColumnDefinition["data_type"];

const TYPE_OPTIONS: { value: ColType; label: string; icon: ReactNode; tone: Tone }[] = [
  { value: "text",        label: "Texto",       icon: <Type size={16} />,       tone: "neutral" },
  { value: "long_text",   label: "Texto largo", icon: <AlignLeft size={16} />,  tone: "neutral" },
  { value: "url",         label: "Enlace",      icon: <Link size={16} />,       tone: "rel" },
  { value: "email",       label: "Email",       icon: <Mail size={16} />,       tone: "primary" },
  { value: "phone",       label: "Teléfono",    icon: <Phone size={16} />,      tone: "primary" },
  { value: "number",      label: "Número",      icon: <Hash size={16} />,       tone: "primary" },
  { value: "currency",    label: "Moneda",      icon: <DollarSign size={16} />, tone: "success" },
  { value: "percent",     label: "Porcentaje",  icon: <Percent size={16} />,    tone: "violet" },
  { value: "rating",      label: "Calific.",    icon: <Star size={16} />,       tone: "warn" },
  { value: "enum",        label: "Lista",       icon: <List size={16} />,       tone: "warn" },
  { value: "multiselect", label: "Multi-lista", icon: <ListChecks size={16} />, tone: "warn" },
  { value: "boolean",     label: "Sí / No",     icon: <ToggleLeft size={16} />, tone: "success" },
  { value: "date",        label: "Fecha",       icon: <Calendar size={16} />,   tone: "violet" },
  { value: "relation",    label: "Relación",    icon: <Link2 size={16} />,      tone: "rel" },
];

// ── estilos compartidos ───────────────────────────────────────────────────────
const fieldLabel: CSSProperties = {
  font: "500 12.5px/1 var(--font-sans)", color: "var(--text-soft)", marginBottom: 6, display: "block",
};
const fieldInput: CSSProperties = {
  width: "100%", height: 38, padding: "0 11px", borderRadius: "var(--r-2)",
  border: "1px solid var(--border)", background: "var(--surface)",
  font: "400 13.5px/1 var(--font-sans)", color: "var(--text)", outline: "none",
};
const help: CSSProperties = {
  display: "block", marginTop: 6, font: "400 11.5px/1.5 var(--font-sans)", color: "var(--text-mute)",
};
const groupGrid = (min: number): CSSProperties => ({
  display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12,
});

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
  const [iconFg, iconBg] = TONE[selectedType.tone] ?? TONE.primary;

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "var(--overlay)",
        backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)",
        display: "grid", placeItems: "center", padding: 24,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-4)",
          boxShadow: "var(--shadow-4)", overflow: "hidden",
        }}
      >
        {/* header */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px",
          borderBottom: "1px solid var(--border)",
        }}>
          <span style={{
            display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: "var(--r-2)",
            background: iconBg, color: iconFg, flex: "none", position: "relative",
          }}>
            {selectedType.icon}
            <span style={{
              position: "absolute", right: -3, bottom: -3, display: "grid", placeItems: "center",
              width: 17, height: 17, borderRadius: 999, background: "var(--accent-pri)", color: "#fff",
              border: "2px solid var(--surface)",
            }}>
              <Pencil size={9} />
            </span>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>Editar columna</div>
            <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3 }}>
              Modifica nombre, tipo y reglas
            </div>
          </div>
          <button onClick={onClose} className="og-iconbtn" title="Cerrar" style={{
            width: 32, height: 32, display: "grid", placeItems: "center", border: "none",
            background: "transparent", borderRadius: 8, cursor: "pointer", color: "var(--text-mute)",
          }}>
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div style={{ padding: 20, overflow: "auto" }}>
          {/* field_key read-only badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 18,
            padding: "9px 12px", background: "var(--surface-2)", borderRadius: "var(--r-2)",
            border: "1px solid var(--border)",
          }}>
            <span style={{
              font: "600 11px/1 var(--font-sans)", color: "var(--text-mute)",
              textTransform: "uppercase", letterSpacing: ".05em", flexShrink: 0,
            }}>key</span>
            <code className="mono" style={{
              font: "500 12.5px/1 var(--font-mono)", color: "var(--text-soft)", flex: 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{column.field_key}</code>
            <span style={{
              font: "600 10px/1 var(--font-sans)", color: "var(--text-mute)",
              background: "var(--surface-alt)", padding: "3px 8px", borderRadius: "var(--r-pill)", flexShrink: 0,
            }}>no editable</span>
          </div>

          {/* nombre */}
          <label style={{ display: "block", marginBottom: 18 }}>
            <span style={fieldLabel}>Nombre visible</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la columna" style={fieldInput} />
          </label>

          {/* tipo de dato */}
          <div style={{ marginBottom: 20 }}>
            <span style={fieldLabel}>Tipo de dato</span>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 6,
            }}>
              {TYPE_OPTIONS.map((t) => {
                const on = dataType === t.value;
                const [fg, bg] = TONE[t.tone] ?? TONE.neutral;
                return (
                  <button key={t.value} type="button" onClick={() => handleTypeChange(t.value)} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                    padding: "10px 6px", borderRadius: "var(--r-2)", cursor: "pointer",
                    border: `1px solid ${on ? fg : "var(--border)"}`,
                    background: on ? bg : "var(--surface)",
                    color: on ? fg : "var(--text-soft)", transition: "all var(--t-fast)",
                  }}>
                    <span style={{ color: on ? fg : "var(--text-mute)", display: "grid", placeItems: "center" }}>
                      {t.icon}
                    </span>
                    <span style={{ font: `${on ? 600 : 500} 11.5px/1 var(--font-sans)` }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Type-specific rules ── */}

          {dataType === "relation" && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 14, marginBottom: 4,
              padding: 14, borderRadius: "var(--r-2)", background: "var(--rel-soft)",
              border: "1px solid color-mix(in srgb, var(--accent-rel) 30%, transparent)",
            }}>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Dataset destino</span>
                <select value={relatedDatasetId}
                  onChange={(e) => { setRelatedDatasetId(e.target.value); setDisplayField(""); }}
                  style={fieldInput}>
                  <option value="">— Seleccionar dataset —</option>
                  {datasets.map((ds) => (
                    <option key={ds.id} value={ds.id}>{ds.name}</option>
                  ))}
                </select>
              </label>
              {relatedDatasetId && (
                <label style={{ display: "block" }}>
                  <span style={fieldLabel}>Campo a mostrar como label</span>
                  <select value={displayField} onChange={(e) => setDisplayField(e.target.value)} style={fieldInput}>
                    <option value="">— Mostrar ID (por defecto) —</option>
                    {relatedColumns.map((col) => (
                      <option key={col.id} value={col.field_key}>{col.name} ({col.field_key})</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {(dataType === "enum" || dataType === "multiselect") && (
            <label style={{ display: "block", marginBottom: 4 }}>
              <span style={fieldLabel}>Opciones (separadas por coma)</span>
              <input placeholder="Activo, Inactivo, Pendiente" value={options}
                onChange={(e) => setOptions(e.target.value)} style={fieldInput} />
            </label>
          )}

          {dataType === "number" && (
            <div style={groupGrid(140)}>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Mínimo</span>
                <input type="number" placeholder="Sin límite" value={min}
                  onChange={(e) => setMin(e.target.value)} style={fieldInput} />
              </label>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Máximo</span>
                <input type="number" placeholder="Sin límite" value={max}
                  onChange={(e) => setMax(e.target.value)} style={fieldInput} />
              </label>
            </div>
          )}

          {dataType === "currency" && (
            <div style={groupGrid(120)}>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Símbolo</span>
                <input value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)}
                  placeholder="$" maxLength={5} style={fieldInput} />
              </label>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Mínimo</span>
                <input type="number" placeholder="Sin límite" value={min}
                  onChange={(e) => setMin(e.target.value)} style={fieldInput} />
              </label>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Máximo</span>
                <input type="number" placeholder="Sin límite" value={max}
                  onChange={(e) => setMax(e.target.value)} style={fieldInput} />
              </label>
            </div>
          )}

          {dataType === "rating" && (
            <div>
              <span style={fieldLabel}>Escala máxima</span>
              <div style={{ display: "flex", gap: 8 }}>
                {[3, 5, 10].map((n) => {
                  const on = maxRating === n;
                  return (
                    <button key={n} type="button" onClick={() => setMaxRating(n)} style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "7px 15px", borderRadius: "var(--r-2)",
                      font: "600 13px/1 var(--font-sans)", cursor: "pointer",
                      border: `1px solid ${on ? "var(--warning)" : "var(--border)"}`,
                      background: on ? "var(--warning)" : "var(--surface)",
                      color: on ? "#fff" : "var(--text-soft)", transition: "all var(--t-fast)",
                    }}>
                      <Star size={13} fill={on ? "#fff" : "none"} /> {n}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {dataType !== "relation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 11, cursor: "pointer" }}>
                <Toggle on={required} onChange={setRequired} size={0.85} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ font: "600 13px/1.3 var(--font-sans)", color: "var(--text)" }}>Campo requerido</span>
                  <span style={{ font: "400 12px/1.4 var(--font-sans)", color: "var(--text-soft)" }}>
                    No permite guardar el registro si está vacío
                  </span>
                </span>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 11, cursor: "pointer" }}>
                <Toggle on={unique} onChange={setUnique} size={0.85} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ font: "600 13px/1.3 var(--font-sans)", color: "var(--text)" }}>Valor único</span>
                  <span style={{ font: "400 12px/1.4 var(--font-sans)", color: "var(--text-soft)" }}>
                    No permite guardar el registro si ya existe otro con el mismo valor en este dataset
                  </span>
                </span>
              </label>

              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Patrón (regex) opcional</span>
                <input value={regex} onChange={(e) => setRegex(e.target.value)}
                  placeholder="Ej: ^[A-Z]{2}\d{4}$  o  ^\d{8}$"
                  className="mono"
                  style={{ ...fieldInput, font: "400 13px/1 var(--font-mono)" }} />
                <span style={help}>
                  Si se define, el valor debe cumplir esta expresión regular.
                </span>
              </label>

              {regex.trim() && (
                <label style={{ display: "block" }}>
                  <span style={fieldLabel}>Mensaje cuando no cumple</span>
                  <input value={regexMessage} onChange={(e) => setRegexMessage(e.target.value)}
                    placeholder="Ej: El DNI debe tener 8 dígitos" style={fieldInput} />
                </label>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px",
          borderTop: "1px solid var(--border)", background: "var(--surface-2)",
        }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" icon={<Check size={16} />} onClick={handleSave} disabled={saveDisabled}>
            Guardar cambios
          </Btn>
        </div>
      </div>
    </div>
  );
}

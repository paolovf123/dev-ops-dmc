import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X, Type, AlignLeft, Link2, Mail, Phone, Hash, DollarSign, Percent,
  Star, List, ListChecks, Check, Calendar, GitBranch, Columns3,
} from "lucide-react";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useEscapeKey } from "../utils/useEscapeKey";
import { Btn, Toggle, TONE } from "./ui/kit";
import type { Tone } from "./ui/kit";

interface Props {
  onSave: (col: Omit<ColumnDefinition, "id" | "dataset_id" | "created_at">) => void;
  onClose: () => void;
}

type ColType = ColumnDefinition["data_type"];

interface TypeOption {
  value: ColType;
  label: string;
  icon: ReactNode;
  desc: string;
  tone: Tone;
  group: string;
}

const ic = (Comp: typeof Type) => <Comp size={16} strokeWidth={2} />;

const TYPE_OPTIONS: TypeOption[] = [
  // Texto
  { value: "text",        label: "Texto",        icon: ic(Type),       desc: "Nombres, descripciones cortas",      tone: "neutral", group: "Texto" },
  { value: "long_text",   label: "Texto largo",  icon: ic(AlignLeft),  desc: "Párrafos, notas, comentarios",       tone: "neutral", group: "Texto" },
  { value: "url",         label: "Enlace",       icon: ic(Link2),      desc: "Dirección web (https://...)",        tone: "primary", group: "Texto" },
  { value: "email",       label: "Email",        icon: ic(Mail),       desc: "Dirección de correo electrónico",    tone: "primary", group: "Texto" },
  { value: "phone",       label: "Teléfono",     icon: ic(Phone),      desc: "Número de teléfono",                 tone: "primary", group: "Texto" },
  // Número
  { value: "number",      label: "Número",       icon: ic(Hash),       desc: "Cantidades, decimales",              tone: "primary", group: "Número" },
  { value: "currency",    label: "Moneda",       icon: ic(DollarSign), desc: "Importes con símbolo de moneda",     tone: "success", group: "Número" },
  { value: "percent",     label: "Porcentaje",   icon: ic(Percent),    desc: "Valor de 0 a 100",                   tone: "violet",  group: "Número" },
  { value: "rating",      label: "Calificación", icon: ic(Star),       desc: "Estrellas (1–5 por defecto)",        tone: "warn",    group: "Número" },
  // Selección
  { value: "enum",        label: "Lista",        icon: ic(List),       desc: "Una opción de una lista fija",       tone: "warn",    group: "Selección" },
  { value: "multiselect", label: "Multi-lista",  icon: ic(ListChecks), desc: "Varias opciones de una lista fija",  tone: "warn",    group: "Selección" },
  { value: "boolean",     label: "Sí / No",      icon: ic(Check),      desc: "Verdadero o falso",                  tone: "success", group: "Selección" },
  // Especial
  { value: "date",        label: "Fecha",        icon: ic(Calendar),   desc: "Fechas y horarios",                  tone: "violet",  group: "Especial" },
  { value: "relation",    label: "Relación",     icon: ic(GitBranch),  desc: "Apunta a registros de otro dataset", tone: "rel",     group: "Especial" },
];

const GROUPS = ["Texto", "Número", "Selección", "Especial"];

// ── estilos compartidos ───────────────────────────────────────────────────────
const fieldLabel: CSSProperties = {
  display: "block", font: "500 12.5px/1 var(--font-sans)", color: "var(--text-soft)", marginBottom: 6,
};
const fieldInput: CSSProperties = {
  width: "100%", height: 38, padding: "0 11px", borderRadius: "var(--r-2)",
  border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
  font: "400 13.5px/1 var(--font-sans)", outline: "none",
};
const fieldHelp: CSSProperties = {
  display: "block", marginTop: 6, font: "400 11.5px/1.4 var(--font-sans)", color: "var(--text-mute)",
};
const sectionTone = (tone: Tone): CSSProperties => ({
  marginBottom: 16, padding: 14, borderRadius: "var(--r-3)",
  background: TONE[tone][1],
  border: `1px solid color-mix(in srgb, ${TONE[tone][0]} 30%, transparent)`,
});

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
  const [accentFg, accentBg] = TONE[selectedType.tone];
  const saveDisabled =
    !name || !fieldKey ||
    (dataType === "relation" && !relatedDatasetId);

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "var(--overlay)",
        backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)",
        display: "grid", placeItems: "center", padding: 24, animation: "ogFade var(--t-mid)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="og-rise"
        style={{
          width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-4)",
          boxShadow: "var(--shadow-4)", overflow: "hidden",
        }}
      >
        {/* Accent bar por tipo */}
        <div style={{ height: 3, background: accentFg, transition: "background var(--t-mid)" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{
            display: "grid", placeItems: "center", width: 38, height: 38, flex: "none",
            borderRadius: "var(--r-2)", background: accentBg, color: accentFg,
            transition: "all var(--t-mid)",
          }}>
            <Columns3 size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>Nueva columna</div>
            <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3 }}>
              Configura el tipo y sus reglas de validación
            </div>
          </div>
          <button
            onClick={onClose}
            className="og-iconbtn"
            title="Cerrar"
            style={{
              width: 32, height: 32, display: "grid", placeItems: "center", flex: "none",
              border: "none", background: "transparent", borderRadius: 8, cursor: "pointer",
              color: "var(--text-mute)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflow: "auto" }}>
          {/* Nombre + field key */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <label style={{ display: "block", flex: 1 }}>
              <span style={fieldLabel}>Nombre visible</span>
              <input
                style={fieldInput}
                placeholder="Ej. Nombre del cliente"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                autoFocus
              />
            </label>
            <label style={{ display: "block", flex: 1 }}>
              <span style={fieldLabel}>
                field_key
                <span style={{ fontWeight: 400, color: "var(--text-mute)", marginLeft: 5 }}>— identificador interno</span>
              </span>
              <input
                className="mono"
                style={{ ...fieldInput, fontFamily: "var(--font-mono)", fontSize: 13 }}
                placeholder="campo_clave"
                value={fieldKey}
                onChange={(e) => setFieldKey(e.target.value)}
              />
            </label>
          </div>

          {/* Selector de tipo — agrupado */}
          <div style={{ marginBottom: 18 }}>
            <span style={fieldLabel}>Tipo de dato</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {GROUPS.map((group) => {
                const groupTypes = TYPE_OPTIONS.filter((t) => t.group === group);
                return (
                  <div key={group}>
                    <div style={{
                      font: "700 10px/1 var(--font-sans)", color: "var(--text-mute)",
                      textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 7,
                    }}>
                      {group}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 7 }}>
                      {groupTypes.map((t) => {
                        const active = dataType === t.value;
                        const [tfg, tbg] = TONE[t.tone];
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => handleTypeChange(t.value)}
                            title={t.desc}
                            style={{
                              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4,
                              padding: "9px 10px", borderRadius: "var(--r-2)", cursor: "pointer", textAlign: "left",
                              border: `1px solid ${active ? tfg : "var(--border)"}`,
                              background: active ? tbg : "var(--surface)",
                              transition: "all var(--t-fast)",
                            }}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <span style={{ display: "grid", placeItems: "center", color: active ? tfg : "var(--text-mute)" }}>
                                {t.icon}
                              </span>
                              <span style={{
                                font: `${active ? 600 : 500} 13px/1 var(--font-sans)`,
                                color: active ? tfg : "var(--text)",
                              }}>
                                {t.label}
                              </span>
                            </span>
                            <span style={{ font: "400 11px/1.3 var(--font-sans)", color: "var(--text-mute)" }}>
                              {t.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Reglas según tipo ── */}

          {/* Relación */}
          {dataType === "relation" && (
            <div style={sectionTone("rel")}>
              <label style={{ display: "block", marginBottom: relatedDatasetId ? 14 : 0 }}>
                <span style={fieldLabel}>Dataset destino</span>
                <select
                  style={fieldInput}
                  value={relatedDatasetId}
                  onChange={(e) => { setRelatedDatasetId(e.target.value); setDisplayField(""); }}
                >
                  <option value="">— Seleccionar dataset —</option>
                  {datasets.map((ds) => (
                    <option key={ds.id} value={ds.id}>{ds.name}</option>
                  ))}
                </select>
                <span style={fieldHelp}>El dropdown mostrará registros de este dataset</span>
              </label>
              {relatedDatasetId && (
                <label style={{ display: "block" }}>
                  <span style={fieldLabel}>Campo a mostrar como label</span>
                  <select
                    style={fieldInput}
                    value={displayField}
                    onChange={(e) => setDisplayField(e.target.value)}
                  >
                    <option value="">— Mostrar ID (por defecto) —</option>
                    {relatedColumns.map((col) => (
                      <option key={col.id} value={col.field_key}>{col.name} ({col.field_key})</option>
                    ))}
                  </select>
                  <span style={fieldHelp}>El valor guardado siempre será el ID del registro seleccionado</span>
                </label>
              )}
            </div>
          )}

          {/* Enum / Multiselect */}
          {(dataType === "enum" || dataType === "multiselect") && (
            <div style={sectionTone("warn")}>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Opciones</span>
                <input
                  style={fieldInput}
                  placeholder="Activo, Inactivo, Pendiente"
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                />
                <span style={fieldHelp}>Separa cada opción con una coma</span>
              </label>
            </div>
          )}

          {/* Rango numérico */}
          {dataType === "number" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Mínimo</span>
                <input type="number" style={fieldInput} placeholder="Sin límite" value={min} onChange={(e) => setMin(e.target.value)} />
              </label>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Máximo</span>
                <input type="number" style={fieldInput} placeholder="Sin límite" value={max} onChange={(e) => setMax(e.target.value)} />
              </label>
            </div>
          )}

          {/* Moneda */}
          {dataType === "currency" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 16 }}>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Símbolo</span>
                <input style={fieldInput} value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} placeholder="$" maxLength={5} />
              </label>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Mínimo</span>
                <input type="number" style={fieldInput} placeholder="Sin límite" value={min} onChange={(e) => setMin(e.target.value)} />
              </label>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Máximo</span>
                <input type="number" style={fieldInput} placeholder="Sin límite" value={max} onChange={(e) => setMax(e.target.value)} />
              </label>
            </div>
          )}

          {/* Calificación */}
          {dataType === "rating" && (
            <div style={{ marginBottom: 16 }}>
              <span style={fieldLabel}>Escala máxima</span>
              <div style={{ display: "flex", gap: 8 }}>
                {[3, 5, 10].map((n) => {
                  const on = maxRating === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMaxRating(n)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "6px 14px", borderRadius: "var(--r-2)", cursor: "pointer",
                        font: "600 13px/1 var(--font-sans)",
                        border: `1px solid ${on ? "var(--warning)" : "var(--border)"}`,
                        background: on ? "var(--warning)" : "var(--surface)",
                        color: on ? "#fff" : "var(--text-soft)",
                        transition: "all var(--t-fast)",
                      }}
                    >
                      <Star size={13} fill={on ? "#fff" : "none"} /> {n}
                    </button>
                  );
                })}
              </div>
              <span style={{ ...fieldHelp, display: "inline-flex", alignItems: "center", gap: 3 }}>
                Vista previa:
                {Array.from({ length: maxRating }).map((_, i) => (
                  <Star key={i} size={12} fill="var(--warning)" color="var(--warning)" />
                ))}
              </span>
            </div>
          )}

          {/* Reglas comunes (no aplican a relación) */}
          {dataType !== "relation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 4 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 11, cursor: "pointer" }}>
                <Toggle on={required} onChange={setRequired} size={0.85} />
                <span>
                  <span style={{ display: "block", font: "600 13px/1.3 var(--font-sans)", color: "var(--text)" }}>Campo requerido</span>
                  <span style={{ font: "400 12px/1.4 var(--font-sans)", color: "var(--text-mute)" }}>
                    No permite guardar el registro si está vacío
                  </span>
                </span>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 11, cursor: "pointer" }}>
                <Toggle on={unique} onChange={setUnique} size={0.85} />
                <span>
                  <span style={{ display: "block", font: "600 13px/1.3 var(--font-sans)", color: "var(--text)" }}>Valor único</span>
                  <span style={{ font: "400 12px/1.4 var(--font-sans)", color: "var(--text-mute)" }}>
                    Bloquea registros con un valor que ya exista en este dataset
                  </span>
                </span>
              </label>

              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Patrón (regex) opcional</span>
                <input
                  className="mono"
                  style={{ ...fieldInput, fontFamily: "var(--font-mono)", fontSize: 13 }}
                  value={regex}
                  onChange={(e) => setRegex(e.target.value)}
                  placeholder="Ej: ^[A-Z]{2}\d{4}$  o  ^\d{8}$"
                />
                <span style={fieldHelp}>Si se define, el valor debe cumplir esta expresión regular.</span>
              </label>

              {regex.trim() && (
                <label style={{ display: "block" }}>
                  <span style={fieldLabel}>Mensaje cuando no cumple</span>
                  <input
                    style={fieldInput}
                    value={regexMessage}
                    onChange={(e) => setRegexMessage(e.target.value)}
                    placeholder="Ej: El DNI debe tener 8 dígitos"
                  />
                </label>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px",
          borderTop: "1px solid var(--border)", background: "var(--surface-2)",
        }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" icon={<Check size={16} />} onClick={handleSave} disabled={saveDisabled}>
            Crear columna
          </Btn>
        </div>
      </div>
    </div>
  );
}

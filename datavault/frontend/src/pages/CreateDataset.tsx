import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createDataset, createColumn } from "../api/datasets";
import type { ColumnDefinition } from "../types";

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
  { value: "email",       label: "Email",        icon: "✉",  group: "Texto"     },
  { value: "phone",       label: "Teléfono",     icon: "☎",  group: "Texto"     },
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
function newCol(): ColDraft {
  return { uid: crypto.randomUUID(), name: "", field_key: "", data_type: "text", required: false, options: "", currency_symbol: "$", max_rating: 5 };
}

export default function CreateDataset() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const linkedName = searchParams.get("linkedName") ?? "";

  const fkPreset: ColDraft | null = linkedName
    ? { uid: crypto.randomUUID(), name: `ID ${linkedName}`, field_key: `id_${keyword(linkedName)}`, data_type: "text", required: true, options: "", currency_symbol: "$", max_rating: 5, locked: true }
    : null;

  const [dsName, setDsName] = useState("");
  const [dsDesc, setDsDesc] = useState("");
  const [cols, setCols] = useState<ColDraft[]>(fkPreset ? [fkPreset, newCol()] : [newCol()]);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  const updateCol = (uid: string, patch: Partial<ColDraft>) =>
    setCols((prev) =>
      prev.map((c) => {
        if (c.uid !== uid) return c;
        const updated = { ...c, ...patch };
        if (patch.name !== undefined) updated.field_key = slugify(patch.name);
        return updated;
      })
    );

  const handleSubmit = async () => {
    if (!dsName.trim()) { setNameError("El nombre es requerido"); return; }
    const validCols = cols.filter((c) => c.name.trim() && c.field_key.trim());
    setSaving(true);
    try {
      const ds = await createDataset(dsName.trim(), dsDesc.trim() || undefined);
      await Promise.all(
        validCols.map((c, i) => {
          const rules: ColumnDefinition["rules"] = {};
          if (c.required) rules.required = true;
          if ((c.data_type === "enum" || c.data_type === "multiselect") && c.options)
            rules.options = c.options.split(",").map((o) => o.trim()).filter(Boolean);
          if (c.data_type === "currency") rules.currency_symbol = c.currency_symbol || "$";
          if (c.data_type === "rating") rules.max_rating = c.max_rating;
          return createColumn(ds.id, { name: c.name.trim(), field_key: c.field_key.trim(), data_type: c.data_type, rules, position: i });
        })
      );
      qc.invalidateQueries({ queryKey: ["datasets"] });
      navigate(`/datasets/${ds.id}`);
    } catch { setSaving(false); }
  };

  return (
    <>
      <header className="app-header">
        <button className="btn btn-ghost" onClick={() => navigate("/")} style={{ padding: "5px 8px", fontSize: 18 }}>←</button>
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo" style={{ width: 28, height: 28, fontSize: 13, borderRadius: "var(--radius-xs)" }}>T</div>
          <span className="app-header-name">Trans<em>Excel</em></span>
        </button>
        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Nuevo dataset</span>
        {linkedName && (
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--color-primary-bg)", color: "var(--pm-green-600)", fontWeight: 600, border: "1px solid var(--color-primary-border)", marginLeft: 6 }}>
            🔗 Relacionado con {linkedName}
          </span>
        )}
      </header>

      <main className="page" style={{ maxWidth: 820 }}>
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
              {saving ? "Creando..." : `Crear dataset${cols.filter(c => c.name).length > 0 ? ` con ${cols.filter(c => c.name).length} columna${cols.filter(c => c.name).length !== 1 ? "s" : ""}` : ""}`}
            </button>
          </div>
        </div>
      </main>
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
          <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "var(--pm-green-600)" }}>🔑 {col.name}</p>
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

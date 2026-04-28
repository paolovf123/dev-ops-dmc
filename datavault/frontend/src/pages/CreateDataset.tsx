import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createDataset, createColumn } from "../api/datasets";
import type { ColumnDefinition } from "../types";

interface ColDraft {
  uid: string;
  name: string;
  field_key: string;
  data_type: ColumnDefinition["data_type"];
  required: boolean;
  options: string;
  locked?: boolean; // FK col pre-populated from URL params
}

const DATA_TYPES: { value: ColumnDefinition["data_type"]; label: string }[] = [
  { value: "text",   label: "Texto" },
  { value: "number", label: "Número" },
  { value: "date",   label: "Fecha" },
  { value: "enum",   label: "Lista" },
];

function slugify(v: string) {
  return v.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function keyword(name: string) {
  const parts = name.toLowerCase().replace(/\s+/g, "_").split("_");
  return parts[parts.length - 1];
}

function newCol(): ColDraft {
  return { uid: crypto.randomUUID(), name: "", field_key: "", data_type: "text", required: false, options: "" };
}

export default function CreateDataset() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  const linkedName = searchParams.get("linkedName") ?? "";

  const fkPreset: ColDraft | null = linkedName
    ? {
        uid: crypto.randomUUID(),
        name: `ID ${linkedName}`,
        field_key: `id_${keyword(linkedName)}`,
        data_type: "text",
        required: true,
        options: "",
        locked: true,
      }
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
        // Auto-slug when name changes
        if (patch.name !== undefined) updated.field_key = slugify(patch.name);
        return updated;
      })
    );

  const removeCol = (uid: string) =>
    setCols((prev) => prev.filter((c) => c.uid !== uid));

  const addCol = () => setCols((prev) => [...prev, newCol()]);

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
          if (c.data_type === "enum" && c.options)
            rules.options = c.options.split(",").map((o) => o.trim()).filter(Boolean);
          return createColumn(ds.id, {
            name: c.name.trim(),
            field_key: c.field_key.trim(),
            data_type: c.data_type,
            rules,
            position: i,
          });
        })
      );
      qc.invalidateQueries({ queryKey: ["datasets"] });
      navigate(`/datasets/${ds.id}`);
    } catch {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="app-header">
        <button className="btn btn-ghost" onClick={() => navigate("/")}
          style={{ padding: "5px 8px", fontSize: 18 }}>←</button>
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo" style={{ width: 28, height: 28, fontSize: 13, borderRadius: "var(--radius-xs)" }}>T</div>
          <span className="app-header-name">Trans<em>Excel</em></span>
        </button>
        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Nuevo dataset</span>
        {linkedName && (
          <>
            <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
            <span style={{
              fontSize: 12, padding: "3px 10px", borderRadius: 20,
              background: "var(--color-primary-bg)", color: "var(--pm-green-600)",
              fontWeight: 600, border: "1px solid var(--color-primary-border)",
            }}>
              🔗 Relacionado con {linkedName}
            </span>
          </>
        )}
      </header>

      <main className="page" style={{ maxWidth: 760 }}>
        <div className="card" style={{ padding: "28px 32px" }}>
          <h2 style={{ marginBottom: 20 }}>Crear dataset</h2>

          {/* Dataset info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 20px" }}>
            <div className="form-group">
              <label className="form-label">
                Nombre <span style={{ color: "var(--pm-red-500)" }}>*</span>
              </label>
              <input
                placeholder="Ej. Clientes 2025"
                value={dsName}
                autoFocus
                onChange={(e) => { setDsName(e.target.value); setNameError(""); }}
                style={nameError ? { borderColor: "var(--pm-red-500)" } : undefined}
              />
              {nameError && <span style={{ fontSize: 12, color: "var(--pm-red-500)" }}>{nameError}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Descripción</label>
              <input placeholder="Opcional" value={dsDesc} onChange={(e) => setDsDesc(e.target.value)} />
            </div>
          </div>

          {/* Columns */}
          <div style={{ height: 1, background: "var(--color-border-light)", margin: "20px 0" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p className="section-title" style={{ margin: 0 }}>Columnas</p>
            <button className="btn btn-secondary" onClick={addCol} style={{ fontSize: 12, padding: "4px 12px" }}>
              + Agregar columna
            </button>
          </div>

          {/* Column rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "2fr 1.5fr 110px 80px 32px",
              gap: 8,
              padding: "0 4px",
            }}>
              {["Nombre", "Field key", "Tipo", "Requerido", ""].map((h) => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.5px", color: "var(--color-text-muted)" }}>{h}</span>
              ))}
            </div>

            {cols.map((col) => (
              <div key={col.uid} style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.5fr 110px 80px 32px",
                gap: 8, alignItems: "start",
                ...(col.locked ? {
                  background: "var(--color-primary-bg)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  margin: "0 -10px",
                  border: "1px solid var(--color-primary-border)",
                } : {}),
              }}>
                {col.locked ? (
                  <>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "var(--pm-green-600)" }}>
                        🔑 {col.name}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>
                        Clave foránea — apunta a {linkedName}
                      </p>
                    </div>
                    <code style={{ fontSize: 12, padding: "5px 0", display: "block", color: "var(--color-text-secondary)" }}>
                      {col.field_key}
                    </code>
                    <span style={{ fontSize: 12, padding: "5px 0", color: "var(--color-text-muted)" }}>Texto</span>
                    <span style={{ fontSize: 12, padding: "5px 0", color: "var(--pm-green-600)", textAlign: "center" }}>✓</span>
                    <span />
                  </>
                ) : (
                  <>
                <input
                  placeholder="Nombre de columna"
                  value={col.name}
                  onChange={(e) => updateCol(col.uid, { name: e.target.value })}
                />
                <input
                  className="mono"
                  placeholder="field_key"
                  value={col.field_key}
                  onChange={(e) => updateCol(col.uid, { field_key: slugify(e.target.value) })}
                />
                <select
                  value={col.data_type}
                  onChange={(e) => updateCol(col.uid, { data_type: e.target.value as ColumnDefinition["data_type"] })}
                >
                  {DATA_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 8 }}>
                  <label className="checkbox-row" style={{ gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={col.required}
                      onChange={(e) => updateCol(col.uid, { required: e.target.checked })}
                    />
                    <span style={{ fontSize: 12 }}>Sí</span>
                  </label>
                </div>
                <button
                  className="btn btn-danger-ghost"
                  onClick={() => removeCol(col.uid)}
                  style={{ padding: "4px 6px", marginTop: 2 }}
                  title="Quitar columna"
                >×</button>
                  </>
                )}

                {/* Enum options row */}
                {col.data_type === "enum" && (
                  <div style={{ gridColumn: "1 / -1", marginTop: -4 }}>
                    <input
                      placeholder="Opciones separadas por coma: Activo, Inactivo, Pendiente"
                      value={col.options}
                      onChange={(e) => updateCol(col.uid, { options: e.target.value })}
                      style={{ fontSize: 13 }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {cols.length === 0 && (
            <p style={{ color: "var(--color-text-muted)", fontSize: 13, textAlign: "center", padding: "16px 0" }}>
              Sin columnas — puedes agregar más tarde desde el dataset.
            </p>
          )}

          {/* Footer */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end",
            marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--color-border-light)" }}>
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

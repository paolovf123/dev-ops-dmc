import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDatasets, getColumns, createRecord } from "../api/datasets";
import type { ColumnDefinition } from "../types";

export default function RecordForm() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: getDatasets });
  const { data: columns = [], isLoading } = useQuery({
    queryKey: ["columns", datasetId],
    queryFn: () => getColumns(datasetId!),
  });

  const dataset = datasets.find((d) => d.id === datasetId);

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMut = useMutation({
    mutationFn: () => {
      const data: Record<string, unknown> = {};
      columns.forEach((col) => {
        const raw = formData[col.field_key] ?? "";
        if (raw === "") return;
        data[col.field_key] = col.data_type === "number" ? Number(raw) : raw;
      });
      return createRecord(datasetId!, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records", datasetId] });
      navigate(`/datasets/${datasetId}`);
    },
  });

  const setValue = (fieldKey: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldKey]: value }));
    if (errors[fieldKey]) setErrors((prev) => ({ ...prev, [fieldKey]: "" }));
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    columns.forEach((col) => {
      if (col.rules.required && !formData[col.field_key]?.trim()) {
        newErrors[col.field_key] = "Este campo es requerido";
      }
    });
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    createMut.mutate();
  };

  const inputFor = (col: ColumnDefinition) => {
    const val = formData[col.field_key] ?? "";
    const hasError = !!errors[col.field_key];
    const baseStyle: React.CSSProperties = hasError
      ? { borderColor: "var(--pm-red-500)", boxShadow: "0 0 0 3px rgba(229,62,62,.1)" }
      : {};

    if (col.data_type === "enum") {
      return (
        <select
          value={val}
          onChange={(e) => setValue(col.field_key, e.target.value)}
          style={baseStyle}
        >
          <option value="">— Seleccionar —</option>
          {(col.rules.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }

    const type =
      col.data_type === "number" ? "number"
      : col.data_type === "date" ? "date"
      : "text";

    return (
      <input
        type={type}
        value={val}
        onChange={(e) => setValue(col.field_key, e.target.value)}
        placeholder={col.rules.required ? `Requerido` : "Opcional"}
        style={baseStyle}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />
    );
  };

  if (isLoading) {
    return (
      <div style={{ padding: 40, color: "var(--color-text-muted)", textAlign: "center" }}>
        Cargando campos...
      </div>
    );
  }

  const requiredCols = columns.filter((c) => c.rules.required);
  const optionalCols = columns.filter((c) => !c.rules.required);

  return (
    <>
      {/* Header */}
      <header className="app-header">
        <button
          className="btn btn-ghost"
          onClick={() => navigate(`/datasets/${datasetId}`)}
          style={{ padding: "5px 8px", fontSize: 18 }}
          title="Volver"
        >
          ←
        </button>
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo" style={{ width: 28, height: 28, fontSize: 13, borderRadius: "var(--radius-xs)" }}>T</div>
          <span className="app-header-name">Trans<em>Excel</em></span>
        </button>
        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 6px" }} />
        <span style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
          {dataset?.name ?? "Dataset"}
        </span>
        <span style={{ fontSize: 14, color: "var(--color-text-muted)", margin: "0 6px" }}>›</span>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Nuevo registro</span>
      </header>

      <main className="page" style={{ maxWidth: 680 }}>
        <div className="card" style={{ padding: "28px 32px" }}>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ marginBottom: 4 }}>Nuevo registro</h2>
            <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
              Los campos marcados con <span style={{ color: "var(--pm-red-500)" }}>*</span> son obligatorios.
            </p>
          </div>

          {/* Required fields */}
          {requiredCols.length > 0 && (
            <>
              <p className="section-title" style={{ marginBottom: 16 }}>Campos requeridos</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0 24px" }}>
                {requiredCols.map((col) => (
                  <div key={col.id} className="form-group">
                    <label className="form-label">
                      {col.name}
                      <span style={{ color: "var(--pm-red-500)", marginLeft: 2 }}>*</span>
                      <span style={{ fontWeight: 400, color: "var(--color-text-muted)", marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>
                        {col.data_type}
                      </span>
                    </label>
                    {inputFor(col)}
                    {errors[col.field_key] && (
                      <span style={{ fontSize: 12, color: "var(--pm-red-500)", marginTop: 2 }}>
                        {errors[col.field_key]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Optional fields */}
          {optionalCols.length > 0 && (
            <>
              <div style={{ height: 1, background: "var(--color-border-light)", margin: "24px 0" }} />
              <p className="section-title" style={{ marginBottom: 16 }}>Campos opcionales</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0 24px" }}>
                {optionalCols.map((col) => (
                  <div key={col.id} className="form-group">
                    <label className="form-label">
                      {col.name}
                      <span style={{ fontWeight: 400, color: "var(--color-text-muted)", marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>
                        {col.data_type}
                      </span>
                    </label>
                    {inputFor(col)}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Footer */}
          <div style={{
            display: "flex", gap: 10, justifyContent: "flex-end",
            marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--color-border-light)",
          }}>
            <button
              className="btn btn-secondary"
              onClick={() => navigate(`/datasets/${datasetId}`)}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={createMut.isPending}
            >
              {createMut.isPending ? "Guardando..." : "Guardar registro"}
            </button>
          </div>

          {createMut.isError && (
            <p style={{ marginTop: 12, color: "var(--pm-red-500)", fontSize: 13, textAlign: "right" }}>
              Error al guardar. Verifica los datos e intenta de nuevo.
            </p>
          )}
        </div>
      </main>
    </>
  );
}

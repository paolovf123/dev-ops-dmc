import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useEscapeKey } from "../utils/useEscapeKey";

interface Props {
  currentDatasetId: string;
  currentDatasetName: string;
  onSave: (col: Omit<ColumnDefinition, "id" | "dataset_id" | "created_at">) => void;
  onClose: () => void;
}

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export default function LinkTableModal({ currentDatasetId, currentDatasetName, onSave, onClose }: Props) {
  const [targetId, setTargetId]       = useState("");
  const [colName, setColName]         = useState("");
  const [fieldKey, setFieldKey]       = useState("");
  const [displayField, setDisplayField] = useState("");
  useEscapeKey(onClose);

  const { current: workspace } = useWorkspace();
  const wsId = workspace?.id;

  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", wsId],
    queryFn: () => getDatasets(wsId ? { workspace_id: wsId } : undefined),
  });
  const { data: targetCols = [] } = useQuery({
    queryKey: ["columns", targetId],
    queryFn: () => getColumns(targetId),
    enabled: !!targetId,
  });

  const otherDatasets = datasets.filter((d) => d.id !== currentDatasetId && !d.is_computed);

  const handleTargetChange = (id: string) => {
    setTargetId(id);
    setDisplayField("");
    const ds = datasets.find((d) => d.id === id);
    if (ds) {
      const slug = toSlug(ds.name);
      setColName(`ID ${ds.name}`);
      setFieldKey(`id_${slug}`);
    } else {
      setColName("");
      setFieldKey("");
    }
  };

  const handleSave = () => {
    onSave({
      name: colName,
      field_key: fieldKey,
      data_type: "relation",
      rules: {
        related_dataset_id: targetId,
        ...(displayField ? { display_field: displayField } : {}),
      },
      position: 0,
    });
  };

  const saveDisabled = !targetId || !colName.trim() || !fieldKey.trim();

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-v2">
        <div className="modal-accent" style={{ background: "#DB2777" }} />

        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="modal-header-icon" style={{ background: "#DB277718", color: "#DB2777" }}>⇢</div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Vincular tabla</h3>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-text-muted)" }}>
                Agrega una columna FK en <strong>{currentDatasetName}</strong> que apunte a otro dataset
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Step 1 — target dataset */}
          <div className="form-group">
            <label className="form-label">Dataset destino</label>
            <select value={targetId} onChange={(e) => handleTargetChange(e.target.value)}>
              <option value="">— Seleccionar dataset —</option>
              {otherDatasets.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}</option>
              ))}
            </select>
            <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
              El dataset al que apuntará la FK
            </span>
          </div>

          {targetId && (
            <>
              {/* Step 2 — column name + field key */}
              <div className="form-group">
                <label className="form-label">Nombre visible de la columna FK</label>
                <input
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  placeholder="Ej. ID Persona"
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Field key
                  <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6, color: "var(--color-text-muted)" }}>
                    — identificador interno
                  </span>
                </label>
                <input
                  className="mono"
                  value={fieldKey}
                  onChange={(e) => setFieldKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                />
              </div>

              {/* Step 3 — display field */}
              <div className="form-group">
                <label className="form-label">Campo a mostrar como label en el dropdown</label>
                <select value={displayField} onChange={(e) => setDisplayField(e.target.value)}>
                  <option value="">— Mostrar ID (por defecto) —</option>
                  {targetCols.map((col) => (
                    <option key={col.id} value={col.field_key}>{col.name} ({col.field_key})</option>
                  ))}
                </select>
                <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                  El valor guardado siempre será el UUID del registro seleccionado
                </span>
              </div>

              {/* Preview */}
              <div style={{
                padding: "12px 14px", borderRadius: 8,
                background: "var(--color-bg-secondary)",
                border: "1px solid var(--color-border-light)",
                fontSize: 12, color: "var(--color-text-muted)",
              }}>
                <strong style={{ color: "var(--color-text)" }}>{currentDatasetName}</strong>
                <span style={{ margin: "0 6px" }}>.</span>
                <code style={{ fontFamily: "var(--font-mono)", color: "#DB2777" }}>{fieldKey || "id_…"}</code>
                <span style={{ margin: "0 8px" }}>⇢</span>
                <strong style={{ color: "var(--color-text)" }}>
                  {datasets.find((d) => d.id === targetId)?.name}
                </strong>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saveDisabled}>
            Crear columna FK
          </button>
        </div>
      </div>
    </div>
  );
}

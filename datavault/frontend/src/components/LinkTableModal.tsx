import { useState } from "react";
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, X, Check, ArrowRight } from "lucide-react";
import { getDatasets, getColumns } from "../api/datasets";
import type { ColumnDefinition } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useEscapeKey } from "../utils/useEscapeKey";
import { Btn, TONE } from "./ui/kit";

interface Props {
  currentDatasetId: string;
  currentDatasetName: string;
  onSave: (col: Omit<ColumnDefinition, "id" | "dataset_id" | "created_at">) => void;
  onClose: () => void;
}

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

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

const [REL_FG, REL_BG] = TONE.rel;

export default function LinkTableModal({ currentDatasetId, currentDatasetName, onSave, onClose }: Props) {
  const [targetId, setTargetId]         = useState("");
  const [colName, setColName]           = useState("");
  const [fieldKey, setFieldKey]         = useState("");
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
  const targetName = datasets.find((d) => d.id === targetId)?.name;

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
          width: "100%", maxWidth: 520, maxHeight: "90vh", display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-4)",
          boxShadow: "var(--shadow-4)", overflow: "hidden",
        }}
      >
        {/* Accent bar (tono relación) */}
        <div style={{ height: 3, background: REL_FG }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{
            display: "grid", placeItems: "center", width: 38, height: 38, flex: "none",
            borderRadius: "var(--r-2)", background: REL_BG, color: REL_FG,
          }}>
            <Link2 size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>Vincular tabla</div>
            <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3 }}>
              Agrega una columna FK en <strong style={{ color: "var(--text)" }}>{currentDatasetName}</strong> que apunte a otro dataset
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
        <div style={{ padding: 20, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Step 1 — target dataset */}
          <label style={{ display: "block" }}>
            <span style={fieldLabel}>Dataset destino</span>
            <select style={fieldInput} value={targetId} onChange={(e) => handleTargetChange(e.target.value)}>
              <option value="">— Seleccionar dataset —</option>
              {otherDatasets.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}</option>
              ))}
            </select>
            <span style={fieldHelp}>El dataset al que apuntará la FK</span>
          </label>

          {targetId && (
            <>
              {/* Step 2 — column name + field key */}
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Nombre visible de la columna FK</span>
                <input
                  style={fieldInput}
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  placeholder="Ej. ID Persona"
                />
              </label>

              <label style={{ display: "block" }}>
                <span style={fieldLabel}>
                  Field key
                  <span style={{ fontWeight: 400, color: "var(--text-mute)", marginLeft: 5 }}>— identificador interno</span>
                </span>
                <input
                  className="mono"
                  style={{ ...fieldInput, fontFamily: "var(--font-mono)", fontSize: 13 }}
                  value={fieldKey}
                  onChange={(e) => setFieldKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                />
              </label>

              {/* Step 3 — display field */}
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Campo a mostrar como label en el dropdown</span>
                <select style={fieldInput} value={displayField} onChange={(e) => setDisplayField(e.target.value)}>
                  <option value="">— Mostrar ID (por defecto) —</option>
                  {targetCols.map((col) => (
                    <option key={col.id} value={col.field_key}>{col.name} ({col.field_key})</option>
                  ))}
                </select>
                <span style={fieldHelp}>El valor guardado siempre será el UUID del registro seleccionado</span>
              </label>

              {/* Preview — Current.fk ⇢ Target */}
              <div style={{
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
                padding: "12px 14px", borderRadius: "var(--r-3)",
                background: REL_BG,
                border: `1px solid color-mix(in srgb, ${REL_FG} 30%, transparent)`,
              }}>
                <strong style={{ font: "600 13px/1 var(--font-sans)", color: "var(--text)" }}>{currentDatasetName}</strong>
                <code className="mono" style={{ font: "500 12.5px/1 var(--font-mono)", color: REL_FG }}>
                  .{fieldKey || "id_…"}
                </code>
                <ArrowRight size={15} color="var(--text-mute)" />
                <strong style={{ font: "600 13px/1 var(--font-sans)", color: "var(--text)" }}>{targetName}</strong>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px",
          borderTop: "1px solid var(--border)", background: "var(--surface-2)",
        }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" tone="rel" icon={<Check size={16} />} onClick={handleSave} disabled={saveDisabled}>
            Crear columna FK
          </Btn>
        </div>
      </div>
    </div>
  );
}

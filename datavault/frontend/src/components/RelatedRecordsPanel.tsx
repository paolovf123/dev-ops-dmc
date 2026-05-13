import { useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDatasets, getColumns, getRecords, createRecord } from "../api/datasets";
import type { ColumnDefinition, Record as DRecord } from "../types";
import { useWorkspace } from "../workspace/WorkspaceContext";

interface Props {
  parentDatasetId: string;
  parentRecord: DRecord;
  parentColumns: ColumnDefinition[];
  onClose: () => void;
}

interface ChildInfo {
  datasetId: string;
  datasetName: string;
  fkCol: string;
  columns: ColumnDefinition[];
}

export default function RelatedRecordsPanel({ parentDatasetId, parentRecord, parentColumns, onClose }: Props) {
  const qc = useQueryClient();
  const { current: workspace } = useWorkspace();
  const wsId = workspace?.id;

  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", wsId],
    queryFn: () => getDatasets(wsId ? { workspace_id: wsId } : undefined),
  });

  // Load columns for every other dataset to find children
  const otherIds = datasets.filter((d) => d.id !== parentDatasetId && !d.is_computed).map((d) => d.id);

  const colQueries = useQueries({
    queries: otherIds.map((dsId) => ({
      queryKey: ["columns", dsId],
      queryFn: () => getColumns(dsId),
      staleTime: 5 * 60_000,
    })),
  });

  // Detect child datasets
  const children: ChildInfo[] = [];
  otherIds.forEach((dsId, i) => {
    const cols = colQueries[i]?.data ?? [];
    const fkCol = cols.find(
      (c) => c.data_type === "relation" && c.rules.related_dataset_id === parentDatasetId
    );
    if (!fkCol) return;
    children.push({
      datasetId: dsId,
      datasetName: datasets.find((d) => d.id === dsId)?.name ?? dsId,
      fkCol: fkCol.field_key,
      columns: cols.filter((c) => c.id !== fkCol.id),
    });
  });

  // Get a human-readable label for the parent record
  const labelCol = parentColumns.find((c) => c.data_type === "text");
  const parentLabel = labelCol ? String(parentRecord.data[labelCol.field_key] ?? "") || parentRecord.id : parentRecord.id;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 440,
      background: "var(--color-bg)", boxShadow: "-4px 0 24px rgba(0,0,0,.12)",
      zIndex: 200, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "16px 20px",
        borderBottom: "1px solid var(--color-border)",
      }}>
        <span style={{ fontSize: 18 }}>⇢</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Registros relacionados</p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {parentLabel}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--color-text-muted)", padding: 4 }}
          title="Cerrar"
        >×</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {children.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-muted)" }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>⇢</p>
            <p style={{ fontSize: 13 }}>Ningún dataset tiene una columna de tipo Relación apuntando a este dataset.</p>
          </div>
        ) : (
          children.map((child) => (
            <ChildSection
              key={child.datasetId}
              child={child}
              parentRecordId={parentRecord.id}
              onCreated={() => {
                qc.invalidateQueries({ queryKey: ["records", child.datasetId] });
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Child Section ────────────────────────────────────────────────────────────

function ChildSection({
  child,
  parentRecordId,
  onCreated,
}: {
  child: ChildInfo;
  parentRecordId: string;
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Fetch existing child records linked to this parent
  const { data: allRecs } = useQuery({
    queryKey: ["records", child.datasetId, "fk-lookup"],
    queryFn: () => getRecords(child.datasetId, { limit: 1000 }),
    staleTime: 30_000,
  });
  const childRecs = (allRecs?.data ?? []).filter(
    (r) => String(r.data[child.fkCol] ?? "") === parentRecordId
  );

  // For relation columns inside child: pre-load related records
  const relCols = child.columns.filter(
    (c) => c.data_type === "relation" && c.rules.related_dataset_id
  );
  const relQueries = useQueries({
    queries: relCols.map((col) => ({
      queryKey: ["records", col.rules.related_dataset_id!, "fk-lookup"],
      queryFn: () => getRecords(col.rules.related_dataset_id!, { limit: 1000 }),
      staleTime: 60_000,
    })),
  });
  const relMap: Record<string, { id: string; label: string }[]> = {};
  relCols.forEach((col, i) => {
    const df = col.rules.display_field;
    relMap[col.rules.related_dataset_id!] = (relQueries[i]?.data?.data ?? []).map((r) => ({
      id: r.id,
      label: df && r.data[df] ? String(r.data[df]) : r.id,
    }));
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { [child.fkCol]: parentRecordId };
      child.columns.forEach((col) => {
        const raw = formData[col.field_key] ?? "";
        if (raw === "") return;
        payload[col.field_key] = col.data_type === "number" ? Number(raw) : raw;
      });
      return createRecord(child.datasetId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records", child.datasetId, "fk-lookup"] });
      onCreated();
      setFormData({});
      setShowForm(false);
    },
  });

  // Find the first text column to use as label for existing records
  const labelCol = child.columns.find((c) => c.data_type === "text");

  const inputFor = (col: ColumnDefinition) => {
    const val = formData[col.field_key] ?? "";
    const onChange = (v: string) => setFormData((p) => ({ ...p, [col.field_key]: v }));

    if (col.data_type === "relation") {
      const opts = relMap[col.rules.related_dataset_id!] ?? [];
      return (
        <select value={val} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 13 }}>
          <option value="">— Seleccionar —</option>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      );
    }
    if (col.data_type === "enum") {
      return (
        <select value={val} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 13 }}>
          <option value="">— Seleccionar —</option>
          {(col.rules.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    return (
      <input
        type={col.data_type === "number" ? "number" : col.data_type === "date" ? "date" : "text"}
        value={val}
        onChange={(e) => onChange(e.target.value)}
        placeholder={col.rules.required ? "Requerido" : "Opcional"}
        style={{ fontSize: 13 }}
      />
    );
  };

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{child.datasetName}</span>
          <span style={{
            fontSize: 11, padding: "2px 7px", borderRadius: 10,
            background: "var(--color-bg-secondary)", color: "var(--color-text-muted)",
          }}>
            {childRecs.length} registro{childRecs.length !== 1 ? "s" : ""}
          </span>
        </div>
        {!showForm && (
          <button
            className="btn btn-primary"
            style={{ fontSize: 12, padding: "4px 12px" }}
            onClick={() => setShowForm(true)}
          >
            + Agregar
          </button>
        )}
      </div>

      {/* Existing records */}
      {childRecs.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {childRecs.map((rec) => (
            <div key={rec.id} style={{
              padding: "8px 12px", borderRadius: 8,
              border: "1px solid var(--color-border-light)",
              marginBottom: 6, fontSize: 12, background: "var(--color-bg-secondary)",
            }}>
              {labelCol ? (
                <span style={{ fontWeight: 600 }}>{String(rec.data[labelCol.field_key] ?? "—")}</span>
              ) : (
                <span style={{ color: "var(--color-text-muted)", fontFamily: "monospace" }}>{rec.id.slice(0, 12)}…</span>
              )}
              {child.columns
                .filter((c) => c.id !== labelCol?.id && c.data_type !== "relation")
                .slice(0, 2)
                .map((c) => (
                  <span key={c.field_key} style={{ marginLeft: 8, color: "var(--color-text-muted)" }}>
                    {c.name}: {String(rec.data[c.field_key] ?? "—")}
                  </span>
                ))}
            </div>
          ))}
        </div>
      )}

      {/* Inline add form */}
      {showForm && (
        <div style={{
          padding: "14px", borderRadius: 8,
          border: "1px dashed var(--color-primary-border)",
          background: "var(--color-primary-bg)",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0 16px" }}>
            {child.columns.map((col) => (
              <div key={col.id} className="form-group" style={{ marginBottom: 10 }}>
                <label className="form-label" style={{ fontSize: 11 }}>
                  {col.name}
                  {col.rules.required && <span style={{ color: "var(--pm-red-500)", marginLeft: 2 }}>*</span>}
                </label>
                {inputFor(col)}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: "4px 12px" }}
              onClick={() => { setShowForm(false); setFormData({}); }}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, padding: "4px 12px" }}
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
          {saveMut.isError && (
            <p style={{ fontSize: 12, color: "var(--pm-red-500)", margin: "6px 0 0", textAlign: "right" }}>
              Error al guardar
            </p>
          )}
        </div>
      )}

      <div style={{ height: 1, background: "var(--color-border-light)", marginTop: 10 }} />
    </div>
  );
}

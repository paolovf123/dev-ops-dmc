import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRecords, restoreRecord, bulkDelete } from "../api/datasets";
import type { ColumnDefinition } from "../types";
import { useState } from "react";
import { useConfirm } from "./ConfirmDialog";

interface Props {
  datasetId: string;
  columns: ColumnDefinition[];
}

export default function TrashPanel({ datasetId, columns }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: deleted = [], isLoading } = useQuery({
    queryKey: ["records", datasetId, "trash"],
    queryFn: () => getRecords(datasetId, { include_deleted: true, limit: 1000 }).then((r) =>
      r.data.filter((rec) => rec.deleted_at != null)
    ),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["records", datasetId] });
    qc.invalidateQueries({ queryKey: ["records", datasetId, "trash"] });
    setSelected(new Set());
  };

  const restoreMut = useMutation({
    mutationFn: (id: string) => restoreRecord(datasetId, id),
    onSuccess: invalidate,
  });

  const bulkRestoreMut = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await restoreRecord(datasetId, id);
    },
    onSuccess: invalidate,
  });

  const permDeleteMut = useMutation({
    mutationFn: (ids: string[]) => bulkDelete(datasetId, ids),
    onSuccess: invalidate,
  });

  const toggleSelect = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = deleted.length > 0 && selected.size === deleted.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(deleted.map((r) => r.id)));

  if (isLoading) return <div className="trash-empty">Cargando...</div>;

  if (deleted.length === 0) {
    return (
      <div className="trash-empty">
        <span style={{ fontSize: 40 }}>🗑️</span>
        <p>La papelera está vacía</p>
        <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Los registros eliminados aparecerán aquí.
        </span>
      </div>
    );
  }

  const previewCols = columns.slice(0, 4);

  return (
    <div className="trash-panel">
      <div className="trash-toolbar">
        <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          {deleted.length} registro{deleted.length !== 1 ? "s" : ""} eliminado{deleted.length !== 1 ? "s" : ""}
        </span>
        {selected.size > 0 && (
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button className="btn btn-secondary"
              onClick={() => bulkRestoreMut.mutate([...selected])}
              disabled={bulkRestoreMut.isPending}>
              ♻ Restaurar ({selected.size})
            </button>
            <button className="btn btn-danger-ghost"
              onClick={async () => {
                const ok = await confirm({
                  title: `Eliminar ${selected.size} registro${selected.size !== 1 ? "s" : ""} permanentemente`,
                  message: "Esta acción no se puede deshacer. Los registros se borrarán para siempre.",
                  confirmLabel: "Eliminar definitivamente",
                  variant: "danger",
                });
                if (ok) permDeleteMut.mutate([...selected]);
              }}
              disabled={permDeleteMut.isPending}>
              × Eliminar definitivo
            </button>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              {previewCols.map((c) => <th key={c.id}>{c.name}</th>)}
              <th>Eliminado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {deleted.map((rec) => (
              <tr key={rec.id} style={{ opacity: 0.7 }}>
                <td>
                  <input type="checkbox"
                    checked={selected.has(rec.id)}
                    onChange={() => toggleSelect(rec.id)} />
                </td>
                {previewCols.map((c) => (
                  <td key={c.id} style={{ color: "var(--color-text-secondary)" }}>
                    {String(rec.data[c.field_key] ?? "—")}
                  </td>
                ))}
                <td style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {rec.deleted_at ? new Date(rec.deleted_at).toLocaleDateString("es-PE") : "—"}
                </td>
                <td>
                  <button className="btn btn-ghost"
                    style={{ fontSize: 12, padding: "3px 10px", color: "var(--color-primary)" }}
                    onClick={() => restoreMut.mutate(rec.id)}
                    disabled={restoreMut.isPending}>
                    ♻ Restaurar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

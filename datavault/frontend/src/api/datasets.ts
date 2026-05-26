import api from "./client";
import type { Dataset, ColumnDefinition, Record as DRecord, DatasetPermission, DatasetGroupPermission, ComputeResult } from "../types";

// Datasets
export const getDatasets = (params?: { workspace_id?: string }) =>
  api.get<Dataset[]>("/datasets", { params }).then((r) => r.data);
export const createDataset = (
  name: string,
  description?: string,
  computed?: { is_computed: true; source_code: string; source_dataset_ids: string[] }
) =>
  api.post<Dataset>("/datasets", { name, description, ...(computed ?? {}) }).then((r) => r.data);
export const updateDataset = (id: string, body: { name?: string; description?: string; source_code?: string; source_dataset_ids?: string[] }) =>
  api.patch<Dataset>(`/datasets/${id}`, body).then((r) => r.data);
export const deleteDataset = (id: string) => api.delete(`/datasets/${id}`);

// Computed datasets
export const computeDataset = (id: string) =>
  api.post<ComputeResult>(`/datasets/${id}/compute`).then((r) => r.data);

// Columns
export const getColumns = (datasetId: string) =>
  api.get<ColumnDefinition[]>(`/datasets/${datasetId}/columns`).then((r) => r.data);
export const createColumn = (datasetId: string, body: Omit<ColumnDefinition, "id" | "dataset_id" | "created_at">) =>
  api.post<ColumnDefinition>(`/datasets/${datasetId}/columns`, body).then((r) => r.data);
export const updateColumn = (datasetId: string, columnId: string, body: Partial<ColumnDefinition>) =>
  api.patch<ColumnDefinition>(`/datasets/${datasetId}/columns/${columnId}`, body).then((r) => r.data);
export const deleteColumn = (datasetId: string, columnId: string) =>
  api.delete(`/datasets/${datasetId}/columns/${columnId}`);

// Records
export const getRecords = (
  datasetId: string,
  params?: { search?: string; include_deleted?: boolean; skip?: number; limit?: number; cursor?: string }
) =>
  api.get<DRecord[]>(`/datasets/${datasetId}/records`, { params }).then((r) => ({
    data: r.data,
    total: parseInt(r.headers["x-total-count"] ?? "0", 10),
    nextCursor: (r.headers["x-next-cursor"] as string | undefined) ?? null,
  }));
export const createRecord = (datasetId: string, data: Record<string, unknown>) =>
  api.post<DRecord>(`/datasets/${datasetId}/records`, { data }).then((r) => r.data);
export const updateRecord = (datasetId: string, recordId: string, data: Record<string, unknown>) =>
  api.patch<DRecord>(`/datasets/${datasetId}/records/${recordId}`, { data }).then((r) => r.data);
export const deleteRecord = (datasetId: string, recordId: string) =>
  api.delete(`/datasets/${datasetId}/records/${recordId}`);
export const restoreRecord = (datasetId: string, recordId: string) =>
  api.post<DRecord>(`/datasets/${datasetId}/records/${recordId}/restore`).then((r) => r.data);
export const bulkDelete = (datasetId: string, ids: string[]) =>
  api.post(`/datasets/${datasetId}/records/bulk-delete`, { ids });
export const getRecordHistory = (datasetId: string, recordId: string) =>
  api.get<ChangeHistoryEntry[]>(`/datasets/${datasetId}/records/${recordId}/history`).then((r) => r.data);
export const importCsv = (
  datasetId: string,
  file: File,
  opts?: { dedupe_on?: string[] }
) => {
  const form = new FormData();
  form.append("file", file);
  const params: Record<string, string> = {};
  if (opts?.dedupe_on && opts.dedupe_on.length > 0) {
    params.dedupe_on = opts.dedupe_on.join(",");
  }
  return api.post<{
    created: number;
    skipped_duplicates?: number;
    errors: { row: number; errors: string[] }[];
  }>(
    `/datasets/${datasetId}/records/import-excel`, form,
    { headers: { "Content-Type": "multipart/form-data" }, params }
  ).then((r) => r.data);
};

// Permissions (user-level)
export const getDatasetPermissions = (datasetId: string) =>
  api.get<DatasetPermission[]>(`/datasets/${datasetId}/permissions`).then((r) => r.data);
export const setDatasetPermission = (datasetId: string, userId: string, role: string) =>
  api.put<DatasetPermission>(`/datasets/${datasetId}/permissions`, { user_id: userId, role }).then((r) => r.data);
export const removeDatasetPermission = (datasetId: string, userId: string) =>
  api.delete(`/datasets/${datasetId}/permissions/${userId}`);

// Permissions (group-level)
export const getDatasetGroupPermissions = (datasetId: string) =>
  api.get<DatasetGroupPermission[]>(`/datasets/${datasetId}/permissions/groups`).then((r) => r.data);
export const setDatasetGroupPermission = (datasetId: string, groupId: string, role: string) =>
  api.put<DatasetGroupPermission>(`/datasets/${datasetId}/permissions/groups`, { group_id: groupId, role }).then((r) => r.data);
export const removeDatasetGroupPermission = (datasetId: string, groupId: string) =>
  api.delete(`/datasets/${datasetId}/permissions/groups/${groupId}`);

export interface ImportDatasetResult {
  dataset_id: string;
  dataset_name: string;
  columns_created: number;
  records_created: number;
}

export const importDatasetFromExcel = (
  file: File,
  opts?: { workspace_id?: string; name?: string; sheet?: string },
) => {
  const form = new FormData();
  form.append("file", file);
  const params: Record<string, string> = {};
  if (opts?.workspace_id) params.workspace_id = opts.workspace_id;
  if (opts?.name) params.name = opts.name;
  if (opts?.sheet) params.sheet = opts.sheet;
  return api
    .post<ImportDatasetResult>("/datasets/import-from-excel", form, {
      headers: { "Content-Type": "multipart/form-data" },
      params,
    })
    .then((r) => r.data);
};

export interface ExcelPreviewColumn {
  header: string;
  field_key: string;
  data_type: string;
  options?: string[];
}

export interface ExcelPreviewSheet {
  name: string;
  row_count: number;
  columns: ExcelPreviewColumn[];
}

export interface ExcelPreview {
  filename: string;
  sheets: ExcelPreviewSheet[];
}

export const previewExcelImport = (file: File): Promise<ExcelPreview> => {
  const form = new FormData();
  form.append("file", file);
  return api
    .post<ExcelPreview>("/datasets/import-from-excel/preview", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

export interface ImportMultiResult {
  imported: Array<{
    sheet: string;
    dataset_id: string;
    dataset_name: string;
    columns_created: number;
    records_created: number;
  }>;
}

export const importDatasetsFromExcelMulti = (
  file: File,
  sheets: Array<{ sheet: string; name: string }>,
  workspaceId?: string,
): Promise<ImportMultiResult> => {
  const form = new FormData();
  form.append("file", file);
  form.append(
    "payload",
    JSON.stringify({ workspace_id: workspaceId ?? null, sheets }),
  );
  return api
    .post<ImportMultiResult>("/datasets/import-from-excel/multi", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

export interface RelationCandidate {
  from_dataset_id: string;
  from_dataset_name: string;
  from_column_id: string;
  from_column: string;
  from_column_label: string;
  from_column_type: string;
  to_dataset_id: string;
  to_dataset_name: string;
  to_field: string;
  name_match: boolean;
  content_match_ratio: number;
  content_matched: number;
  values_sampled: number;
  score: number;
  sample_values: string[];
}

export interface RelationScanResult {
  scanned: number;
  candidates: RelationCandidate[];
}

export const scanRelationships = (workspaceId?: string): Promise<RelationScanResult> =>
  api
    .get<RelationScanResult>("/datasets/relationships/scan", {
      params: workspaceId ? { workspace_id: workspaceId } : {},
    })
    .then((r) => r.data);

export interface DatasetTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  columns_count: number;
  sample_rows_count: number;
}

export const listDatasetTemplates = (): Promise<DatasetTemplate[]> =>
  api.get<DatasetTemplate[]>("/datasets/templates/catalog").then((r) => r.data);

export const createDatasetFromTemplate = (
  templateId: string,
  opts: { workspace_id?: string; name?: string; include_sample?: boolean },
): Promise<{ id: string; name: string }> =>
  api
    .post(`/datasets/templates/${templateId}`, null, {
      params: {
        ...(opts.workspace_id ? { workspace_id: opts.workspace_id } : {}),
        ...(opts.name ? { name: opts.name } : {}),
        ...(opts.include_sample !== undefined ? { include_sample: opts.include_sample } : {}),
      },
    })
    .then((r) => r.data);

export interface ChangeHistoryEntry {
  id: string;
  field_key: string | null;
  old_value: string | null;
  new_value: string | null;
  action: string;
  changed_at: string;
}

export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  workspace_id: string | null;
  is_computed: boolean;
  source_code: string | null;
  source_dataset_ids: string[];
  last_computed_at: string | null;
}

export interface ColumnDefinition {
  id: string;
  dataset_id: string;
  name: string;
  field_key: string;
  data_type:
    | "text" | "number" | "date" | "enum" | "boolean" | "relation"
    | "url" | "email" | "phone" | "long_text" | "multiselect" | "rating" | "currency" | "percent";
  rules: {
    required?: boolean;
    min?: number;
    max?: number;
    options?: string[];
    related_dataset_id?: string;
    display_field?: string;
    currency_symbol?: string;
    max_rating?: number;
  };
  position: number;
  created_at: string;
}

export interface Record {
  id: string;
  dataset_id: string;
  data: { [key: string]: unknown };
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FormulaColDef {
  uid: string;
  name: string;
  formula: string;
}

export interface JoinedColDef {
  uid: string;
  sourceDatasetId: string;
  sourceDatasetName: string;
  localFkKey: string;   // campo local que tiene el valor FK
  sourcePkKey: string;  // campo del dataset origen que se usa como clave
  displayKey: string;   // campo del dataset origen a mostrar
  displayName: string;  // etiqueta del header
}

// ── Groups ────────────────────────────────────────────────────────────────────

export interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
}

export interface GroupMember {
  user_id: string;
  email: string;
  username: string;
  role: string;
}

// ── Permissions ───────────────────────────────────────────────────────────────

export interface DatasetPermission {
  id: string;
  dataset_id: string;
  user_id: string;
  role: string;
  user_email?: string;
  user_name?: string;
}

export interface DatasetGroupPermission {
  id: string;
  dataset_id: string;
  group_id: string;
  role: string;
  group_name?: string;
}

// ── Compute ───────────────────────────────────────────────────────────────────

export interface ComputeResult {
  records_created: number;
  columns_created: number;
  last_computed_at: string;
}

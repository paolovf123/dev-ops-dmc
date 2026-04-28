export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ColumnDefinition {
  id: string;
  dataset_id: string;
  name: string;
  field_key: string;
  data_type: "text" | "number" | "date" | "enum" | "boolean";
  rules: {
    required?: boolean;
    min?: number;
    max?: number;
    options?: string[];
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

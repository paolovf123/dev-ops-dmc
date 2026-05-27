// Lógica compartida de detección de relaciones FK entre datasets.
// Centraliza lo que antes estaba duplicado (con variantes inconsistentes) en
// GlobalSchemaDiagram, SchemaDiagram, RelatedDatasets y ColumnPanel.
import type { ColumnDefinition } from "../types";

/** Normaliza un nombre de dataset: lowercase + espacios → guiones bajos. */
export function normalize(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_");
}

/** Última palabra del nombre normalizado (keyword usado para matching de FK). */
export function keyword(name: string): string {
  const parts = normalize(name).split("_");
  return parts[parts.length - 1];
}

/**
 * ¿El field_key parece una FK que apunta a un dataset cuyo keyword es `kw`?
 * Matcher ANCLADO — evita falsos positivos del antiguo `includes()` laxo
 * (ej. "id_pedido" no debe matchear kw="id").
 */
export function fkMatchesKeyword(fieldKey: string, kw: string): boolean {
  if (!kw) return false;
  const k = fieldKey.toLowerCase();
  return (
    k === `id_${kw}` ||
    k === `cod_${kw}` ||
    k === `codigo_${kw}` ||
    k === `${kw}_id` ||
    k.startsWith(`${kw}_`) ||
    k.endsWith(`_${kw}`)
  );
}

/**
 * ¿El nombre del dataset corresponde al keyword `refKw` extraído de una FK
 * (lo que queda después de "id_")? Tolerante a sufijo/prefijo.
 */
export function datasetMatchesRef(datasetName: string, refKw: string): boolean {
  const n = normalize(datasetName);
  return (
    keyword(datasetName) === refKw ||
    n === refKw ||
    n.endsWith(`_${refKw}`) ||
    n.startsWith(`${refKw}_`)
  );
}

export interface DatasetRef {
  id: string;
  name: string;
}

export interface DetectedRelation {
  ds: DatasetRef;
  fkKey: string;
}

/**
 * Detecta una FK (relation confirmada o columna `id_<kw>` heurística) en una
 * columna, devolviendo el dataset destino. Null si no es FK.
 */
export function resolveColumnTarget(
  col: ColumnDefinition,
  otherDatasets: DatasetRef[],
  byId: Map<string, DatasetRef>,
): DatasetRef | undefined {
  if (col.data_type === "relation" && col.rules?.related_dataset_id) {
    return byId.get(col.rules.related_dataset_id);
  }
  if (col.field_key.startsWith("id_")) {
    const refKw = col.field_key.slice(3);
    return otherDatasets.find((d) => datasetMatchesRef(d.name, refKw));
  }
  return undefined;
}

/** PADRES: columnas del dataset actual que apuntan a otros datasets. */
export function detectParentRelations(
  currentColumns: ColumnDefinition[],
  otherDatasets: DatasetRef[],
): DetectedRelation[] {
  const byId = new Map(otherDatasets.map((d) => [d.id, d]));
  const out: DetectedRelation[] = [];
  for (const c of currentColumns) {
    const ds = resolveColumnTarget(c, otherDatasets, byId);
    if (ds) out.push({ ds, fkKey: c.field_key });
  }
  return out;
}

/**
 * HIJOS: datasets cuyas columnas apuntan al dataset actual.
 * `colsOf(dsId)` devuelve las columnas de un dataset dado.
 */
export function detectChildRelations(
  currentDatasetId: string,
  currentDatasetName: string,
  otherDatasets: DatasetRef[],
  colsOf: (dsId: string) => ColumnDefinition[],
): DetectedRelation[] {
  const curKw = keyword(currentDatasetName);
  const out: DetectedRelation[] = [];
  for (const ds of otherDatasets) {
    const cols = colsOf(ds.id);
    const fkCol = cols.find((c) => {
      if (c.data_type === "relation" && c.rules?.related_dataset_id === currentDatasetId) return true;
      return fkMatchesKeyword(c.field_key, curKw);
    });
    if (fkCol) out.push({ ds, fkKey: fkCol.field_key });
  }
  return out;
}

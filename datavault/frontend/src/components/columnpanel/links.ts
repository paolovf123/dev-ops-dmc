// Detección de vínculos (joins) entre el dataset actual y el seleccionado.
// Lógica pura usada por ColumnPanel; los tipos los consume también JoinsTab.
import type { ColumnDefinition } from "../../types";
import { keyword, fkMatchesKeyword } from "../../utils/relations";

// Un vínculo detectado entre el dataset actual y el seleccionado.
export type DetectedLink = {
  localKey: string;
  srcKey: string;
  type: "forward" | "reverse" | "bridge";
  label: string;       // texto descriptivo
  confirmed: boolean;  // true si la columna ya es data_type=relation
  via?: {              // solo para type="bridge"
    bridgeDatasetId: string;
    bridgeDatasetName: string;
    bridgeFkToLocal: string;
    bridgeFkToSource: string;
  };
};

export interface BridgeWithCols { id: string; name: string; cols: ColumnDefinition[]; }

/**
 * Detecta TODOS los vínculos posibles entre el dataset actual y el seleccionado:
 *  - forward: columna local que apunta al seleccionado (relation explícita o id_<kw>)
 *  - reverse: columna del seleccionado que apunta aquí (relation explícita o id_<curKw>)
 *  - bridge:  tabla intermedia con relation a ambos → join N:N vía esa tabla
 */
export function detectJoinLinks(p: {
  selectedDsId: string;
  selectedDsName: string;
  currentDatasetId: string;
  currentDatasetName: string;
  columns: ColumnDefinition[];
  srcColumns: ColumnDefinition[];
  bridges: BridgeWithCols[];
}): DetectedLink[] {
  const curKw = keyword(p.currentDatasetName);
  const srcKw = keyword(p.selectedDsName);
  const out: DetectedLink[] = [];
  const seenKey = new Set<string>(); // dedupe por (type + localKey + srcKey)

  const push = (l: DetectedLink) => {
    const k = `${l.type}|${l.localKey}|${l.srcKey}`;
    if (!seenKey.has(k)) { seenKey.add(k); out.push(l); }
  };

  // FORWARD — columnas locales relation apuntando al destino. Si la relación tiene
  // display_field, la unión usa ese campo del destino (no __id__).
  for (const c of p.columns) {
    if (c.data_type === "relation" && c.rules?.related_dataset_id === p.selectedDsId) {
      const df = c.rules?.display_field;
      push({
        localKey: c.field_key, srcKey: df && df !== "__id__" ? df : "__id__",
        type: "forward", confirmed: true,
        label: `${c.name} (relación confirmada)`,
      });
    }
  }
  // FORWARD — columnas locales id_<srcKw> (heurístico)
  if (srcKw) {
    for (const c of p.columns) {
      if (c.data_type === "relation") continue;
      if (fkMatchesKeyword(c.field_key, srcKw)) {
        push({
          localKey: c.field_key, srcKey: "__id__",
          type: "forward", confirmed: false,
          label: `${c.name} → ${p.selectedDsName} (por nombre)`,
        });
      }
    }
  }

  // REVERSE — columnas del source relation apuntando a este dataset.
  for (const c of p.srcColumns) {
    if (c.data_type === "relation" && c.rules?.related_dataset_id === p.currentDatasetId) {
      const df = c.rules?.display_field;
      push({
        localKey: df && df !== "__id__" ? df : "__id__", srcKey: c.field_key,
        type: "reverse", confirmed: true,
        label: `${p.selectedDsName}.${c.name} apunta aquí (confirmada)`,
      });
    }
  }
  if (curKw) {
    for (const c of p.srcColumns) {
      if (c.data_type === "relation") continue;
      if (fkMatchesKeyword(c.field_key, curKw)) {
        push({
          localKey: "__id__", srcKey: c.field_key,
          type: "reverse", confirmed: false,
          label: `${p.selectedDsName}.${c.name} (por nombre)`,
        });
      }
    }
  }

  // BRIDGE — tabla intermedia con relation a ambos lados → join N:N vía esa tabla.
  for (const bridge of p.bridges) {
    const fkToLocal = bridge.cols.find(
      (c) => c.data_type === "relation" && c.rules?.related_dataset_id === p.currentDatasetId,
    );
    const fkToSrc = bridge.cols.find(
      (c) => c.data_type === "relation" && c.rules?.related_dataset_id === p.selectedDsId,
    );
    if (fkToLocal && fkToSrc) {
      out.push({
        localKey: "__id__", srcKey: "__id__",
        type: "bridge", confirmed: true,
        label: `Vía ${bridge.name} (tabla intermedia N:N)`,
        via: {
          bridgeDatasetId: bridge.id,
          bridgeDatasetName: bridge.name,
          bridgeFkToLocal: fkToLocal.field_key,
          bridgeFkToSource: fkToSrc.field_key,
        },
      });
    }
  }

  // Orden: confirmadas primero, luego forward, luego reverse/bridge
  out.sort((a, b) => {
    if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
    if (a.type !== b.type) return a.type === "forward" ? -1 : 1;
    return 0;
  });
  return out;
}

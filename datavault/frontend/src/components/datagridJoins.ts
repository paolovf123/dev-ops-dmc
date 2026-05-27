// Construcción de columnas "join" (ExtraColumn) para el DataGrid a partir de un
// JoinedColDef y los registros del source/bridge. Lógica pura extraída de
// DatasetView (modelo N:N: las FK son arrays JSONB).
import type { JoinedColDef } from "../types";
import type { ExtraColumn, JoinLookup } from "./DataGrid";

interface JRec { id: string; data: Record<string, unknown>; }

/** Desempaqueta una celda a sus valores string (arrays N:N o escalares legacy). */
function cellValues(v: unknown): string[] {
  if (Array.isArray(v)) return (v as unknown[]).map((x) => String(x)).filter(Boolean);
  if (v == null || v === "") return [];
  return [String(v)];
}

/**
 * Construye la ExtraColumn para un join. Si `def.via` está presente es un join
 * N:N vía tabla intermedia (lookup en 2 pasos); si no, es un join directo cuyo
 * lookup entiende claves de array serializadas por el DataGrid.
 */
export function buildExtraColumn(
  def: JoinedColDef,
  sourceRecs: JRec[],
  bridgeRecs: JRec[],
  onRemove: () => void,
): ExtraColumn {
  if (def.via) {
    // Bridge join (N:N): bridge.fkToLocal → currentRow.id, bridge.fkToSource → sourceRow.id
    const srcById = new Map(sourceRecs.map((r) => [r.id, String(r.data[def.displayKey] ?? "")]));
    const fkLocal = def.via.bridgeFkToLocal;
    const fkSrc = def.via.bridgeFkToSource;
    // currentRow.id → array de sourceIds referenciados por el bridge
    const bridgeByLocal = new Map<string, string[]>();
    for (const b of bridgeRecs) {
      const localRefs = cellValues(b.data[fkLocal]);
      const srcRefs = cellValues(b.data[fkSrc]);
      if (localRefs.length === 0 || srcRefs.length === 0) continue;
      for (const localRef of localRefs) {
        const arr = bridgeByLocal.get(localRef) ?? [];
        for (const s of srcRefs) arr.push(s);
        bridgeByLocal.set(localRef, arr);
      }
    }
    // lookup mapea currentRow.id → lista de displays del source unidos
    const lookup = new Map<string, string>();
    bridgeByLocal.forEach((srcIds, localRef) => {
      const values = srcIds.map((id) => srcById.get(id) ?? "").filter(Boolean);
      lookup.set(localRef, values.join(", "));
    });
    return {
      uid: def.uid,
      header: `${def.sourceDatasetName} › ${def.displayName} (vía ${def.via.bridgeDatasetName})`,
      fkKey: def.localFkKey,
      lookup,
      onRemove,
    };
  }

  // Join directo. El localFkKey puede ser array (relation N:N) o escalar (legacy/code).
  const sourceLookup = new Map<string, string>(
    sourceRecs.map((r) => [
      def.sourcePkKey === "__id__" || def.sourcePkKey === "id"
        ? r.id
        : String(r.data[def.sourcePkKey] ?? ""),
      String(r.data[def.displayKey] ?? ""),
    ])
  );
  // Lookup que entiende arrays: DataGrid serializa rec.data[fkKey] cuando es array
  // → "[\"Y00313\",\"Y00421\"]". Detectamos ese patrón y devolvemos los displays
  // unidos; para escalares delegamos en sourceLookup.
  const lookup: JoinLookup = {
    get(key: string): string | undefined {
      if (key.startsWith("[") && key.endsWith("]")) {
        try {
          const items = JSON.parse(key);
          if (Array.isArray(items)) {
            const vals = items.map((it) => sourceLookup.get(String(it))).filter(Boolean);
            return vals.length > 0 ? vals.join(", ") : undefined;
          }
        } catch { /* noop */ }
      }
      return sourceLookup.get(key);
    },
  };
  return {
    uid: def.uid,
    header: `${def.sourceDatasetName} › ${def.displayName}`,
    fkKey: def.localFkKey,
    lookup,
    onRemove,
  };
}

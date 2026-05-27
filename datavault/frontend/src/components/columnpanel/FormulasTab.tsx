import type { ColumnDefinition, FormulaColDef } from "../../types";
import { FORMULA_HELP } from "../../utils/formula";

interface Props {
  columns: ColumnDefinition[];
  formulaCols: FormulaColDef[];
  fName: string;
  setFName: (v: string) => void;
  fFormula: string;
  setFFormula: (updater: string | ((prev: string) => string)) => void;
  showHelp: boolean;
  setShowHelp: (updater: boolean | ((v: boolean) => boolean)) => void;
  editingUid: string | null;
  setEditingUid: (v: string | null) => void;
  formulaPreview: string | number | null;
  handleAddFormula: () => void;
  startEditFormula: (fc: FormulaColDef) => void;
  onRemoveFormula: (uid: string) => void;
}

/** Tab "Fórmulas": columnas calculadas con vista previa en vivo. */
export default function FormulasTab({
  columns, formulaCols, fName, setFName, fFormula, setFFormula,
  showHelp, setShowHelp, editingUid, setEditingUid,
  formulaPreview, handleAddFormula, startEditFormula, onRemoveFormula,
}: Props) {
  return (
    <>
      {formulaCols.length > 0 && (
        <>
          <div className="panel-section"><span className="panel-section-label">Columnas calculadas</span></div>
          {formulaCols.map((fc) => (
            <div key={fc.uid} style={{ display: "flex", alignItems: "center", gap: 6,
              padding: "7px 16px", borderBottom: "1px solid var(--color-border-light)" }}>
              <span style={{ fontSize: 13, flex: 1, minWidth: 0 }}>
                <span className="formula-badge-small">ƒ</span>
                {" "}{fc.name}
                <span style={{ display: "block", fontSize: 11, fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)", marginTop: 1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  ={fc.formula}
                </span>
              </span>
              <button className="btn btn-ghost" style={{ padding: "3px 6px", fontSize: 12 }}
                onClick={() => startEditFormula(fc)}>✏️</button>
              <button className="btn btn-danger-ghost" style={{ padding: "2px 6px", fontSize: 13 }}
                onClick={() => { if (editingUid === fc.uid) { setFName(""); setFFormula(""); setEditingUid(null); } onRemoveFormula(fc.uid); }}>×</button>
            </div>
          ))}
          <div className="panel-divider" />
        </>
      )}

      <div className="panel-section">
        <span className="panel-section-label">
          {editingUid ? "Editar fórmula" : "Nueva columna calculada"}
        </span>
      </div>

      <div className="panel-form">
        {/* Column references */}
        {columns.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <span className="panel-form-label" style={{ display: "block", marginBottom: 5 }}>
              Campos disponibles (clic para insertar)
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {columns.map(c => (
                <button key={c.id}
                  style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-xs)", fontSize: 11, padding: "2px 7px",
                    cursor: "pointer", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)",
                    transition: "background 0.12s" }}
                  onClick={() => setFFormula(prev => prev + (prev && !prev.endsWith('(') && !prev.endsWith(' ') ? ' ' : '') + c.field_key)}
                  title={`${c.name} (${c.data_type})`}
                >
                  {c.field_key}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="panel-form-row">
          <span className="panel-form-label">Nombre de la columna</span>
          <input placeholder="Ej. Monto total" value={fName} onChange={e => setFName(e.target.value)} />
        </div>

        <div className="panel-form-row">
          <span className="panel-form-label">Fórmula</span>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
              color: "var(--pm-violet-500)", fontWeight: 700, fontSize: 14, pointerEvents: "none" }}>
              =
            </span>
            <input
              placeholder="precio * cantidad"
              value={fFormula}
              onChange={e => setFFormula(e.target.value)}
              style={{ paddingLeft: 22, fontFamily: "var(--font-mono)", fontSize: 13 }}
            />
          </div>
        </div>

        {/* Live preview */}
        {fFormula && (
          <div style={{ marginBottom: 10, padding: "7px 10px", borderRadius: "var(--radius-sm)",
            background: formulaPreview !== null && !String(formulaPreview).startsWith('#')
              ? "var(--pm-green-50)" : String(formulaPreview ?? '').startsWith('#')
              ? "var(--pm-red-50)" : "var(--color-bg)",
            border: `1px solid ${formulaPreview !== null && !String(formulaPreview).startsWith('#')
              ? "var(--pm-green-100)" : "var(--color-border)"}` }}>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 2 }}>
              Vista previa (1er registro):
            </span>
            <span style={{ fontSize: 13, fontWeight: 600,
              color: String(formulaPreview ?? '').startsWith('#') ? "var(--pm-red-500)" : "var(--color-text)",
              fontFamily: "var(--font-mono)" }}>
              {formulaPreview === null
                ? <span style={{ color: "var(--color-text-muted)" }}>— (sin datos)</span>
                : String(formulaPreview)}
            </span>
          </div>
        )}

        <button className="btn btn-primary" onClick={handleAddFormula}
          disabled={!fName.trim() || !fFormula.trim()}
          style={{ width: "100%", justifyContent: "center",
            background: "linear-gradient(135deg, #7C3AED, #6366F1)",
            borderColor: "#7C3AED" }}>
          <span>ƒ</span>
          {editingUid ? " Guardar cambios" : " Agregar columna calculada"}
        </button>
        {editingUid && (
          <button className="btn btn-ghost"
            style={{ width: "100%", justifyContent: "center", marginTop: 4, fontSize: 12 }}
            onClick={() => { setFName(""); setFFormula(""); setEditingUid(null); }}>
            Cancelar edición
          </button>
        )}

        {/* Function reference */}
        <button
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11,
            color: "var(--color-text-muted)", padding: "8px 0 0", textDecoration: "underline", textAlign: "left" }}
          onClick={() => setShowHelp(v => !v)}
        >
          {showHelp ? "▲ Ocultar" : "▼ Ver"} funciones disponibles
        </button>

        {showHelp && (
          <div style={{ marginTop: 8, fontSize: 11, background: "var(--color-bg)",
            border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
            {FORMULA_HELP.map(cat => (
              <div key={cat.cat} style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>
                  {cat.cat}
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {cat.fns.map(fn => (
                    <code key={fn}
                      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)",
                        borderRadius: 3, padding: "1px 5px", fontSize: 10, cursor: "pointer",
                        color: "var(--pm-violet-600)" }}
                      onClick={() => {
                        const fnName = fn.split('(')[0];
                        setFFormula(prev => prev + (prev ? ' ' : '') + fnName + '(');
                      }}
                    >{fn}</code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

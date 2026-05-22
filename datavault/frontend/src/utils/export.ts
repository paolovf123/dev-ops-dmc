import * as XLSX from 'xlsx';
import type { ColumnDefinition, Record as DRecord } from '../types';
import type { ExtraColumn } from '../components/DataGrid';
import type { FormulaColDef } from '../types';
import { evalFormula } from './formula';

function cellStr(v: unknown): string {
  if (v == null) return '';
  return String(v);
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface ExportOptions {
  datasetName: string;
  columns: ColumnDefinition[];
  records: DRecord[];
  extraColumns?: ExtraColumn[];
  formulaCols?: FormulaColDef[];
}

function buildRows(opts: ExportOptions): { headers: string[]; rows: (string | number | null)[][] } {
  const { columns, records, extraColumns = [], formulaCols = [] } = opts;
  const headers = [
    ...columns.map(c => c.name),
    ...extraColumns.map(ec => ec.header),
    ...formulaCols.map(fc => fc.name),
  ];
  const rows = records.map(rec => [
    ...columns.map(col => {
      const v = rec.data[col.field_key];
      if (v == null) return null;
      if (col.data_type === 'number') return parseFloat(String(v)) || null;
      return cellStr(v);
    }),
    ...extraColumns.map(ec => ec.lookup.get(String(rec.data[ec.fkKey] ?? '')) ?? null),
    ...formulaCols.map(fc => {
      const result = evalFormula(fc.formula, rec.data as Record<string, unknown>);
      if (result === null || result === '#ERROR') return null;
      return result;
    }),
  ]);
  return { headers, rows };
}

export function exportCsv(opts: ExportOptions) {
  const { headers, rows } = buildRows(opts);
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map(row => row.map(v => csvEscape(cellStr(v))).join(',')),
  ];
  // BOM for Excel UTF-8 compatibility
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${opts.datasetName}.csv`);
}

// Excel number-format strings per column type
function numFmtFor(col: ColumnDefinition | undefined): string | undefined {
  if (!col) return undefined;
  switch (col.data_type) {
    case 'currency': {
      const sym = (col.rules.currency_symbol ?? '$').replace(/"/g, '');
      return `"${sym}"#,##0.00`;
    }
    case 'percent':  return '0.00"%"';
    case 'number':   return '#,##0.###############';
    case 'date':     return 'yyyy-mm-dd';
    default:         return undefined;
  }
}

export function exportExcel(opts: ExportOptions) {
  const { columns, extraColumns = [], formulaCols = [] } = opts;
  const { headers, rows } = buildRows(opts);
  const wsData: (string | number | null | boolean | Date)[][] = [headers, ...rows];

  // Build aligned column metadata for header positions
  const colMeta: (ColumnDefinition | undefined)[] = [
    ...columns,
    ...extraColumns.map(() => undefined),
    ...formulaCols.map(() => undefined),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Apply per-cell types and number formats so Excel renders currency, dates, %, etc.
  for (let c = 0; c < colMeta.length; c++) {
    const col = colMeta[c];
    if (!col) continue;
    const fmt = numFmtFor(col);

    for (let r = 1; r < wsData.length; r++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (!cell) continue;
      const raw = wsData[r][c];

      if (col.data_type === 'date' && raw) {
        const d = new Date(String(raw));
        if (!isNaN(d.getTime())) {
          cell.t = 'd';
          cell.v = d;
          if (fmt) cell.z = fmt;
        }
      } else if ((col.data_type === 'number' || col.data_type === 'currency' || col.data_type === 'percent' || col.data_type === 'rating') && raw != null && raw !== '') {
        const n = parseFloat(String(raw));
        if (!isNaN(n)) {
          cell.t = 'n';
          cell.v = n;
          if (fmt) cell.z = fmt;
        }
      } else if (col.data_type === 'boolean') {
        const truthy = raw === true || String(raw).toLowerCase() === 'true' || raw === 1 || String(raw).toLowerCase() === 'sí' || String(raw).toLowerCase() === 'si';
        cell.t = 's';
        cell.v = truthy ? 'Sí' : 'No';
      }
    }
  }

  // Auto column widths
  const colWidths = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map(r => cellStr(r[i]).length)
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });
  ws['!cols'] = colWidths;

  // Freeze header row so user can scroll keeping it visible
  ws['!freeze'] = { xSplit: 0, ySplit: 1 } as unknown as XLSX.WorkSheet['!freeze'];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, `${opts.datasetName}.xlsx`);
}

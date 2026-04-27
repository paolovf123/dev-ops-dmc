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

export function exportExcel(opts: ExportOptions) {
  const { headers, rows } = buildRows(opts);
  const wsData: (string | number | null)[][] = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto column widths
  const colWidths = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map(r => cellStr(r[i]).length)
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });
  ws['!cols'] = colWidths;

  // Bold header row
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true } };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, `${opts.datasetName}.xlsx`);
}

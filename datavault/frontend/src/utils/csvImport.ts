export interface CsvRow { [key: string]: string }

export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row: CsvRow = {};
    headers.forEach((h, j) => { row[h] = vals[j] ?? ""; });
    rows.push(row);
  }
  return { headers, rows };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      cells.push(cur); cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

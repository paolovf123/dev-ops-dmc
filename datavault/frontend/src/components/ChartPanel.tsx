import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";
import type { ColumnDefinition, Record as DRecord } from "../types";

const COLORS = [
  "var(--pm-green-500)", "var(--pm-orange-500)", "#60a5fa", "#f472b6",
  "#34d399", "#fbbf24", "#a78bfa", "#f87171",
];

interface Props {
  columns: ColumnDefinition[];
  records: DRecord[];
}

function EnumChart({ col, records }: { col: ColumnDefinition; records: DRecord[] }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of records) {
      const v = String(r.data[col.field_key] ?? "(vacío)");
      counts[v] = (counts[v] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [col, records]);

  if (data.length === 0) return null;

  return (
    <div className="chart-card">
      <p className="chart-card-title">{col.name} — distribución</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minHeight: 200 }}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 24, left: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="var(--pm-green-500)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: "0 0 200px", minHeight: 200, display: "flex", alignItems: "center" }}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
                outerRadius={70} innerRadius={30}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function NumberChart({ col, records }: { col: ColumnDefinition; records: DRecord[] }) {
  const data = useMemo(() => {
    return records
      .map((r, i) => ({ idx: i + 1, value: parseFloat(String(r.data[col.field_key] ?? "")) }))
      .filter((d) => !isNaN(d.value))
      .slice(0, 200);
  }, [col, records]);

  if (data.length < 2) return null;

  const vals = data.map((d) => d.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);

  return (
    <div className="chart-card">
      <p className="chart-card-title">
        {col.name}
        <span className="chart-stats">
          <span>min {min}</span>
          <span>max {max}</span>
          <span>avg {avg}</span>
        </span>
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
          <XAxis dataKey="idx" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="var(--pm-green-500)"
            dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ChartPanel({ columns, records }: Props) {
  const enumCols = columns.filter((c) => c.data_type === "enum");
  const numCols = columns.filter((c) => c.data_type === "number");

  if (enumCols.length === 0 && numCols.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--color-text-muted)" }}>
        No hay columnas de tipo <strong>enum</strong> o <strong>número</strong> para graficar.
      </div>
    );
  }

  return (
    <div className="chart-panel">
      {enumCols.map((col) => (
        <EnumChart key={col.id} col={col} records={records} />
      ))}
      {numCols.map((col) => (
        <NumberChart key={col.id} col={col} records={records} />
      ))}
    </div>
  );
}

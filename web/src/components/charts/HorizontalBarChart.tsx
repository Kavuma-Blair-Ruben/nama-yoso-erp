"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type ChartValueFormat, formatChartValue } from "./format";

type Row = { label: string; value: number; color?: string; href?: string };

// General-purpose ranked horizontal bar — top purchased items, wastage by
// section, top suppliers by spend, etc. Same visual language as the
// dashboard's existing CategoryBarChart/TopCostBarChart, generalized so
// every "ranked list of things by a number" chart in the app looks the same.
//
// `format` is a string, not a callback — a Server Component passing this
// data down can't hand a Client Component a plain function prop (Next.js
// throws "Functions cannot be passed directly to Client Components").
export function HorizontalBarChart({
  data,
  format = "plain",
  color = "var(--chart-1)",
  height,
}: {
  data: Row[];
  format?: ChartValueFormat;
  color?: string;
  height?: number;
}) {
  const router = useRouter();
  // Long product/supplier names wrap to multiple SVG text lines that don't
  // reserve extra row height, overlapping the bar above — truncate for the
  // axis label (the tooltip and underlying table still show the full name).
  const chartData = data.map((row) => ({ ...row, axisLabel: row.label.length > 24 ? row.label.slice(0, 23) + "…" : row.label }));
  const hasLinks = data.some((row) => row.href);

  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(160, data.length * 36)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--line)" />
        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="axisLabel" width={150} tick={{ fontSize: 11.5, fill: "var(--ink)" }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "var(--bg-panel-alt)" }}
          formatter={(v) => formatChartValue(typeof v === "number" ? v : Number(v), format)}
          labelFormatter={(_, payload) => (payload?.[0]?.payload as Row | undefined)?.label ?? ""}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--line)" }}
        />
        <Bar
          dataKey="value"
          radius={[0, 4, 4, 0]}
          barSize={16}
          cursor={hasLinks ? "pointer" : undefined}
          onClick={hasLinks ? (d: { payload?: Row }) => d.payload?.href && router.push(d.payload.href) : undefined}
        >
          {data.map((row, i) => (
            <Cell key={i} fill={row.color ?? color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

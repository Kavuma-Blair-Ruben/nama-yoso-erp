"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { type ChartValueFormat, formatChartValue } from "./format";

type Slice = { label: string; value: number; color?: string };

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

// Proportional breakdown (spend by sector, wastage by reason) with a
// centered total and a side legend — the donut-plus-legend layout Supy uses
// for its category/reason splits, in NAMA YOSO's own 5-color chart palette.
export function DonutChart({ data, format = "plain", centerLabel }: { data: Slice[]; format?: ChartValueFormat; centerLabel?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const fmt = (v: number) => formatChartValue(v, format);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: 180, height: 180, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={54} outerRadius={82} paddingAngle={data.length > 1 ? 2 : 0} strokeWidth={0}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color ?? PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => fmt(typeof v === "number" ? v : Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--line)" }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{fmt(total)}</div>
          {centerLabel && <div style={{ fontSize: 10, color: "var(--ink-faint)" }}>{centerLabel}</div>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 140 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color ?? PALETTE[i % PALETTE.length], flexShrink: 0 }} />
            <span style={{ flex: 1, color: "var(--ink)" }}>{d.label}</span>
            <span className="mono-r" style={{ color: "var(--ink-soft)" }}>{fmt(d.value)}</span>
            <span style={{ color: "var(--ink-faint)", fontSize: 10.5, minWidth: 34, textAlign: "right" }}>{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

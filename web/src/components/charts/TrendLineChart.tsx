"use client";

import { useRouter } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type ChartValueFormat, formatChartValue } from "./format";

type Point = { label: string; value: number };

// Time-series trend (weekly purchase spend, cumulative cost drift) — an
// area chart reads more naturally than a bar-per-week once there are more
// than a handful of points, and matches Supy's own trend-line dashboards.
// `href`, when given, makes the whole panel clickable through to the
// underlying report — a trend line has no single point to drill into, so
// unlike the bar/donut/scatter charts this is one link for the whole chart.
export function TrendLineChart({ data, format = "plain", color = "var(--chart-1)", height = 220, href }: { data: Point[]; format?: ChartValueFormat; color?: string; height?: number; href?: string }) {
  const router = useRouter();
  return (
    <div onClick={href ? () => router.push(href) : undefined} style={{ cursor: href ? "pointer" : undefined }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} width={54} />
          <Tooltip
            formatter={(v) => formatChartValue(typeof v === "number" ? v : Number(v), format)}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--line)" }}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#trendFill)" dot={{ r: 2.5, fill: color, strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

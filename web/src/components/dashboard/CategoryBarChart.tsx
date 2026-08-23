"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CategoryBarChart({ data }: { data: { category: string; count: number }[] }) {
  const router = useRouter();
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--line)" />
        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="category"
          width={150}
          tick={{ fontSize: 11.5, fill: "var(--ink)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--bg-panel-alt)" }}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--line)" }}
        />
        <Bar
          dataKey="count"
          fill="var(--chart-1)"
          radius={[0, 4, 4, 0]}
          barSize={16}
          cursor="pointer"
          onClick={(d: { payload?: { category: string } }) => d.payload && router.push(`/products?cat=${encodeURIComponent(d.payload.category)}`)}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

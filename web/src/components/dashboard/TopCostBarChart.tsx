"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";

export function TopCostBarChart({ data }: { data: { code: string; name: string; perUnit: number }[] }) {
  const router = useRouter();
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--line)" />
        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fontSize: 11.5, fill: "var(--ink)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--bg-panel-alt)" }}
          formatter={(v) => money(typeof v === "number" ? v : Number(v))}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--line)" }}
        />
        <Bar
          dataKey="perUnit"
          fill="var(--chart-2)"
          radius={[0, 4, 4, 0]}
          barSize={16}
          cursor="pointer"
          onClick={(d: { payload?: { code: string } }) => d.payload && router.push(`/recipes/main/${d.payload.code}`)}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

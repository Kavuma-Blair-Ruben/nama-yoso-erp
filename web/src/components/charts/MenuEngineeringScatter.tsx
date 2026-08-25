"use client";

import { useRouter } from "next/navigation";
import { CartesianGrid, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { ResponsiveContainer } from "recharts";
import { money } from "@/lib/format";

type Item = { code: string | null; name: string; qty: number; margin: number; revenue: number; classification: "Star" | "Plow-Horse" | "Puzzle" | "Dog" };

const CLASS_COLOR: Record<Item["classification"], string> = {
  Star: "var(--good)",
  "Plow-Horse": "var(--chart-5)",
  Puzzle: "var(--chart-4)",
  Dog: "var(--bad)",
};

// Classic menu-engineering quadrant: x = popularity (qty sold), y =
// profitability (contribution margin per unit), reference lines at the
// dataset averages splitting the four quadrants — Stars top-right,
// Plow-Horses bottom-right, Puzzles top-left, Dogs bottom-left.
export function MenuEngineeringScatter({ items, avgQty, avgMargin }: { items: Item[]; avgQty: number; avgMargin: number }) {
  const router = useRouter();
  const byClass: Record<Item["classification"], Item[]> = { Star: [], "Plow-Horse": [], Puzzle: [], Dog: [] };
  for (const it of items) byClass[it.classification].push(it);

  return (
    <ResponsiveContainer width="100%" height={420}>
      <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 8 }}>
        <CartesianGrid stroke="var(--line)" />
        <XAxis type="number" dataKey="qty" name="Qty Sold" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} label={{ value: "Popularity (qty sold)", position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--ink-soft)" }} />
        <YAxis type="number" dataKey="margin" name="Margin" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} axisLine={false} tickLine={false} label={{ value: "Profitability (margin/unit)", angle: -90, position: "insideLeft", fontSize: 11, fill: "var(--ink-soft)" }} />
        <ZAxis dataKey="revenue" range={[60, 400]} />
        <ReferenceLine x={avgQty} stroke="var(--ink-faint)" strokeDasharray="4 4" />
        <ReferenceLine y={avgMargin} stroke="var(--ink-faint)" strokeDasharray="4 4" />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as Item;
            return (
              <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ color: CLASS_COLOR[p.classification] }}>{p.classification}</div>
                <div>Qty sold: {p.qty}</div>
                <div>Margin/unit: {money(p.margin, 2)}</div>
                <div>Revenue: {money(p.revenue, 0)}</div>
              </div>
            );
          }}
        />
        {(Object.keys(byClass) as Item["classification"][]).map((cls) => (
          <Scatter
            key={cls}
            name={cls}
            data={byClass[cls]}
            fill={CLASS_COLOR[cls]}
            cursor="pointer"
            onClick={(d: { payload?: Item }) => d.payload?.code && router.push(`/recipes/main/${d.payload.code}`)}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

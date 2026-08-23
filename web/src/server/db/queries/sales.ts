import "server-only";
import { db } from "@/server/db";
import { recipeSales } from "@/server/db/schema";
import { loadCostingGraph, recipeCurrentCost } from "@/server/costing/recipeCost";

export type RecipeSalesRow = {
  code: string | null;
  name: string;
  matched: boolean;
  qty: number;
  revenue: number;
  avgPrice: number;
  costPerUnit: number | null;
  totalCost: number | null;
  grossProfit: number | null;
  foodCostPct: number | null;
};

// Aggregates every imported recipe_sales row per recipe (or per raw label,
// for anything that didn't match a real recipe on import) and prices it
// against the live costing graph — the same "actual" cost every other
// costed view in the app uses, not a stale build-time snapshot.
export async function getRecipeSalesReport(): Promise<{ rows: RecipeSalesRow[]; totalRevenue: number; totalQty: number; totalCost: number; totalProfit: number; unmatchedCount: number; hasData: boolean }> {
  const rows = await db.select({ mainRecipeId: recipeSales.mainRecipeId, itemLabel: recipeSales.itemLabel, qty: recipeSales.qty, revenue: recipeSales.revenue }).from(recipeSales);

  const byKey = new Map<string, { key: string; label: string; mainRecipeId: string | null; qty: number; revenue: number }>();
  for (const r of rows) {
    const key = r.mainRecipeId ?? `unmatched:${r.itemLabel}`;
    const g = byKey.get(key) ?? { key, label: r.itemLabel, mainRecipeId: r.mainRecipeId, qty: 0, revenue: 0 };
    g.qty += r.qty;
    g.revenue += r.revenue;
    byKey.set(key, g);
  }

  const graph = await loadCostingGraph();
  const results: RecipeSalesRow[] = [...byKey.values()]
    .map((g) => {
      const recipe = g.mainRecipeId ? graph.mainRecipes.find((m) => m.id === g.mainRecipeId) : null;
      const costPerUnit = recipe ? recipeCurrentCost(graph, recipe).perUnit : null;
      const totalCost = costPerUnit != null ? costPerUnit * g.qty : null;
      const grossProfit = totalCost != null ? g.revenue - totalCost : null;
      const foodCostPct = costPerUnit != null && g.revenue > 0 ? (totalCost! / g.revenue) * 100 : null;
      return {
        code: recipe?.legacyCode ?? null,
        name: recipe?.name ?? g.label,
        matched: !!recipe,
        qty: g.qty,
        revenue: g.revenue,
        avgPrice: g.qty ? g.revenue / g.qty : 0,
        costPerUnit,
        totalCost,
        grossProfit,
        foodCostPct,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = results.reduce((s, r) => s + r.revenue, 0);
  const totalQty = results.reduce((s, r) => s + r.qty, 0);
  const totalCost = results.reduce((s, r) => s + (r.totalCost ?? 0), 0);
  const unmatchedCount = results.filter((r) => !r.matched).length;

  return { rows: results, totalRevenue, totalQty, totalCost, totalProfit: totalRevenue - totalCost, unmatchedCount, hasData: rows.length > 0 };
}

export type MenuEngineeringItem = { code: string | null; name: string; qty: number; margin: number; revenue: number; classification: "Star" | "Plow-Horse" | "Puzzle" | "Dog" };

// Classic 2x2 menu-engineering split: popularity (qty sold vs. the average
// across matched recipes) crossed with profitability (contribution margin
// per unit vs. average) — Star/Plow-Horse/Puzzle/Dog, same framework Supy's
// own menu-engineering scatter uses.
export async function getMenuEngineeringData(): Promise<{ items: MenuEngineeringItem[]; avgQty: number; avgMargin: number }> {
  const report = await getRecipeSalesReport();
  const matched = report.rows.filter((r) => r.matched && r.costPerUnit != null);
  if (matched.length === 0) return { items: [], avgQty: 0, avgMargin: 0 };

  const avgQty = matched.reduce((s, r) => s + r.qty, 0) / matched.length;
  const margins = matched.map((r) => r.avgPrice - (r.costPerUnit ?? 0));
  const avgMargin = margins.reduce((s, m) => s + m, 0) / margins.length;

  const items: MenuEngineeringItem[] = matched.map((r, i) => {
    const margin = margins[i];
    const highPop = r.qty >= avgQty;
    const highProfit = margin >= avgMargin;
    const classification = highPop && highProfit ? "Star" : highPop && !highProfit ? "Plow-Horse" : !highPop && highProfit ? "Puzzle" : "Dog";
    return { code: r.code, name: r.name, qty: r.qty, margin, revenue: r.revenue, classification };
  });

  return { items, avgQty, avgMargin };
}

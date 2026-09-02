import "server-only";
import { db } from "@/server/db";
import { recipeSales, mainRecipes } from "@/server/db/schema";
import { eq, sql, count, and, gte, lte } from "drizzle-orm";
import { loadCostingGraph, recipeCurrentCost } from "@/server/costing/recipeCost";

export type DateRangeFilter = { from?: string; to?: string };

export type RecipeSalesRow = {
  code: string | null;
  name: string;
  matched: boolean;
  qty: number;
  revenue: number;
  grossRevenue: number | null;
  voidAmount: number | null;
  voidQty: number | null;
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
export async function getRecipeSalesReport(
  filters: DateRangeFilter = {}
): Promise<{ rows: RecipeSalesRow[]; totalRevenue: number; totalGrossRevenue: number; totalVoidAmount: number; totalQty: number; totalCost: number; totalProfit: number; unmatchedCount: number; hasData: boolean }> {
  const conditions = [];
  if (filters.from) conditions.push(gte(recipeSales.saleDate, filters.from));
  if (filters.to) conditions.push(lte(recipeSales.saleDate, filters.to));
  const rows = await db
    .select({
      mainRecipeId: recipeSales.mainRecipeId,
      itemLabel: recipeSales.itemLabel,
      qty: recipeSales.qty,
      revenue: recipeSales.revenue,
      grossRevenue: recipeSales.grossRevenue,
      voidAmount: recipeSales.voidAmount,
      voidQty: recipeSales.voidQty,
    })
    .from(recipeSales)
    .where(conditions.length ? and(...conditions) : undefined);

  const byKey = new Map<string, { key: string; label: string; mainRecipeId: string | null; qty: number; revenue: number; grossRevenue: number; voidAmount: number; voidQty: number }>();
  for (const r of rows) {
    const key = r.mainRecipeId ?? `unmatched:${r.itemLabel}`;
    const g = byKey.get(key) ?? { key, label: r.itemLabel, mainRecipeId: r.mainRecipeId, qty: 0, revenue: 0, grossRevenue: 0, voidAmount: 0, voidQty: 0 };
    g.qty += r.qty;
    g.revenue += r.revenue;
    g.grossRevenue += r.grossRevenue ?? 0;
    g.voidAmount += r.voidAmount ?? 0;
    g.voidQty += r.voidQty ?? 0;
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
        grossRevenue: g.grossRevenue || null,
        voidAmount: g.voidAmount || null,
        voidQty: g.voidQty || null,
        avgPrice: g.qty ? g.revenue / g.qty : 0,
        costPerUnit,
        totalCost,
        grossProfit,
        foodCostPct,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = results.reduce((s, r) => s + r.revenue, 0);
  const totalGrossRevenue = results.reduce((s, r) => s + (r.grossRevenue ?? 0), 0);
  const totalVoidAmount = results.reduce((s, r) => s + (r.voidAmount ?? 0), 0);
  const totalQty = results.reduce((s, r) => s + r.qty, 0);
  const totalCost = results.reduce((s, r) => s + (r.totalCost ?? 0), 0);
  const unmatchedCount = results.filter((r) => !r.matched).length;

  return { rows: results, totalRevenue, totalGrossRevenue, totalVoidAmount, totalQty, totalCost, totalProfit: totalRevenue - totalCost, unmatchedCount, hasData: rows.length > 0 };
}

export type MenuEngineeringItem = { code: string | null; name: string; qty: number; margin: number; revenue: number; classification: "Star" | "Plow-Horse" | "Puzzle" | "Dog" };

// Classic 2x2 menu-engineering split: popularity (qty sold vs. the average
// across matched recipes) crossed with profitability (contribution margin
// per unit vs. average) — Star/Plow-Horse/Puzzle/Dog, same framework Supy's
// own menu-engineering scatter uses.
export async function getMenuEngineeringData(filters: DateRangeFilter = {}): Promise<{ items: MenuEngineeringItem[]; avgQty: number; avgMargin: number }> {
  const report = await getRecipeSalesReport(filters);
  // getRecipeSalesReport deliberately keeps a void-only row (qty 0, revenue
  // 0) instead of dropping it, so a full void is still visible there and in
  // COGS. Popularity-vs-profitability has no meaning for something that was
  // never actually served, though — qty 0 would otherwise show up as a
  // phantom "Dog" (0 popularity, negative margin from cost alone) and drag
  // the averages every other item is classified against.
  const matched = report.rows.filter((r) => r.matched && r.costPerUnit != null && r.qty > 0);
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

// Scoped to a single calendar day (unlike getRecipeSalesReport, which is a
// deliberate all-time aggregate used elsewhere) — the Dashboard's "Sales
// Today" digest card needs a real daily figure, not a lifetime total.
export async function getSalesTodayStats(date: string): Promise<{ qty: number; revenue: number; orderCount: number }> {
  const [row] = await db
    .select({ qty: sql<number>`coalesce(sum(${recipeSales.qty}), 0)`, revenue: sql<number>`coalesce(sum(${recipeSales.revenue}), 0)`, orderCount: count() })
    .from(recipeSales)
    .where(eq(recipeSales.saleDate, date));
  return { qty: Number(row?.qty ?? 0), revenue: Number(row?.revenue ?? 0), orderCount: row?.orderCount ?? 0 };
}

export type CogsTrendPoint = { label: string; revenue: number; cogs: number; cogsPct: number | null };
export type CogsSectionRow = { section: string; revenue: number; cogs: number; cogsPct: number | null };
export type CogsTopRow = { code: string | null; name: string; qty: number; costPerUnit: number; revenue: number; cogs: number; cogsPct: number | null };
export type CogsCategoryRow = { category: "food" | "beverage"; revenue: number; cogs: number; cogsPct: number | null };
export type CogsRecipeRow = { code: string | null; name: string; costCategory: "food" | "beverage"; qty: number; revenue: number; cogs: number; cogsPct: number | null };
export type CogsAnalysis = {
  hasData: boolean;
  totalRevenue: number;
  totalCogs: number;
  cogsPct: number | null;
  targetCogsPct: number | null; // qty-weighted average of each sold recipe's own target food-cost %, where set
  grossProfit: number;
  trend: CogsTrendPoint[]; // daily
  bySection: CogsSectionRow[];
  byCategory: CogsCategoryRow[]; // Food vs Beverage, from mainRecipes.costCategory
  topByCogs: CogsTopRow[]; // top 10, highest COGS $ contribution first
  recipeList: CogsRecipeRow[]; // every sold recipe, highest COGS $ first — backs the food/beverage drill-down
};

// The actual "what's my food cost costing me" view — Recipe Sales Report
// has the same underlying numbers per recipe, but nothing anywhere turns
// them into a COGS % trend over time, a by-section breakdown, or a target
// comparison. Real Food Cost % is the single most load-bearing number in
// restaurant P&L, so this gets its own dashboard tab rather than staying
// buried in a table.
export async function getCogsAnalysis(filters: DateRangeFilter = {}): Promise<CogsAnalysis> {
  const conditions = [];
  if (filters.from) conditions.push(gte(recipeSales.saleDate, filters.from));
  if (filters.to) conditions.push(lte(recipeSales.saleDate, filters.to));
  const rows = await db
    .select({ mainRecipeId: recipeSales.mainRecipeId, itemLabel: recipeSales.itemLabel, saleDate: recipeSales.saleDate, qty: recipeSales.qty, revenue: recipeSales.revenue })
    .from(recipeSales)
    .where(conditions.length ? and(...conditions) : undefined);

  const empty: CogsAnalysis = { hasData: false, totalRevenue: 0, totalCogs: 0, cogsPct: null, targetCogsPct: null, grossProfit: 0, trend: [], bySection: [], byCategory: [], topByCogs: [], recipeList: [] };
  if (rows.length === 0) return empty;

  const graph = await loadCostingGraph();
  const targets = await db.select({ id: mainRecipes.id, targetFoodCostPct: mainRecipes.targetFoodCostPct, costCategory: mainRecipes.costCategory }).from(mainRecipes);
  const targetById = new Map(targets.map((t) => [t.id, t.targetFoodCostPct]));
  const categoryById = new Map(targets.map((t) => [t.id, t.costCategory]));

  // Per-recipe totals (for the section breakdown and top-by-COGS list) and
  // per-day totals (for the trend) computed in the same pass.
  const byRecipe = new Map<string, { name: string; code: string | null; section: string | null; costCategory: "food" | "beverage"; qty: number; revenue: number; cogs: number; targetSum: number; targetQty: number }>();
  const byDate = new Map<string, { revenue: number; cogs: number }>();

  for (const r of rows) {
    const node = r.mainRecipeId ? graph.mainRecipes.find((m) => m.id === r.mainRecipeId) : null;
    const costPerUnit = node ? recipeCurrentCost(graph, node).perUnit : 0;
    const cogs = costPerUnit * r.qty;
    const key = r.mainRecipeId ?? `unmatched:${r.itemLabel}`;
    // Unmatched sales (no linked recipe) default to 'food' — the vast
    // majority of a restaurant's menu is food, and there's no signal at all
    // to classify an unmatched line otherwise.
    const costCategory = (r.mainRecipeId ? categoryById.get(r.mainRecipeId) : null) === "beverage" ? "beverage" : "food";

    const rec = byRecipe.get(key) ?? { name: node?.name ?? r.itemLabel, code: node?.legacyCode ?? null, section: node?.section ?? null, costCategory, qty: 0, revenue: 0, cogs: 0, targetSum: 0, targetQty: 0 };
    rec.qty += r.qty;
    rec.revenue += r.revenue;
    rec.cogs += cogs;
    const target = r.mainRecipeId ? targetById.get(r.mainRecipeId) : null;
    if (target != null) {
      rec.targetSum += target * r.qty;
      rec.targetQty += r.qty;
    }
    byRecipe.set(key, rec);

    const day = byDate.get(r.saleDate) ?? { revenue: 0, cogs: 0 };
    day.revenue += r.revenue;
    day.cogs += cogs;
    byDate.set(r.saleDate, day);
  }

  const recipeList = [...byRecipe.values()];
  const totalRevenue = recipeList.reduce((s, r) => s + r.revenue, 0);
  const totalCogs = recipeList.reduce((s, r) => s + r.cogs, 0);
  const targetSum = recipeList.reduce((s, r) => s + r.targetSum, 0);
  const targetQty = recipeList.reduce((s, r) => s + r.targetQty, 0);

  const bySectionMap = new Map<string, { revenue: number; cogs: number }>();
  for (const r of recipeList) {
    const section = r.section ?? "Unassigned";
    const s = bySectionMap.get(section) ?? { revenue: 0, cogs: 0 };
    s.revenue += r.revenue;
    s.cogs += r.cogs;
    bySectionMap.set(section, s);
  }

  const trend: CogsTrendPoint[] = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, v]) => ({ label, revenue: v.revenue, cogs: v.cogs, cogsPct: v.revenue > 0 ? (v.cogs / v.revenue) * 100 : null }));

  const bySection: CogsSectionRow[] = [...bySectionMap.entries()]
    .map(([section, v]) => ({ section, revenue: v.revenue, cogs: v.cogs, cogsPct: v.revenue > 0 ? (v.cogs / v.revenue) * 100 : null }))
    .sort((a, b) => b.cogs - a.cogs);

  const byCategoryMap = new Map<"food" | "beverage", { revenue: number; cogs: number }>();
  for (const r of recipeList) {
    const c = byCategoryMap.get(r.costCategory) ?? { revenue: 0, cogs: 0 };
    c.revenue += r.revenue;
    c.cogs += r.cogs;
    byCategoryMap.set(r.costCategory, c);
  }
  const byCategory: CogsCategoryRow[] = (["food", "beverage"] as const)
    .filter((c) => byCategoryMap.has(c))
    .map((category) => {
      const v = byCategoryMap.get(category)!;
      return { category, revenue: v.revenue, cogs: v.cogs, cogsPct: v.revenue > 0 ? (v.cogs / v.revenue) * 100 : null };
    });

  const recipeListSorted = [...recipeList].sort((a, b) => b.cogs - a.cogs);
  const topByCogs: CogsTopRow[] = recipeListSorted
    .slice(0, 10)
    .map((r) => ({ code: r.code, name: r.name, qty: r.qty, costPerUnit: r.qty ? r.cogs / r.qty : 0, revenue: r.revenue, cogs: r.cogs, cogsPct: r.revenue > 0 ? (r.cogs / r.revenue) * 100 : null }));
  const recipeListRows: CogsRecipeRow[] = recipeListSorted.map((r) => ({
    code: r.code,
    name: r.name,
    costCategory: r.costCategory,
    qty: r.qty,
    revenue: r.revenue,
    cogs: r.cogs,
    cogsPct: r.revenue > 0 ? (r.cogs / r.revenue) * 100 : null,
  }));

  return {
    hasData: true,
    totalRevenue,
    totalCogs,
    cogsPct: totalRevenue > 0 ? (totalCogs / totalRevenue) * 100 : null,
    targetCogsPct: targetQty > 0 ? targetSum / targetQty : null,
    grossProfit: totalRevenue - totalCogs,
    trend,
    bySection,
    byCategory,
    topByCogs,
    recipeList: recipeListRows,
  };
}

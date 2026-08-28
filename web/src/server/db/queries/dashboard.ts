import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db";
import { stockItems, mainRecipes, subRecipes, categories, suppliers, invoicesHistorical, priceHistory } from "@/server/db/schema";
import { eq, sql, count, sum, isNotNull } from "drizzle-orm";
import { loadCostingGraph, recipeCurrentCost, recipeOriginalCost, type CostingGraph } from "@/server/costing/recipeCost";
import { getReorderAlertCount } from "@/server/db/queries/forecasting";
import { getSalesTodayStats } from "@/server/db/queries/sales";
import { listPurchaseOrders } from "@/server/db/queries/purchaseOrders";
import { listProductionBatches } from "@/server/db/queries/production";
import { listWastageEvents } from "@/server/db/queries/wastage";
import { listCostAdjustmentEvents } from "@/server/db/queries/reports";
import { todayStr } from "@/lib/format";

// Accepts an optional pre-loaded costing graph so callers that already need
// one for the same request (e.g. the Cost Dashboard tab) don't trigger a
// second, fully redundant loadCostingGraph() round trip.
export async function getDashboardData(preloadedGraph?: CostingGraph) {
  const [
    [{ value: activeSkuCount }],
    [{ value: categoryCount }],
    [{ value: supplierCount }],
    [{ value: mainRecipeCount }],
    [{ value: subRecipeCount }],
    [{ value: mainSectionCount }],
    [{ value: subSectionCount }],
  ] = await Promise.all([
    db.select({ value: count() }).from(stockItems).where(eq(stockItems.isActive, true)),
    db.select({ value: count() }).from(categories),
    db.select({ value: count() }).from(suppliers),
    db.select({ value: count() }).from(mainRecipes),
    db.select({ value: count() }).from(subRecipes),
    db.select({ value: sql<number>`count(distinct ${mainRecipes.section})` }).from(mainRecipes).where(isNotNull(mainRecipes.section)),
    db.select({ value: sql<number>`count(distinct ${subRecipes.section})` }).from(subRecipes).where(isNotNull(subRecipes.section)),
  ]);

  const [invoiceAgg] = await db
    .select({ count: count(), total: sum(invoicesHistorical.total) })
    .from(invoicesHistorical);

  const outstandingBySupplier = await db
    .select({ supplierId: invoicesHistorical.supplierId, supplierName: suppliers.name, outstanding: sum(invoicesHistorical.total) })
    .from(invoicesHistorical)
    .innerJoin(suppliers, eq(invoicesHistorical.supplierId, suppliers.id))
    .where(eq(invoicesHistorical.status, "OUTSTANDING"))
    .groupBy(invoicesHistorical.supplierId, suppliers.name)
    .orderBy(sql`sum(${invoicesHistorical.total}) desc`)
    .limit(6);

  const [{ value: outstandingSupplierCount }] = await db
    .select({ value: sql<number>`count(distinct ${invoicesHistorical.supplierId})` })
    .from(invoicesHistorical)
    .where(eq(invoicesHistorical.status, "OUTSTANDING"));

  const totalOutstanding = outstandingBySupplier.reduce((s, r) => s + Number(r.outstanding ?? 0), 0);

  const [{ value: priceChangeCount }] = await db.select({ value: count() }).from(priceHistory);

  const categoryBreakdownRaw = await db
    .select({ category: categories.name, n: count() })
    .from(stockItems)
    .innerJoin(categories, eq(stockItems.categoryId, categories.id))
    .where(eq(stockItems.isActive, true))
    .groupBy(categories.name)
    .orderBy(sql`count(*) desc`);

  const graph = preloadedGraph ?? (await loadCostingGraph());
  const costed = graph.mainRecipes.map((r) => {
    const cur = recipeCurrentCost(graph, r);
    const orig = recipeOriginalCost(r, 1);
    const variancePct = orig.perUnit ? ((cur.perUnit - orig.perUnit) / orig.perUnit) * 100 : 0;
    return { recipe: r, cur, orig, variancePct };
  });
  const allMissing = new Set<string>();
  costed.forEach((c) => c.cur.missing.forEach((m) => allMissing.add(m.code + "|" + m.name)));
  const topCost = [...costed].sort((a, b) => b.cur.perUnit - a.cur.perUnit).slice(0, 6);
  const topVariance = [...costed]
    .filter((x) => Math.abs(x.variancePct) > 0.01)
    .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct))
    .slice(0, 6);

  return {
    activeSkuCount,
    categoryCount,
    supplierCount,
    mainRecipeCount,
    subRecipeCount,
    mainSectionCount,
    subSectionCount,
    totalPurchaseSpend: Number(invoiceAgg.total ?? 0),
    invoiceCount: invoiceAgg.count,
    totalOutstanding,
    outstandingSupplierCount,
    priceChangeCount,
    missingIngredientCount: allMissing.size,
    categoryBreakdown: categoryBreakdownRaw.map((r) => ({ category: r.category, count: r.n })),
    topCost: topCost.map((x) => ({ code: x.recipe.legacyCode, name: x.recipe.name, section: x.recipe.section, perUnit: x.cur.perUnit })),
    topVariance: topVariance.map((x) => ({ code: x.recipe.legacyCode, name: x.recipe.name, variancePct: x.variancePct })),
    outstandingBySupplier: outstandingBySupplier.map((r) => ({ supplierId: r.supplierId, name: r.supplierName, outstanding: Number(r.outstanding ?? 0) })),
  };
}

// Today-at-a-glance numbers for the Dashboard Overview's digest cards —
// shared with the on-demand AI summary action so both read the exact same
// figures, never a separately-computed (and potentially inconsistent) set.
// Sequential, not Promise.all'd — getReorderAlertCount alone already runs
// several queries per branch, and this Overview tab already runs
// getDashboardData() alongside it; stacking every query in this function
// on top, all concurrently, was enough combined load to trip the Supabase
// pooler's statement_timeout (same class of issue as the earlier Cost
// Dashboard fix, just from a different cause — too many queries firing at
// once rather than one redundant duplicate call).
export async function getDashboardDigestStats() {
  const today = todayStr();
  const reorderAlertCount = await getReorderAlertCount();
  const salesToday = await getSalesTodayStats(today);
  const approvedPOs = await listPurchaseOrders({ status: "APPROVED", excludeDemo: true });
  const orderedPOs = await listPurchaseOrders({ status: "ORDERED", excludeDemo: true });
  const openBatches = await listProductionBatches({ status: "OPEN", excludeDemo: true });
  const wastageEvents = await listWastageEvents({ status: "POSTED", excludeDemo: true });

  const upcomingPOs = [...approvedPOs, ...orderedPOs];
  const upcomingPurchases = { count: upcomingPOs.length, value: upcomingPOs.reduce((s, po) => s + po.net + po.vat, 0) };
  const wastageToday = wastageEvents.filter((e) => e.eventDate === today);
  const wastageTodayCost = wastageToday.reduce((s, e) => s + e.totalCost, 0);

  return {
    reorderAlertCount,
    salesToday,
    upcomingPurchases,
    openProductionBatches: openBatches.length,
    wastageTodayCost,
  };
}

// Cached for the Dashboard Overview tab specifically — these are aggregate,
// business-wide numbers (not per-user), and nothing about a KPI dashboard
// needs to be fresher than ~45 seconds. Under a healthy database this was
// already fast; under a degraded one (e.g. an upstream provider incident)
// this is the difference between every single click re-paying the full
// query cost versus paying it once per 45s window regardless of how many
// times the page is opened in between. Not applied to getDashboardData's
// other caller (Cost Dashboard, which passes a preloaded costing graph) —
// that call shape doesn't fit a cache key the same way.
export const getCachedOverviewData = unstable_cache(
  async () => {
    const d = await getDashboardData();
    const digest = await getDashboardDigestStats();
    return { d, digest };
  },
  ["dashboard-overview-v1"],
  { revalidate: 45 }
);

// Same reasoning as getCachedOverviewData, applied to the Cost Dashboard
// tab specifically — loadCostingGraph() alone measured at 5.4s. NOT applied
// to loadCostingGraph itself (which is also used by recipe editing/detail
// pages, where a price update is explicitly supposed to "recost
// automatically" — caching it there would break that live-recompute
// promise). Scoped narrowly to just this tab's own combined view.
export const getCachedCostDashboardData = unstable_cache(
  async () => {
    const graph = await loadCostingGraph();
    const [d, adjustments] = await Promise.all([getDashboardData(graph), listCostAdjustmentEvents({}, graph)]);
    return { d, adjustments };
  },
  ["dashboard-cost-tab-v1"],
  { revalidate: 45 }
);

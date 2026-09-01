import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db";
import { stockItems, mainRecipes, subRecipes, categories, suppliers, invoicesHistorical, priceHistory, recipeSales, grns, grnLines } from "@/server/db/schema";
import { eq, and, gte, lte, sql, count, sum, isNotNull, ne } from "drizzle-orm";
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

  // A posted GRN with a real invoice/delivery note doubles as its own AP
  // record (same definition listInvoices in invoices.ts uses) — without
  // this, spend and payables never counted a GRN entered directly (no
  // LPO, or before any matching historical import), even though it's real.
  const grnApRows = await db
    .select({
      supplierId: grns.supplierId,
      supplierName: suppliers.name,
      paymentStatus: grns.paymentStatus,
      net: sql<number>`coalesce((select sum(case when grn_lines.is_foc then 0 else grn_lines.received_qty * grn_lines.rate * (1 - grn_lines.discount_pct / 100) end) from grn_lines where grn_lines.grn_id = grns.id), 0)::float8`,
      vat: sql<number>`coalesce((select sum(case when grn_lines.is_foc then 0 else grn_lines.received_qty * grn_lines.rate * (1 - grn_lines.discount_pct / 100) * grn_lines.tax_rate / 100 end) from grn_lines where grn_lines.grn_id = grns.id), 0)::float8`,
    })
    .from(grns)
    .innerJoin(suppliers, eq(grns.supplierId, suppliers.id))
    .where(and(eq(grns.status, "POSTED"), isNotNull(grns.invoiceNumber), ne(grns.invoiceNumber, "")));
  const grnTotalSpend = grnApRows.reduce((s, r) => s + r.net + r.vat, 0);

  const outstandingBySupplierHistorical = await db
    .select({ supplierId: invoicesHistorical.supplierId, supplierName: suppliers.name, outstanding: sum(invoicesHistorical.total) })
    .from(invoicesHistorical)
    .innerJoin(suppliers, eq(invoicesHistorical.supplierId, suppliers.id))
    .where(eq(invoicesHistorical.status, "OUTSTANDING"))
    .groupBy(invoicesHistorical.supplierId, suppliers.name);

  // Merged (not limited to the top 6 yet) so totalOutstanding and the
  // distinct-supplier count below are exact, not just a sum of the slice
  // that ends up on screen.
  const outstandingMap = new Map<string, { supplierName: string; outstanding: number }>();
  for (const r of outstandingBySupplierHistorical) {
    if (!r.supplierId) continue;
    outstandingMap.set(r.supplierId, { supplierName: r.supplierName, outstanding: Number(r.outstanding ?? 0) });
  }
  for (const r of grnApRows) {
    if (r.paymentStatus !== "OUTSTANDING" || !r.supplierId) continue;
    const amt = r.net + r.vat;
    const existing = outstandingMap.get(r.supplierId);
    if (existing) existing.outstanding += amt;
    else outstandingMap.set(r.supplierId, { supplierName: r.supplierName, outstanding: amt });
  }
  const outstandingBySupplier = [...outstandingMap.entries()]
    .map(([supplierId, v]) => ({ supplierId, supplierName: v.supplierName, outstanding: v.outstanding }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 6);

  const outstandingSupplierCount = outstandingMap.size;
  const totalOutstanding = [...outstandingMap.values()].reduce((s, v) => s + v.outstanding, 0);

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
    totalPurchaseSpend: Number(invoiceAgg.total ?? 0) + grnTotalSpend,
    invoiceCount: invoiceAgg.count + grnApRows.length,
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

// Day-by-day Sales vs. Purchases, and purchases as a % of sales — a
// cash-flow-style read distinct from COGS% (which compares revenue to the
// cost of what was actually SOLD). This compares revenue to what was
// actually RECEIVED that day, regardless of whether it's been sold yet.
// Sales come from recipe_sales (populated by both CSV import and the
// Foodics webhook — the same source the COGS/Menu Engineering tabs use).
// Purchases come from posted GRNs (grn_lines.line_amount), not
// invoices_historical, since that table is intentionally being kept at
// zero post-go-live and real purchases now flow through GRN posting.
export async function getSalesVsPurchasesStats(filters: { from?: string; to?: string } = {}) {
  const salesConditions = [];
  if (filters.from) salesConditions.push(gte(recipeSales.saleDate, filters.from));
  if (filters.to) salesConditions.push(lte(recipeSales.saleDate, filters.to));
  const salesRows = await db
    .select({ saleDate: recipeSales.saleDate, revenue: recipeSales.revenue })
    .from(recipeSales)
    .where(salesConditions.length ? and(...salesConditions) : undefined);

  const purchaseConditions = [eq(grns.status, "POSTED")];
  if (filters.from) purchaseConditions.push(gte(grns.receivedDate, filters.from));
  if (filters.to) purchaseConditions.push(lte(grns.receivedDate, filters.to));
  const purchaseRows = await db
    .select({ receivedDate: grns.receivedDate, lineAmount: grnLines.lineAmount })
    .from(grnLines)
    .innerJoin(grns, eq(grnLines.grnId, grns.id))
    .where(and(...purchaseConditions));

  const salesByDate = new Map<string, number>();
  for (const r of salesRows) salesByDate.set(r.saleDate, (salesByDate.get(r.saleDate) ?? 0) + r.revenue);
  const purchasesByDate = new Map<string, number>();
  for (const r of purchaseRows) purchasesByDate.set(r.receivedDate, (purchasesByDate.get(r.receivedDate) ?? 0) + r.lineAmount);

  const allDates = new Set([...salesByDate.keys(), ...purchasesByDate.keys()]);
  const trend = [...allDates]
    .sort()
    .map((date) => {
      const sales = salesByDate.get(date) ?? 0;
      const purchases = purchasesByDate.get(date) ?? 0;
      return { date, sales, purchases, purchasesPct: sales ? (purchases / sales) * 100 : null };
    });

  const totalSales = trend.reduce((s, t) => s + t.sales, 0);
  const totalPurchases = trend.reduce((s, t) => s + t.purchases, 0);
  const overallPurchasesPct = totalSales ? (totalPurchases / totalSales) * 100 : null;

  return { trend, totalSales, totalPurchases, overallPurchasesPct, hasData: trend.length > 0 };
}

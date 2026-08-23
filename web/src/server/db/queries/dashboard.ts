import "server-only";
import { db } from "@/server/db";
import { stockItems, mainRecipes, subRecipes, categories, suppliers, invoicesHistorical, priceHistory } from "@/server/db/schema";
import { eq, sql, count, sum, isNotNull } from "drizzle-orm";
import { loadCostingGraph, recipeCurrentCost, recipeOriginalCost } from "@/server/costing/recipeCost";

export async function getDashboardData() {
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

  const graph = await loadCostingGraph();
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

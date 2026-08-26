import "server-only";
import { db } from "@/server/db";
import {
  stockItems,
  categories,
  grns,
  grnLines,
  purchaseOrderLines,
  purchaseLinesHistorical,
  invoicesHistorical,
  suppliers,
  stockBalances,
  priceHistory,
  mainRecipes,
  subRecipes,
  recipeIngredients,
  costCenters,
  branches,
  wastageEvents,
  wastageLines,
  stockCounts,
  stockCountLines,
  recipeSales,
} from "@/server/db/schema";
import { and, eq, isNotNull, ne, sql, gte, lte } from "drizzle-orm";
import { loadCostingGraph, recipeCurrentCost, getSubRecipeCost, type CostingGraph } from "@/server/costing/recipeCost";
import { todayStr } from "@/lib/format";

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

// Items carrying stock value with the longest gap since their last purchase
// — matches index.html's lastPurchaseDateByProduct(), just sourced from real
// tables (POSTED grn_lines + the imported purchase_lines_historical ledger,
// matched by name since the historical rows predate any stockItemId link).
export async function listSlowMovingItems(minDays: number) {
  const [grnDates, historicalRows, balances, items] = await Promise.all([
    db
      .select({ stockItemId: grnLines.stockItemId, receivedDate: grns.receivedDate })
      .from(grnLines)
      .innerJoin(grns, eq(grnLines.grnId, grns.id))
      .where(eq(grns.status, "POSTED")),
    db.select({ itemLabel: purchaseLinesHistorical.itemLabel, purchaseDate: purchaseLinesHistorical.purchaseDate }).from(purchaseLinesHistorical),
    db.select({ stockItemId: stockBalances.stockItemId, qtyOnHand: stockBalances.qtyOnHand }).from(stockBalances),
    // Produced items (sub-recipes) are replenished by production, not
    // purchasing — "last purchased" doesn't apply to them, same exclusion
    // index.html applies (PRODUCTS.filter(p => !subByCode[p.c])).
    db.select({ id: stockItems.id, legacyCode: stockItems.legacyCode, name: stockItems.name, issueUnit: stockItems.issueUnit, ratePerKgL: stockItems.ratePerKgL, categoryName: categories.name }).from(stockItems).leftJoin(categories, eq(stockItems.categoryId, categories.id)).where(eq(stockItems.sourceType, "purchased")),
  ]);

  const lastByItemId = new Map<string, string>();
  for (const g of grnDates) {
    if (!g.receivedDate) continue;
    const prev = lastByItemId.get(g.stockItemId);
    if (!prev || g.receivedDate > prev) lastByItemId.set(g.stockItemId, g.receivedDate);
  }
  const byName = new Map(items.map((i) => [i.name, i.id]));
  for (const h of historicalRows) {
    if (!h.purchaseDate) continue;
    const id = byName.get(h.itemLabel ?? "");
    if (!id) continue;
    const prev = lastByItemId.get(id);
    if (!prev || h.purchaseDate > prev) lastByItemId.set(id, h.purchaseDate);
  }
  const qtyByItemId = new Map<string, number>();
  for (const b of balances) qtyByItemId.set(b.stockItemId, (qtyByItemId.get(b.stockItemId) ?? 0) + b.qtyOnHand);

  const today = todayStr();
  const rows = items
    .map((it) => {
      const qty = qtyByItemId.get(it.id) ?? 0;
      const stockValue = qty * (it.ratePerKgL ?? 0);
      const last = lastByItemId.get(it.id) ?? null;
      const daysSince = last ? daysBetween(last, today) : null;
      return { ...it, qty, stockValue, last, daysSince };
    })
    .filter((r) => r.stockValue > 0.004)
    .filter((r) => !minDays || r.daysSince == null || r.daysSince >= minDays)
    .sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999));

  return rows;
}

// Every GRN line that shipped at a different rate than its LPO said — unlike
// index.html's array-index matching between GRN and PO lines (fragile),
// this follows the real purchase_order_line_id FK on grn_lines.
export async function listPriceChangeEvents() {
  const rows = await db
    .select({
      grnId: grns.id,
      grnNumber: grns.grnNumber,
      receivedDate: grns.receivedDate,
      supplier: suppliers.name,
      stockItemId: stockItems.id,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      orderedRate: purchaseOrderLines.rate,
      receivedRate: grnLines.rate,
      receivedQty: grnLines.receivedQty,
    })
    .from(grnLines)
    .innerJoin(grns, eq(grnLines.grnId, grns.id))
    .innerJoin(suppliers, eq(grns.supplierId, suppliers.id))
    .innerJoin(stockItems, eq(grnLines.stockItemId, stockItems.id))
    .innerJoin(purchaseOrderLines, eq(grnLines.purchaseOrderLineId, purchaseOrderLines.id))
    .where(eq(grns.status, "POSTED"));

  return rows
    .filter((r) => Math.abs(r.orderedRate - r.receivedRate) >= 0.001)
    .map((r) => {
      const variancePct = r.orderedRate ? ((r.receivedRate - r.orderedRate) / r.orderedRate) * 100 : 0;
      const varianceValue = (r.receivedRate - r.orderedRate) * r.receivedQty;
      return { ...r, variancePct, varianceValue };
    })
    .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate));
}

// Every ingredient price change and which recipes it moved the cost of.
// Accepts an optional pre-loaded costing graph so callers that already need
// one for the same request (e.g. the Cost Dashboard tab) don't trigger a
// second, fully redundant loadCostingGraph() round trip.
export async function listCostAdjustmentEvents(filters: { q?: string }, preloadedGraph?: CostingGraph) {
  const [history, graph, ingredientRows] = await Promise.all([
    db
      .select({ stockItemId: priceHistory.stockItemId, oldRate: priceHistory.oldRate, newRate: priceHistory.newRate, changedAt: priceHistory.changedAt, legacyCode: stockItems.legacyCode, name: stockItems.name })
      .from(priceHistory)
      .innerJoin(stockItems, eq(priceHistory.stockItemId, stockItems.id)),
    preloadedGraph ?? loadCostingGraph(),
    db.select({ mainRecipeId: recipeIngredients.mainRecipeId, subRecipeId: recipeIngredients.subRecipeId, stockItemId: recipeIngredients.stockItemId }).from(recipeIngredients),
  ]);

  // Reverse index: stockItemId -> recipes that directly reference it.
  const usersByItem = new Map<string, { type: "main" | "sub"; id: string }[]>();
  for (const r of ingredientRows) {
    if (!r.stockItemId) continue; // main-recipe-as-ingredient rows have no stock item to index
    const list = usersByItem.get(r.stockItemId) ?? [];
    if (r.mainRecipeId) list.push({ type: "main", id: r.mainRecipeId });
    else if (r.subRecipeId) list.push({ type: "sub", id: r.subRecipeId });
    usersByItem.set(r.stockItemId, list);
  }

  const q = filters.q?.trim().toLowerCase();
  const events = history
    .filter((h) => h.oldRate != null && h.newRate != null && h.oldRate !== h.newRate)
    .filter((h) => !q || h.name.toLowerCase().includes(q))
    // Defends against an occasional malformed row (seen under Supabase
    // pooler stress on a long-running connection — changedAt comes back
    // null/undefined/an invalid Date instead of throwing at the query
    // layer) rather than crashing the whole report on one bad row.
    .filter((h) => h.changedAt instanceof Date && !Number.isNaN(h.changedAt.getTime()))
    .map((h) => {
      const pctChange = h.oldRate ? ((h.newRate! - h.oldRate) / h.oldRate) * 100 : 0;
      const users = usersByItem.get(h.stockItemId) ?? [];
      const affected = users
        .map((u) => {
          const cur = u.type === "main" ? graph.mainRecipes.find((m) => m.id === u.id) : graph.subRecipesById.get(u.id);
          if (!cur) return null;
          const result = u.type === "main" ? recipeCurrentCost(graph, cur) : getSubRecipeCost(graph, u.id);
          const line = result.lines.find((l) => l.ing.stockItemId === h.stockItemId);
          const lineCostNow = line ? line.result.cost : 0;
          const lineCostBefore = h.oldRate && h.newRate ? lineCostNow * (h.oldRate / h.newRate) : lineCostNow;
          const impact = lineCostNow - lineCostBefore;
          const impactPct = result.total ? (impact / result.total) * 100 : 0;
          return { type: u.type, code: cur.legacyCode, name: cur.name, impact, impactPct };
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      return { date: h.changedAt.toISOString().slice(0, 10), code: h.legacyCode, name: h.name, oldRate: h.oldRate!, newRate: h.newRate!, pctChange, affected };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return events;
}

// Purchase spend split by operational sector — historical-ledger only, same
// caveat index.html states: sales aren't logged per-sector, so this can't
// become a true food-cost-% by brand yet.
export async function getSectionStats() {
  const rows = await db
    .select({ section: purchaseLinesHistorical.section, category: purchaseLinesHistorical.category, itemLabel: purchaseLinesHistorical.itemLabel, amount: purchaseLinesHistorical.amount, purchaseDate: purchaseLinesHistorical.purchaseDate })
    .from(purchaseLinesHistorical);

  const bySector = new Map<string, { spend: number; lineCount: number; categories: Map<string, number>; items: Map<string, number>; byDate: Map<string, number> }>();
  for (const r of rows) {
    const sec = r.section || "Unassigned";
    if (!bySector.has(sec)) bySector.set(sec, { spend: 0, lineCount: 0, categories: new Map(), items: new Map(), byDate: new Map() });
    const s = bySector.get(sec)!;
    const amt = r.amount ?? 0;
    s.spend += amt;
    s.lineCount++;
    const cat = r.category || "Uncategorized";
    s.categories.set(cat, (s.categories.get(cat) ?? 0) + amt);
    if (r.itemLabel) s.items.set(r.itemLabel, (s.items.get(r.itemLabel) ?? 0) + amt);
    if (r.purchaseDate) s.byDate.set(r.purchaseDate, (s.byDate.get(r.purchaseDate) ?? 0) + amt);
  }

  return [...bySector.entries()].map(([sector, s]) => ({
    sector,
    spend: s.spend,
    lineCount: s.lineCount,
    categories: [...s.categories.entries()].sort((a, b) => b[1] - a[1]),
    items: [...s.items.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    byDate: [...s.byDate.entries()],
  }));
}

// Live spend and wastage per sector (Kitchen/Bar/...), sourced from the real
// GRN/wastage tables now that they carry a cost_center_id — deliberately kept
// separate from getSectionStats() above, which is built entirely from frozen
// historical import data and a different, unrelated "section" field. This is
// the report that answers "Kitchen's food cost vs Bar's beverage cost", live.
export async function getCostCenterStats() {
  const allCenters = await db
    .select({ id: costCenters.id, name: costCenters.name, branchId: costCenters.branchId, branchName: branches.name })
    .from(costCenters)
    .innerJoin(branches, eq(costCenters.branchId, branches.id))
    .orderBy(branches.name, costCenters.name);

  const grnRows = await db
    .select({ costCenterId: grns.costCenterId, amount: grnLines.lineAmount, taxRate: grnLines.taxRate })
    .from(grnLines)
    .innerJoin(grns, eq(grnLines.grnId, grns.id))
    .where(eq(grns.status, "POSTED"));

  const wastageRows = await db
    .select({ costCenterId: wastageEvents.costCenterId, amount: wastageLines.amountAtWaste })
    .from(wastageLines)
    .innerJoin(wastageEvents, eq(wastageLines.wastageEventId, wastageEvents.id))
    .where(eq(wastageEvents.status, "POSTED"));

  const grnSpendById = new Map<string, number>();
  for (const r of grnRows) {
    if (!r.costCenterId) continue;
    const taxed = r.amount * (1 + r.taxRate / 100);
    grnSpendById.set(r.costCenterId, (grnSpendById.get(r.costCenterId) ?? 0) + taxed);
  }
  const wastageCostById = new Map<string, number>();
  for (const r of wastageRows) {
    if (!r.costCenterId) continue;
    wastageCostById.set(r.costCenterId, (wastageCostById.get(r.costCenterId) ?? 0) + (r.amount ?? 0));
  }

  return allCenters.map((c) => {
    const grnSpend = grnSpendById.get(c.id) ?? 0;
    const wastageCost = wastageCostById.get(c.id) ?? 0;
    return {
      id: c.id,
      name: c.name,
      branchName: c.branchName,
      grnSpend,
      wastageCost,
      wastagePct: grnSpend > 0 ? (wastageCost / grnSpend) * 100 : 0,
    };
  });
}

function weekStart(dateStr: string): string {
  const dt = new Date(dateStr + "T00:00:00");
  const day = dt.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().slice(0, 10);
}

// AP aging + spend KPIs across the full historical invoice ledger — a
// dedicated, unlimited fetch (unlike listInvoices's 500-row UI cap) so the
// totals here are exact, not a truncated sample.
export async function getPurchasingStats() {
  const invoices = await db.select({ total: invoicesHistorical.total, status: invoicesHistorical.status, terms: invoicesHistorical.termsNormalized, invoiceDate: invoicesHistorical.invoiceDate, weekLabel: invoicesHistorical.weekLabel }).from(invoicesHistorical);
  const lines = await db.select({ itemLabel: purchaseLinesHistorical.itemLabel, amount: purchaseLinesHistorical.amount }).from(purchaseLinesHistorical);
  // Historical purchase lines carry only a free-text item label, no
  // stockItemId — resolve to a real product page by exact name match where
  // one exists (same lookup pattern as listSlowMovingItems above), so the
  // dashboard's "Top Purchased Items" can link straight to the product
  // instead of a text search when the label happens to match verbatim.
  const items = await db.select({ legacyCode: stockItems.legacyCode, name: stockItems.name }).from(stockItems);
  const codeByName = new Map(items.map((i) => [i.name, i.legacyCode]));

  const totalSpend = invoices.reduce((s, i) => s + (i.total ?? 0), 0);
  const outstanding = invoices.filter((i) => i.status === "OUTSTANDING").reduce((s, i) => s + (i.total ?? 0), 0);
  const cashSpend = invoices.filter((i) => i.terms === "cash" || i.terms === "petty cash" || i.terms === "paid").reduce((s, i) => s + (i.total ?? 0), 0);
  const creditSpend = totalSpend - cashSpend;

  const today = todayStr();
  const buckets: Record<string, number> = { "0-14": 0, "15-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  let outstandingCount = 0;
  for (const i of invoices) {
    if (i.status !== "OUTSTANDING" || !i.invoiceDate) continue;
    outstandingCount++;
    const age = daysBetween(i.invoiceDate, today);
    const b = age > 90 ? "90+" : age > 60 ? "61-90" : age > 30 ? "31-60" : age > 14 ? "15-30" : "0-14";
    buckets[b] += i.total ?? 0;
  }

  const itemSpend = new Map<string, number>();
  for (const l of lines) {
    if (!l.itemLabel) continue;
    itemSpend.set(l.itemLabel, (itemSpend.get(l.itemLabel) ?? 0) + (l.amount ?? 0));
  }
  const topItems = [...itemSpend.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, value]) => ({ label, value, code: codeByName.get(label) ?? null }));

  const weekSpend = new Map<string, number>();
  for (const i of invoices) {
    const w = i.weekLabel || (i.invoiceDate ? weekStart(i.invoiceDate) : null);
    if (!w) continue;
    weekSpend.set(w, (weekSpend.get(w) ?? 0) + (i.total ?? 0));
  }
  const weeks = [...weekSpend.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return { totalSpend, outstanding, outstandingCount, cashSpend, creditSpend, invoiceCount: invoices.length, buckets, topItems, weeks };
}

// Stock on hand across every item, with negative/below-minimum/above-par
// flags and whether it's used in any recipe — index.html's Stock Page.
export async function getStockPageRows() {
  const [items, balances, linkedRows] = await Promise.all([
    db.select({ id: stockItems.id, legacyCode: stockItems.legacyCode, name: stockItems.name, issueUnit: stockItems.issueUnit, ratePerKgL: stockItems.ratePerKgL, minLevel: stockItems.minLevel, parLevel: stockItems.parLevel, categoryName: categories.name, sourceType: stockItems.sourceType }).from(stockItems).leftJoin(categories, eq(stockItems.categoryId, categories.id)),
    db.select({ stockItemId: stockBalances.stockItemId, qtyOnHand: stockBalances.qtyOnHand }).from(stockBalances),
    db.selectDistinct({ stockItemId: recipeIngredients.stockItemId }).from(recipeIngredients).where(isNotNull(recipeIngredients.stockItemId)),
  ]);
  const qtyByItemId = new Map<string, number>();
  for (const b of balances) qtyByItemId.set(b.stockItemId, (qtyByItemId.get(b.stockItemId) ?? 0) + b.qtyOnHand);
  const linkedIds = new Set(linkedRows.map((r) => r.stockItemId));

  return items.map((it) => {
    const onHand = qtyByItemId.get(it.id) ?? 0;
    const abovePar = it.parLevel != null && onHand > it.parLevel;
    const flag = onHand < 0 ? "NEGATIVE" : it.minLevel != null && onHand < it.minLevel ? "BELOW MIN" : abovePar ? "ABOVE PAR" : null;
    // A produced sub-recipe is itself a recipe, not an ingredient of one —
    // it's never expected to show up in recipe_ingredients, so it's excluded
    // from the "not linked to any recipe" signal rather than always flagged.
    const linkedToRecipe = it.sourceType === "produced" || linkedIds.has(it.id);
    return { ...it, onHand, value: onHand * (it.ratePerKgL ?? 0), flag, abovePar, linkedToRecipe };
  });
}

// Theoretical (system-expected) vs actual (physically counted) stock,
// rolled up per item across every POSTED stock count in the given date
// range/location — the per-item shrinkage/overage breakdown that Reports >
// Stock Counts never had (that tab only lists count headers, one row per
// count, not a cross-count item rollup).
export async function getVarianceAnalysis(filters: { from: string; to: string; branchId?: string; costCenterId?: string; excludeNonCogs?: boolean }) {
  const conditions = [eq(stockCounts.status, "POSTED"), gte(stockCounts.countDate, filters.from), lte(stockCounts.countDate, filters.to)];
  if (filters.branchId) conditions.push(eq(stockCounts.branchId, filters.branchId));
  if (filters.costCenterId) conditions.push(eq(stockCounts.costCenterId, filters.costCenterId));

  const [lines, [{ totalRevenue }]] = await Promise.all([
    db
      .select({
        stockItemId: stockCountLines.stockItemId,
        name: stockItems.name,
        legacyCode: stockItems.legacyCode,
        unitLabel: stockCountLines.unitLabel,
        systemQty: stockCountLines.systemQty,
        countedQty: stockCountLines.countedQty,
        rateAtCount: stockCountLines.rateAtCount,
        nonCogs: stockItems.nonCogs,
      })
      .from(stockCountLines)
      .innerJoin(stockCounts, eq(stockCountLines.stockCountId, stockCounts.id))
      .innerJoin(stockItems, eq(stockCountLines.stockItemId, stockItems.id))
      .where(and(...conditions)),
    db
      .select({ totalRevenue: sql<number>`coalesce(sum(${recipeSales.revenue}), 0)::float8` })
      .from(recipeSales)
      .where(and(gte(recipeSales.saleDate, filters.from), lte(recipeSales.saleDate, filters.to))),
  ]);

  const byItem = new Map<string, { name: string; code: string; unit: string | null; varianceQty: number; varianceValue: number }>();
  for (const l of lines) {
    if (l.countedQty == null) continue;
    if (filters.excludeNonCogs && l.nonCogs) continue;
    const varQty = l.countedQty - l.systemQty;
    const varValue = varQty * (l.rateAtCount ?? 0);
    const existing = byItem.get(l.stockItemId);
    if (existing) {
      existing.varianceQty += varQty;
      existing.varianceValue += varValue;
    } else {
      byItem.set(l.stockItemId, { name: l.name, code: l.legacyCode, unit: l.unitLabel, varianceQty: varQty, varianceValue: varValue });
    }
  }

  const items = [...byItem.values()];
  const negativeItems = items.filter((i) => i.varianceValue < 0).sort((a, b) => a.varianceValue - b.varianceValue);
  const positiveItems = items.filter((i) => i.varianceValue > 0).sort((a, b) => b.varianceValue - a.varianceValue);
  const negativeVarianceValue = negativeItems.reduce((s, i) => s + i.varianceValue, 0);
  const positiveVarianceValue = positiveItems.reduce((s, i) => s + i.varianceValue, 0);
  const netVarianceValue = negativeVarianceValue + positiveVarianceValue;

  return {
    negativeVarianceValue,
    positiveVarianceValue,
    netVarianceValue,
    negativeItemCount: negativeItems.length,
    positiveItemCount: positiveItems.length,
    netVarianceOfSalesPct: totalRevenue > 0 ? (netVarianceValue / totalRevenue) * 100 : null,
    negativeItems: negativeItems.slice(0, 12),
    positiveItems: positiveItems.slice(0, 12),
  };
}

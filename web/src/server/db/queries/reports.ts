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
} from "@/server/db/schema";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { loadCostingGraph, recipeCurrentCost, getSubRecipeCost } from "@/server/costing/recipeCost";
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
export async function listCostAdjustmentEvents(filters: { q?: string }) {
  const [history, graph, ingredientRows] = await Promise.all([
    db
      .select({ stockItemId: priceHistory.stockItemId, oldRate: priceHistory.oldRate, newRate: priceHistory.newRate, changedAt: priceHistory.changedAt, legacyCode: stockItems.legacyCode, name: stockItems.name })
      .from(priceHistory)
      .innerJoin(stockItems, eq(priceHistory.stockItemId, stockItems.id)),
    loadCostingGraph(),
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
  const topItems = [...itemSpend.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const weekSpend = new Map<string, number>();
  for (const i of invoices) {
    const w = i.weekLabel || (i.invoiceDate ? weekStart(i.invoiceDate) : null);
    if (!w) continue;
    weekSpend.set(w, (weekSpend.get(w) ?? 0) + (i.total ?? 0));
  }
  const weeks = [...weekSpend.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return { totalSpend, outstanding, outstandingCount, cashSpend, creditSpend, invoiceCount: invoices.length, buckets, topItems, weeks };
}

// Stock on hand across every item, with negative/below-minimum flags —
// index.html's Stock Page, minus the "par level" column (that map was
// never migrated into real data, so it'd just be an empty column here).
export async function getStockPageRows() {
  const [items, balances] = await Promise.all([
    db.select({ id: stockItems.id, legacyCode: stockItems.legacyCode, name: stockItems.name, issueUnit: stockItems.issueUnit, ratePerKgL: stockItems.ratePerKgL, minLevel: stockItems.minLevel, categoryName: categories.name, sourceType: stockItems.sourceType }).from(stockItems).leftJoin(categories, eq(stockItems.categoryId, categories.id)),
    db.select({ stockItemId: stockBalances.stockItemId, qtyOnHand: stockBalances.qtyOnHand }).from(stockBalances),
  ]);
  const qtyByItemId = new Map<string, number>();
  for (const b of balances) qtyByItemId.set(b.stockItemId, (qtyByItemId.get(b.stockItemId) ?? 0) + b.qtyOnHand);

  return items.map((it) => {
    const onHand = qtyByItemId.get(it.id) ?? 0;
    const flag = onHand < 0 ? "NEGATIVE" : it.minLevel != null && onHand < it.minLevel ? "BELOW MIN" : null;
    return { ...it, onHand, value: onHand * (it.ratePerKgL ?? 0), flag };
  });
}

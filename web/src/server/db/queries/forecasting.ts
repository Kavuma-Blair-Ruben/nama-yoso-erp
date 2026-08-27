import "server-only";
import { db } from "@/server/db";
import { stockItems, suppliers, stockMovements, stockBalances, grns, grnLines, branches, subRecipes, productionBatches } from "@/server/db/schema";
import { and, eq, gte, inArray, lt, desc } from "drizzle-orm";
import { convertQtyToCanonical } from "@/lib/unitMath";

// Movement types that represent real depletion driven by actual use, not
// internal transfers, count corrections, or supplier returns — this is the
// "demand" signal a reorder suggestion should be based on.
const CONSUMPTION_TYPES = ["POS_SALE", "PRODUCTION_CONSUME", "CK_SALE", "WASTAGE"] as const;

const DEFAULT_LEAD_TIME_DAYS = 3;
const SHORT_WINDOW_DAYS = 14;
const LONG_WINDOW_DAYS = 28;

export type PredictiveOrderSuggestion = {
  stockItemId: string;
  legacyCode: string;
  name: string;
  purchaseUnit: string | null;
  issueUnit: string | null;
  unitWeight: number | null;
  purchaseRate: number | null;
  itemTaxRate: number | null;
  supplierId: string;
  supplierName: string;
  leadTimeDays: number;
  leadTimeIsDefault: boolean;
  dailyDemand: number; // canonical basis (KG/L/piece), 14-day average
  fourWeekAvgDaily: number; // canonical basis, 28-day average
  currentStock: number; // canonical basis
  stockAtDelivery: number; // canonical basis
  suggestedQty: number; // canonical basis — caller converts to purchase-unit qty for a PO line
  coverageDays: number | null; // currentStock / dailyDemand, null when dailyDemand is 0
  status: "low" | "ontrack";
  lastOrderedDate: string | null;
};

// Real consumption (not a trained model) — sums actual stock-ledger outflow
// over a trailing window and divides by the window length. Two windows so
// the UI can show both the primary suggestion driver (14-day) and a longer
// 4-week comparison, same way the video's "4-wk avg" column reads.
async function getDemandRates(branchId: string): Promise<Map<string, { short: number; long: number }>> {
  const since = new Date();
  since.setDate(since.getDate() - LONG_WINDOW_DAYS);
  const shortCutoff = new Date();
  shortCutoff.setDate(shortCutoff.getDate() - SHORT_WINDOW_DAYS);

  const rows = await db
    .select({ stockItemId: stockMovements.stockItemId, qtyDelta: stockMovements.qtyDelta, createdAt: stockMovements.createdAt })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.branchId, branchId),
        inArray(stockMovements.movementType, [...CONSUMPTION_TYPES]),
        lt(stockMovements.qtyDelta, 0),
        gte(stockMovements.createdAt, since)
      )
    );

  const totals = new Map<string, { short: number; long: number }>();
  for (const r of rows) {
    const t = totals.get(r.stockItemId) ?? { short: 0, long: 0 };
    const qty = Math.abs(r.qtyDelta);
    t.long += qty;
    if (r.createdAt >= shortCutoff) t.short += qty;
    totals.set(r.stockItemId, t);
  }

  const rates = new Map<string, { short: number; long: number }>();
  for (const [id, t] of totals) rates.set(id, { short: t.short / SHORT_WINDOW_DAYS, long: t.long / LONG_WINDOW_DAYS });
  return rates;
}

export async function getPredictiveOrderSuggestions(
  branchId: string,
  opts: { targetCoverDays?: number } = {}
): Promise<{ rows: PredictiveOrderSuggestion[]; skippedNoDemandCount: number }> {
  const targetCoverDays = opts.targetCoverDays ?? SHORT_WINDOW_DAYS;

  const [items, balances, demandRates, grnDates] = await Promise.all([
    db
      .select({
        id: stockItems.id,
        legacyCode: stockItems.legacyCode,
        name: stockItems.name,
        purchaseUnit: stockItems.purchaseUnit,
        issueUnit: stockItems.issueUnit,
        unitWeight: stockItems.unitWeight,
        purchaseRate: stockItems.purchaseRate,
        itemTaxRate: stockItems.itemTaxRate,
        supplierId: stockItems.supplierId,
        supplierName: suppliers.name,
        leadTimeDays: suppliers.leadTimeDays,
      })
      .from(stockItems)
      .innerJoin(suppliers, eq(stockItems.supplierId, suppliers.id))
      .where(and(eq(stockItems.sourceType, "purchased"), eq(stockItems.isActive, true))),
    db
      .select({ stockItemId: stockBalances.stockItemId, qtyOnHand: stockBalances.qtyOnHand })
      .from(stockBalances)
      .where(eq(stockBalances.branchId, branchId)),
    getDemandRates(branchId),
    db
      .select({ stockItemId: grnLines.stockItemId, receivedDate: grns.receivedDate })
      .from(grnLines)
      .innerJoin(grns, eq(grnLines.grnId, grns.id))
      .where(eq(grns.status, "POSTED")),
  ]);

  const stockByItem = new Map<string, number>();
  for (const b of balances) stockByItem.set(b.stockItemId, (stockByItem.get(b.stockItemId) ?? 0) + b.qtyOnHand);

  const lastOrderedByItem = new Map<string, string>();
  for (const g of grnDates) {
    if (!g.receivedDate) continue;
    const prev = lastOrderedByItem.get(g.stockItemId);
    if (!prev || g.receivedDate > prev) lastOrderedByItem.set(g.stockItemId, g.receivedDate);
  }

  const rows: PredictiveOrderSuggestion[] = [];
  let skippedNoDemandCount = 0;

  for (const item of items) {
    const rate = demandRates.get(item.id);
    const dailyDemand = rate?.short ?? 0;
    if (dailyDemand <= 0) {
      skippedNoDemandCount++;
      continue;
    }

    const currentStock = stockByItem.get(item.id) ?? 0;
    const leadTimeIsDefault = item.leadTimeDays == null;
    const leadTimeDays = item.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
    const stockAtDelivery = currentStock - dailyDemand * leadTimeDays;
    const suggestedQty = Math.max(0, targetCoverDays * dailyDemand - stockAtDelivery);
    const coverageDays = dailyDemand > 0 ? currentStock / dailyDemand : null;
    const status: "low" | "ontrack" = stockAtDelivery <= 0 || (coverageDays != null && coverageDays < leadTimeDays) ? "low" : "ontrack";

    if (suggestedQty <= 0) continue;

    rows.push({
      stockItemId: item.id,
      legacyCode: item.legacyCode,
      name: item.name,
      purchaseUnit: item.purchaseUnit,
      issueUnit: item.issueUnit,
      unitWeight: item.unitWeight,
      purchaseRate: item.purchaseRate,
      itemTaxRate: item.itemTaxRate,
      supplierId: item.supplierId!,
      supplierName: item.supplierName,
      leadTimeDays,
      leadTimeIsDefault,
      dailyDemand,
      fourWeekAvgDaily: rate?.long ?? 0,
      currentStock,
      stockAtDelivery,
      suggestedQty,
      coverageDays,
      status,
      lastOrderedDate: lastOrderedByItem.get(item.id) ?? null,
    });
  }

  rows.sort((a, b) => (a.coverageDays ?? Infinity) - (b.coverageDays ?? Infinity));
  return { rows, skippedNoDemandCount };
}

// Total "Low stock" suggestion rows across every branch — drives the
// Overview tab's reorder-alerts KPI without duplicating the per-branch math
// above. Branches are processed sequentially, not Promise.all'd — each one
// already fires several queries internally (getPredictiveOrderSuggestions),
// and running all branches concurrently on top of that was enough
// simultaneous load to trip the Supabase pooler's statement_timeout on the
// Dashboard's already-busy Overview tab (same class of issue as the earlier
// Cost Dashboard fix — see getDashboardDigestStats below).
export async function getReorderAlertCount(): Promise<number> {
  // Excludes the Demo Branch — its practice stock levels shouldn't drive a
  // real reorder alert on the owner-facing dashboard digest.
  const allBranches = await db.select({ id: branches.id }).from(branches).where(eq(branches.isDemo, false));
  let total = 0;
  for (const b of allBranches) {
    const { rows } = await getPredictiveOrderSuggestions(b.id);
    total += rows.filter((row) => row.status === "low").length;
  }
  return total;
}

// Production has no per-item "lead time" the way a purchased item has a
// supplier's — a kitchen can start a batch same day. This is a flat
// planning buffer (not a per-item override, since nothing stores one),
// just enough that "low" means "start this today," not "already out."
const PRODUCTION_LEAD_TIME_DAYS = 1;

export type AutoProductionSuggestion = {
  subRecipeId: string;
  stockItemId: string;
  legacyCode: string;
  name: string;
  yieldQty: number | null; // native units, e.g. 5500 "G" — sub_recipes' own convention
  yieldUnit: string | null;
  dailyDemand: number; // canonical basis, 14-day average
  fourWeekAvgDaily: number; // canonical basis, 28-day average
  currentStock: number; // canonical basis
  stockAtDelivery: number; // canonical basis, after PRODUCTION_LEAD_TIME_DAYS of further demand
  suggestedScaleMultiplier: number; // how many times the base recipe yield to produce — feeds straight into ProductionBuilder's scaleMultiplier
  coverageDays: number | null;
  status: "low" | "ontrack";
  lastProducedDate: string | null;
};

// Same real-consumption math as getPredictiveOrderSuggestions, mirrored for
// produced (not purchased) items — "when does this sub-recipe need its next
// production batch," not "when does this ingredient need reordering."
// Reuses getDemandRates/stockBalances as-is since both already key off
// stockItemId regardless of sourceType.
export async function getAutoProductionSuggestions(
  branchId: string,
  opts: { targetCoverDays?: number } = {}
): Promise<{ rows: AutoProductionSuggestion[]; skippedNoDemandCount: number }> {
  const targetCoverDays = opts.targetCoverDays ?? SHORT_WINDOW_DAYS;

  const [subs, balances, demandRates, producedDates] = await Promise.all([
    db
      .select({
        subRecipeId: subRecipes.id,
        stockItemId: subRecipes.stockItemId,
        legacyCode: subRecipes.legacyCode,
        name: subRecipes.name,
        yieldQty: subRecipes.yieldQty,
        yieldUnit: subRecipes.yieldUnit,
      })
      .from(subRecipes)
      .where(and(eq(subRecipes.stockable, true), eq(subRecipes.isArchived, false))),
    db
      .select({ stockItemId: stockBalances.stockItemId, qtyOnHand: stockBalances.qtyOnHand })
      .from(stockBalances)
      .where(eq(stockBalances.branchId, branchId)),
    getDemandRates(branchId),
    db
      .select({ subRecipeId: productionBatches.subRecipeId, producedDate: productionBatches.producedDate })
      .from(productionBatches)
      .where(and(eq(productionBatches.branchId, branchId), eq(productionBatches.status, "CLOSED")))
      .orderBy(desc(productionBatches.producedDate)),
  ]);

  const stockByItem = new Map<string, number>();
  for (const b of balances) stockByItem.set(b.stockItemId, (stockByItem.get(b.stockItemId) ?? 0) + b.qtyOnHand);

  const lastProducedBySubRecipe = new Map<string, string>();
  for (const p of producedDates) {
    if (!lastProducedBySubRecipe.has(p.subRecipeId)) lastProducedBySubRecipe.set(p.subRecipeId, p.producedDate);
  }

  const rows: AutoProductionSuggestion[] = [];
  let skippedNoDemandCount = 0;

  for (const sub of subs) {
    const rate = demandRates.get(sub.stockItemId);
    const dailyDemand = rate?.short ?? 0;
    if (dailyDemand <= 0) {
      skippedNoDemandCount++;
      continue;
    }

    const canonicalYieldQty = convertQtyToCanonical(sub.yieldQty ?? 0, sub.yieldUnit);
    if (canonicalYieldQty <= 0) {
      // Yield isn't set up on this sub-recipe — can't turn a shortfall into
      // a scale multiplier without dividing by zero, so leave it out rather
      // than suggesting a meaningless batch size.
      continue;
    }

    const currentStock = stockByItem.get(sub.stockItemId) ?? 0;
    const stockAtDelivery = currentStock - dailyDemand * PRODUCTION_LEAD_TIME_DAYS;
    const suggestedQty = Math.max(0, targetCoverDays * dailyDemand - stockAtDelivery);
    const coverageDays = dailyDemand > 0 ? currentStock / dailyDemand : null;
    const status: "low" | "ontrack" = stockAtDelivery <= 0 || (coverageDays != null && coverageDays < PRODUCTION_LEAD_TIME_DAYS) ? "low" : "ontrack";

    if (suggestedQty <= 0) continue;

    rows.push({
      subRecipeId: sub.subRecipeId,
      stockItemId: sub.stockItemId,
      legacyCode: sub.legacyCode,
      name: sub.name,
      yieldQty: sub.yieldQty,
      yieldUnit: sub.yieldUnit,
      dailyDemand,
      fourWeekAvgDaily: rate?.long ?? 0,
      currentStock,
      stockAtDelivery,
      suggestedScaleMultiplier: suggestedQty / canonicalYieldQty,
      coverageDays,
      status,
      lastProducedDate: lastProducedBySubRecipe.get(sub.subRecipeId) ?? null,
    });
  }

  rows.sort((a, b) => (a.coverageDays ?? Infinity) - (b.coverageDays ?? Infinity));
  return { rows, skippedNoDemandCount };
}

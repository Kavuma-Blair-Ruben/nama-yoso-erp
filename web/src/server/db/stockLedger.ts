import "server-only";
import { and, eq, gt, asc } from "drizzle-orm";
import { db } from "@/server/db";
import { stockMovements, stockBalances, stockLots, stockItems } from "@/server/db/schema";

// Same tx-typing pattern used by postGRN/closeProductionBatch — the callback
// param drizzle passes into db.transaction() isn't structurally identical to
// `db` itself (it lacks `$client`).
type Db = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type MovementType =
  | "GRN_RECEIPT"
  | "PRODUCTION_CONSUME"
  | "PRODUCTION_OUTPUT"
  | "WASTAGE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "STOCK_COUNT_ADJUSTMENT"
  | "CK_SALE"
  | "CUSTOMER_RETURN"
  | "SUPPLIER_RETURN"
  | "POS_SALE";

export type LotSourceType = "grn" | "production" | "transfer_in" | "customer_return" | "stock_count" | "opening_balance" | "deficit";

const MOVEMENT_TO_LOT_SOURCE: Partial<Record<MovementType, LotSourceType>> = {
  GRN_RECEIPT: "grn",
  PRODUCTION_OUTPUT: "production",
  TRANSFER_IN: "transfer_in",
  CUSTOMER_RETURN: "customer_return",
  STOCK_COUNT_ADJUSTMENT: "stock_count",
};

async function fallbackRate(tx: Db, stockItemId: string): Promise<number> {
  const [item] = await tx.select({ ratePerKgL: stockItems.ratePerKgL }).from(stockItems).where(eq(stockItems.id, stockItemId));
  return item?.ratePerKgL ?? 0;
}

// Keeps stock_items.rate_per_kg_l/rate_per_g_ml in sync with the globally
// (cross-branch) oldest lot that still has stock remaining — the FIFO-correct
// "what does the next unit consumed actually cost" answer. This is the move
// that keeps every existing reader of that field (recipe costing, Product
// Master, dashboards) correct with zero changes of its own: the field keeps
// meaning exactly what it always meant, it's just auto-maintained now instead
// of manually rescaled on every GRN. Left untouched if no positive-remaining
// lot exists anywhere (e.g. an item that's gone straight to a deficit) —
// nulling it out would break recipe costing's "missing ingredient" fallback
// for no benefit.
async function syncItemRateFromOldestLot(tx: Db, stockItemId: string): Promise<void> {
  const [oldest] = await tx
    .select({ ratePerKgL: stockLots.ratePerKgL })
    .from(stockLots)
    .where(and(eq(stockLots.stockItemId, stockItemId), gt(stockLots.qtyRemaining, 0)))
    .orderBy(asc(stockLots.receivedAt))
    .limit(1);
  if (!oldest) return;
  await tx
    .update(stockItems)
    .set({ ratePerKgL: oldest.ratePerKgL, ratePerGMl: oldest.ratePerKgL / 1000, updatedAt: new Date() })
    .where(eq(stockItems.id, stockItemId));
}

/**
 * Appends one stock_movements row and keeps stock_balances in sync in the
 * same transaction — the ledger-plus-live-snapshot pattern already used for
 * price_history/stock_items.purchase_rate elsewhere in this schema. qtyDelta
 * must already be in the canonical KG/LTR-or-piece basis (see
 * src/lib/unitMath.ts's convertQtyToCanonical) — this function does no unit
 * conversion of its own.
 *
 * Also maintains the FIFO lot ledger (stock_lots): a positive qtyDelta
 * inserts one new lot at `args.rate`; a negative qtyDelta walks existing
 * lots for that stock_item+branch+cost_center oldest-received-first,
 * depleting each until the qty is satisfied, and returns the real
 * weighted-average cost of whatever was actually drawn down. If every lot
 * is exhausted and there's still a shortfall, one more lot is inserted with
 * negative qtyRemaining (a "deficit") rather than a special netting step —
 * this app already tolerates negative stock, and it keeps
 * SUM(stock_lots.qty_remaining) === stock_balances.qty_on_hand true always.
 */
export async function recordStockMovement(
  tx: Db,
  args: {
    stockItemId: string;
    branchId: string;
    costCenterId: string;
    qtyDelta: number;
    unitLabel?: string | null;
    movementType: MovementType;
    refType?: string;
    refId?: string;
    notes?: string;
    // Optional — a webhook-triggered movement (e.g. a POS sale) has no
    // logged-in user. stock_movements.created_by is a nullable FK.
    actorId?: string;
    // Only meaningful for a positive qtyDelta (a receipt) — the canonical
    // per-unit cost basis for the new lot this creates. Falls back to the
    // item's current rate if omitted (e.g. a stock-count "found extra"
    // adjustment with no real purchase behind it). Ignored for a negative
    // qtyDelta — FIFO consumption computes its own cost from existing lots.
    rate?: number | null;
    // Mirrors grn_lines.lot_no / production_batches.lot_no when this
    // movement's receipt came from one of those, for display/traceability.
    lotNo?: string | null;
  }
): Promise<{ balanceAfter: number; costPerUnit: number; totalCost: number }> {
  const [existing] = await tx
    .select()
    .from(stockBalances)
    .where(and(eq(stockBalances.stockItemId, args.stockItemId), eq(stockBalances.branchId, args.branchId), eq(stockBalances.costCenterId, args.costCenterId)));

  const newQty = (existing?.qtyOnHand ?? 0) + args.qtyDelta;

  if (existing) {
    await tx.update(stockBalances).set({ qtyOnHand: newQty, updatedAt: new Date() }).where(eq(stockBalances.id, existing.id));
  } else {
    await tx.insert(stockBalances).values({ stockItemId: args.stockItemId, branchId: args.branchId, costCenterId: args.costCenterId, qtyOnHand: newQty });
  }

  let costPerUnit = 0;
  let totalCost = 0;

  if (args.qtyDelta > 0) {
    const rate = args.rate ?? (await fallbackRate(tx, args.stockItemId));
    await tx.insert(stockLots).values({
      stockItemId: args.stockItemId,
      branchId: args.branchId,
      costCenterId: args.costCenterId,
      sourceType: MOVEMENT_TO_LOT_SOURCE[args.movementType] ?? "stock_count",
      sourceRefId: args.refId,
      lotNo: args.lotNo,
      ratePerKgL: rate,
      qtyReceived: args.qtyDelta,
      qtyRemaining: args.qtyDelta,
    });
    costPerUnit = rate;
    totalCost = rate * args.qtyDelta;
  } else if (args.qtyDelta < 0) {
    let need = -args.qtyDelta;
    const lots = await tx
      .select()
      .from(stockLots)
      .where(
        and(
          eq(stockLots.stockItemId, args.stockItemId),
          eq(stockLots.branchId, args.branchId),
          eq(stockLots.costCenterId, args.costCenterId),
          gt(stockLots.qtyRemaining, 0)
        )
      )
      .orderBy(asc(stockLots.receivedAt));

    let costSum = 0;
    let lastRate = 0;
    for (const lot of lots) {
      if (need <= 0.0001) break;
      const take = Math.min(lot.qtyRemaining, need);
      await tx.update(stockLots).set({ qtyRemaining: lot.qtyRemaining - take }).where(eq(stockLots.id, lot.id));
      costSum += take * lot.ratePerKgL;
      lastRate = lot.ratePerKgL;
      need -= take;
    }
    if (need > 0.0001) {
      const rate = lastRate || (await fallbackRate(tx, args.stockItemId));
      await tx.insert(stockLots).values({
        stockItemId: args.stockItemId,
        branchId: args.branchId,
        costCenterId: args.costCenterId,
        sourceType: "deficit",
        sourceRefId: args.refId,
        ratePerKgL: rate,
        qtyReceived: 0,
        qtyRemaining: -need,
      });
      costSum += need * rate;
    }
    const consumedQty = -args.qtyDelta;
    costPerUnit = consumedQty > 0 ? costSum / consumedQty : 0;
    totalCost = costSum;
  }

  if (args.qtyDelta !== 0) {
    await syncItemRateFromOldestLot(tx, args.stockItemId);
  }

  await tx.insert(stockMovements).values({
    stockItemId: args.stockItemId,
    branchId: args.branchId,
    costCenterId: args.costCenterId,
    qtyDelta: args.qtyDelta,
    unitLabel: args.unitLabel ?? undefined,
    movementType: args.movementType,
    refType: args.refType,
    refId: args.refId,
    balanceAfter: newQty,
    costPerUnit: costPerUnit || undefined,
    totalCost: totalCost || undefined,
    notes: args.notes,
    createdBy: args.actorId,
  });

  return { balanceAfter: newQty, costPerUnit, totalCost };
}

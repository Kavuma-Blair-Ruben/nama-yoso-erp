import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { stockMovements, stockBalances } from "@/server/db/schema";

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
  | "SUPPLIER_RETURN";

/**
 * Appends one stock_movements row and keeps stock_balances in sync in the
 * same transaction — the ledger-plus-live-snapshot pattern already used for
 * price_history/stock_items.purchase_rate elsewhere in this schema. qtyDelta
 * must already be in the canonical KG/LTR-or-piece basis (see
 * src/lib/unitMath.ts's convertQtyToCanonical) — this function does no unit
 * conversion of its own.
 */
export async function recordStockMovement(
  tx: Db,
  args: {
    stockItemId: string;
    branchId: string;
    qtyDelta: number;
    unitLabel?: string | null;
    movementType: MovementType;
    refType?: string;
    refId?: string;
    notes?: string;
    actorId: string;
  }
): Promise<number> {
  const [existing] = await tx
    .select()
    .from(stockBalances)
    .where(and(eq(stockBalances.stockItemId, args.stockItemId), eq(stockBalances.branchId, args.branchId)));

  const newQty = (existing?.qtyOnHand ?? 0) + args.qtyDelta;

  if (existing) {
    await tx.update(stockBalances).set({ qtyOnHand: newQty, updatedAt: new Date() }).where(eq(stockBalances.id, existing.id));
  } else {
    await tx.insert(stockBalances).values({ stockItemId: args.stockItemId, branchId: args.branchId, qtyOnHand: newQty });
  }

  await tx.insert(stockMovements).values({
    stockItemId: args.stockItemId,
    branchId: args.branchId,
    qtyDelta: args.qtyDelta,
    unitLabel: args.unitLabel ?? undefined,
    movementType: args.movementType,
    refType: args.refType,
    refId: args.refId,
    balanceAfter: newQty,
    notes: args.notes,
    createdBy: args.actorId,
  });

  return newQty;
}

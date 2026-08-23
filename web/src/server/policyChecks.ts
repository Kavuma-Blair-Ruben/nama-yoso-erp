import { and, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { purchaseOrders, purchaseOrderLines, grns, grnLines, suppliers, stockItems, stockBalances, policySettings, locationOrderLimits, branchReceivingLimits } from "@/server/db/schema";

// Ported from index.html's checkOrderingLimit/checkReceivingLimit/
// checkLocationOrderLimit/checkAbovePeLimit — every one of these is a
// non-blocking warning surfaced to the user, never a hard stop. Only
// policySettings.internalOnlyLocations blocks (checked separately, inline,
// where PO creation validates deliverTo).
// Called both with the plain `db` client (before a transaction opens, e.g.
// PO creation) and with a transaction's `tx` (mid-transaction, e.g. GRN
// posting) — accept either, since a tx isn't structurally identical to `db`.
type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const FREQUENCY_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30, quarterly: 90 };

function cutoffDateStr(frequency: string): string {
  const days = FREQUENCY_DAYS[frequency] ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString().slice(0, 10);
}

function money0(n: number) {
  return "AED " + Math.round(n).toLocaleString();
}

export async function checkSupplierOrderingLimit(tx: Db, supplierId: string, newOrderAmount: number): Promise<string | null> {
  const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, supplierId));
  if (!supplier?.orderLimitAmount || !supplier.orderLimitFrequency) return null;
  const cutoff = cutoffDateStr(supplier.orderLimitFrequency);
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${purchaseOrderLines.qty} * ${purchaseOrderLines.rate} * (1 + ${purchaseOrderLines.taxRate}/100.0)), 0)::float8` })
    .from(purchaseOrders)
    .innerJoin(purchaseOrderLines, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
    .where(and(eq(purchaseOrders.supplierId, supplierId), gte(purchaseOrders.createdDate, cutoff), ne(purchaseOrders.status, "CANCELLED")));
  const projected = (row?.total ?? 0) + newOrderAmount;
  if (projected > supplier.orderLimitAmount) {
    return `${supplier.name}: ${money0(projected)} ${supplier.orderLimitFrequency} spend would exceed the ${money0(supplier.orderLimitAmount)} limit.`;
  }
  return null;
}

export async function checkSupplierReceivingLimit(tx: Db, supplierId: string, newGrnAmount: number): Promise<string | null> {
  const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, supplierId));
  if (!supplier?.receivingLimitAmount || !supplier.receivingLimitFrequency) return null;
  const cutoff = cutoffDateStr(supplier.receivingLimitFrequency);
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${grnLines.lineAmount} * (1 + ${grnLines.taxRate}/100.0)), 0)::float8` })
    .from(grns)
    .innerJoin(grnLines, eq(grnLines.grnId, grns.id))
    .where(and(eq(grns.supplierId, supplierId), gte(grns.receivedDate, cutoff), ne(grns.status, "DRAFT")));
  const projected = (row?.total ?? 0) + newGrnAmount;
  if (projected > supplier.receivingLimitAmount) {
    return `${supplier.name}: ${money0(projected)} ${supplier.receivingLimitFrequency} receiving value would exceed the ${money0(supplier.receivingLimitAmount)} invoice limit.`;
  }
  return null;
}

export async function checkLocationOrderLimit(tx: Db, location: string, newOrderAmount: number): Promise<string | null> {
  const [limit] = await tx.select().from(locationOrderLimits).where(eq(locationOrderLimits.location, location));
  if (!limit) return null;
  const cutoff = cutoffDateStr(limit.frequency);
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${purchaseOrderLines.qty} * ${purchaseOrderLines.rate} * (1 + ${purchaseOrderLines.taxRate}/100.0)), 0)::float8` })
    .from(purchaseOrders)
    .innerJoin(purchaseOrderLines, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
    .where(and(eq(purchaseOrders.deliverTo, location), gte(purchaseOrders.createdDate, cutoff), ne(purchaseOrders.status, "CANCELLED")));
  const projected = (row?.total ?? 0) + newOrderAmount;
  if (projected > limit.amount) {
    return `${location}: ${money0(projected)} ${limit.frequency} spend would exceed this location's ${money0(limit.amount)} order limit.`;
  }
  return null;
}

export async function checkBranchReceivingLimit(tx: Db, branchId: string, branchName: string, newGrnAmount: number): Promise<string | null> {
  const [limit] = await tx.select().from(branchReceivingLimits).where(eq(branchReceivingLimits.branchId, branchId));
  if (!limit) return null;
  const cutoff = cutoffDateStr(limit.frequency);
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${grnLines.lineAmount} * (1 + ${grnLines.taxRate}/100.0)), 0)::float8` })
    .from(grns)
    .innerJoin(grnLines, eq(grnLines.grnId, grns.id))
    .where(and(eq(grns.branchId, branchId), gte(grns.receivedDate, cutoff), ne(grns.status, "DRAFT")));
  const projected = (row?.total ?? 0) + newGrnAmount;
  if (projected > limit.amount) {
    return `${branchName}: ${money0(projected)} ${limit.frequency} receiving value would exceed this branch's ${money0(limit.amount)} receiving limit.`;
  }
  return null;
}

export async function checkAbovePeLimit(tx: Db, lines: { stockItemId: string; name: string; qty: number }[]): Promise<string | null> {
  const [settings] = await tx.select().from(policySettings);
  const pct = settings?.abovePparOverPct;
  if (!pct) return null;
  const breaches: string[] = [];
  for (const l of lines) {
    const [item] = await tx.select({ minLevel: stockItems.minLevel }).from(stockItems).where(eq(stockItems.id, l.stockItemId));
    if (item?.minLevel == null) continue;
    const [bal] = await tx
      .select({ onHand: sql<number>`coalesce(sum(${stockBalances.qtyOnHand}), 0)::float8` })
      .from(stockBalances)
      .where(eq(stockBalances.stockItemId, l.stockItemId));
    const projectedStock = (bal?.onHand ?? 0) + l.qty;
    const limit = item.minLevel * (1 + pct / 100);
    if (projectedStock > limit) breaches.push(l.name);
  }
  if (breaches.length) return `Ordering ${breaches.join(", ")} would push stock more than ${pct}% above par level.`;
  return null;
}

export async function checkAbovePriceBreach(
  tx: Db,
  lines: { stockItemId: string; rate: number; purchaseOrderLineId: string | null | undefined }[]
): Promise<string | null> {
  const [settings] = await tx.select().from(policySettings);
  const pct = settings?.receiveAbovePricePct;
  if (!pct) return null;
  const breaches: string[] = [];
  for (const l of lines) {
    if (!l.purchaseOrderLineId) continue;
    const [poLine] = await tx.select({ rate: purchaseOrderLines.rate }).from(purchaseOrderLines).where(eq(purchaseOrderLines.id, l.purchaseOrderLineId));
    if (!poLine?.rate) continue;
    const overPct = ((l.rate - poLine.rate) / poLine.rate) * 100;
    if (overPct > pct) {
      const [item] = await tx.select({ name: stockItems.name }).from(stockItems).where(eq(stockItems.id, l.stockItemId));
      breaches.push(`${item?.name ?? l.stockItemId} (${Math.round(overPct)}% over)`);
    }
  }
  if (breaches.length) return `Above expected price: ${breaches.join(", ")}.`;
  return null;
}

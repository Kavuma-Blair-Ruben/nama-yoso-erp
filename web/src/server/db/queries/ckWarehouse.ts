import "server-only";
import { db } from "@/server/db";
import { purchaseOrders, purchaseOrderLines, stockItems, suppliers, stockBalances } from "@/server/db/schema";
import { ne, eq } from "drizzle-orm";

// Aggregates every open Purchase Order by where it's being delivered —
// matches index.html's viewCKWarehouse exactly, just reading the real
// purchase_orders/purchase_order_lines tables instead of an in-memory array.
export async function getCkWarehouseData(destFilter?: string) {
  const orders = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplier: suppliers.name,
      deliverTo: purchaseOrders.deliverTo,
      status: purchaseOrders.status,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(ne(purchaseOrders.status, "CANCELLED"));

  const lines = await db
    .select({
      purchaseOrderId: purchaseOrderLines.purchaseOrderId,
      stockItemId: purchaseOrderLines.stockItemId,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      issueUnit: stockItems.issueUnit,
      unitLabel: purchaseOrderLines.unitLabel,
      qty: purchaseOrderLines.qty,
      rate: purchaseOrderLines.rate,
    })
    .from(purchaseOrderLines)
    .innerJoin(stockItems, eq(purchaseOrderLines.stockItemId, stockItems.id));

  const balances = await db.select({ stockItemId: stockBalances.stockItemId, qtyOnHand: stockBalances.qtyOnHand }).from(stockBalances);
  const qtyByItemId = new Map<string, number>();
  for (const b of balances) qtyByItemId.set(b.stockItemId, (qtyByItemId.get(b.stockItemId) ?? 0) + b.qtyOnHand);

  const linesByPo = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = linesByPo.get(l.purchaseOrderId) ?? [];
    arr.push(l);
    linesByPo.set(l.purchaseOrderId, arr);
  }

  const byDest = new Map<string, number>();
  for (const po of orders) {
    const dest = po.deliverTo || "Unspecified";
    byDest.set(dest, (byDest.get(dest) ?? 0) + 1);
  }

  const filteredOrdersRaw = destFilter ? orders.filter((po) => (po.deliverTo || "Unspecified") === destFilter) : orders;
  const filteredOrders = filteredOrdersRaw.map((po) => ({
    ...po,
    total: (linesByPo.get(po.id) ?? []).reduce((s, l) => s + l.qty * l.rate, 0),
  }));

  type ItemAgg = { name: string; legacyCode: string; stockItemId: string; unitLabel: string | null; issueUnit: string | null; totalQty: number; totalValue: number; poNumbers: Set<string> };
  const itemAgg = new Map<string, ItemAgg>();
  let totalValue = 0;
  for (const po of filteredOrders) {
    const poLines = linesByPo.get(po.id) ?? [];
    for (const l of poLines) {
      const key = l.stockItemId;
      if (!itemAgg.has(key)) itemAgg.set(key, { name: l.name, legacyCode: l.legacyCode, stockItemId: l.stockItemId, unitLabel: l.unitLabel, issueUnit: l.issueUnit, totalQty: 0, totalValue: 0, poNumbers: new Set() });
      const agg = itemAgg.get(key)!;
      agg.totalQty += l.qty;
      const value = l.qty * l.rate;
      agg.totalValue += value;
      agg.poNumbers.add(po.poNumber);
      totalValue += value;
    }
  }

  const itemRows = [...itemAgg.values()]
    .map((x) => ({ ...x, poCount: x.poNumbers.size, stockOnHand: qtyByItemId.get(x.stockItemId) ?? null }))
    .sort((a, b) => b.totalValue - a.totalValue);

  return {
    activeCount: orders.length,
    totalValue,
    filteredOrders,
    itemRows,
    destinations: [...byDest.entries()].sort((a, b) => b[1] - a[1]),
  };
}

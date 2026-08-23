import "server-only";
import { db } from "@/server/db";
import { purchaseOrders, purchaseOrderLines, suppliers, stockItems, branches } from "@/server/db/schema";
import { and, eq, ilike, or, sql, desc } from "drizzle-orm";

export async function listPurchaseOrders(filters: { q?: string; status?: string }) {
  const conditions = [];
  if (filters.q) conditions.push(or(ilike(purchaseOrders.poNumber, `%${filters.q}%`), ilike(suppliers.name, `%${filters.q}%`))!);
  if (filters.status) conditions.push(eq(purchaseOrders.status, filters.status));

  const rows = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplier: suppliers.name,
      createdDate: purchaseOrders.createdDate,
      status: purchaseOrders.status,
      // purchase_order_lines and purchase_orders both have an "id" column, and this
      // query also joins suppliers (also has "id") — interpolating ${purchaseOrders.id}
      // inside the subquery renders as a bare "id" and Postgres silently resolves it to
      // the LOCAL purchase_order_lines.id instead of the outer correlation (no error,
      // just wrong data). Must use literal qualified text for every reference.
      net: sql<number>`coalesce((select sum(purchase_order_lines.qty * purchase_order_lines.rate) from purchase_order_lines where purchase_order_lines.purchase_order_id = purchase_orders.id), 0)::float8`,
      vat: sql<number>`coalesce((select sum(purchase_order_lines.qty * purchase_order_lines.rate * purchase_order_lines.tax_rate / 100) from purchase_order_lines where purchase_order_lines.purchase_order_id = purchase_orders.id), 0)::float8`,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(purchaseOrders.poNumber));

  return rows.map((r) => ({ ...r, total: r.net + r.vat }));
}

export async function getPurchaseOrderDetail(id: string) {
  const [po] = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplierId: purchaseOrders.supplierId,
      supplier: suppliers.name,
      supplierTrn: suppliers.trn,
      supplierContactName: suppliers.contactName,
      supplierPhone: suppliers.phone,
      supplierEmail: suppliers.email,
      supplierPaymentTerms: suppliers.paymentTerms,
      branchId: purchaseOrders.branchId,
      branchName: branches.name,
      status: purchaseOrders.status,
      deliverTo: purchaseOrders.deliverTo,
      notes: purchaseOrders.notes,
      createdDate: purchaseOrders.createdDate,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .leftJoin(branches, eq(purchaseOrders.branchId, branches.id))
    .where(eq(purchaseOrders.id, id));
  if (!po) return null;

  const lines = await db
    .select({
      id: purchaseOrderLines.id,
      lineNo: purchaseOrderLines.lineNo,
      stockItemId: purchaseOrderLines.stockItemId,
      name: stockItems.name,
      unitLabel: purchaseOrderLines.unitLabel,
      qty: purchaseOrderLines.qty,
      rate: purchaseOrderLines.rate,
      taxRate: purchaseOrderLines.taxRate,
    })
    .from(purchaseOrderLines)
    .innerJoin(stockItems, eq(purchaseOrderLines.stockItemId, stockItems.id))
    .where(eq(purchaseOrderLines.purchaseOrderId, id))
    .orderBy(purchaseOrderLines.lineNo);

  const net = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const vat = lines.reduce((s, l) => s + l.qty * l.rate * (l.taxRate / 100), 0);
  return { po, lines, net, vat, total: net + vat };
}

export async function listPurchasableProductsForPicker() {
  return db
    .select({
      id: stockItems.id,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      purchaseUnit: stockItems.purchaseUnit,
      purchaseRate: stockItems.purchaseRate,
      supplierId: stockItems.supplierId,
      supplierName: suppliers.name,
      parLevel: stockItems.parLevel,
      issueUnit: stockItems.issueUnit,
      unitWeight: stockItems.unitWeight,
      itemTaxRate: stockItems.itemTaxRate,
    })
    .from(stockItems)
    .leftJoin(suppliers, eq(stockItems.supplierId, suppliers.id))
    .where(and(eq(stockItems.sourceType, "purchased"), eq(stockItems.isActive, true)))
    .orderBy(stockItems.name);
}

export async function listBranches() {
  return db.select({ id: branches.id, code: branches.code, name: branches.name }).from(branches);
}
export async function listAllSuppliers() {
  return db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(suppliers.name);
}

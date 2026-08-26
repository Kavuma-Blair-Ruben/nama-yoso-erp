import "server-only";
import { db } from "@/server/db";
import {
  grns,
  grnLines,
  purchaseOrders,
  purchaseOrderLines,
  suppliers,
  stockItems,
  branches,
  productionBatches,
  subRecipes,
  creditNotes,
  supplierReturns,
  supplierReturnLines,
  consolidatedInvoices,
  consolidatedInvoiceGrns,
  profiles,
  costCenters,
} from "@/server/db/schema";
import { and, eq, ilike, or, sql, desc, inArray, notInArray, gte, lte } from "drizzle-orm";

export async function listGrns(filters: { q?: string; costCenterId?: string; from?: string; to?: string }) {
  const conditions = [];
  if (filters.q) {
    conditions.push(
      or(ilike(grns.grnNumber, `%${filters.q}%`), ilike(suppliers.name, `%${filters.q}%`), ilike(purchaseOrders.poNumber, `%${filters.q}%`))!
    );
  }
  if (filters.costCenterId) conditions.push(eq(grns.costCenterId, filters.costCenterId));
  if (filters.from) conditions.push(gte(grns.receivedDate, filters.from));
  if (filters.to) conditions.push(lte(grns.receivedDate, filters.to));
  const rows = await db
    .select({
      id: grns.id,
      grnNumber: grns.grnNumber,
      poNumber: purchaseOrders.poNumber,
      supplier: suppliers.name,
      receivedDate: grns.receivedDate,
      invoiceNumber: grns.invoiceNumber,
      status: grns.status,
      paymentMethod: grns.paymentMethod,
      // This query joins suppliers and purchaseOrders, both of which have their own "id"
      // column — interpolating ${grns.id} inside the subquery renders as a bare "id",
      // which Postgres silently resolves to the LOCAL grn_lines.id instead of the outer
      // correlation (wrong data, no error). Must use literal qualified text.
      net: sql<number>`coalesce((select sum(case when grn_lines.is_foc then 0 else grn_lines.received_qty * grn_lines.rate * (1 - grn_lines.discount_pct / 100) end) from grn_lines where grn_lines.grn_id = grns.id), 0)::float8`,
      vat: sql<number>`coalesce((select sum(case when grn_lines.is_foc then 0 else grn_lines.received_qty * grn_lines.rate * (1 - grn_lines.discount_pct / 100) * grn_lines.tax_rate / 100 end) from grn_lines where grn_lines.grn_id = grns.id), 0)::float8`,
    })
    .from(grns)
    .innerJoin(suppliers, eq(grns.supplierId, suppliers.id))
    .leftJoin(purchaseOrders, eq(grns.purchaseOrderId, purchaseOrders.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(grns.grnNumber));

  return rows.map((r) => ({ ...r, total: r.net + r.vat }));
}

export async function getEligiblePOsForReceiving() {
  return db
    .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, supplier: suppliers.name })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(inArray(purchaseOrders.status, ["ORDERED", "PARTIALLY RECEIVED"]))
    .orderBy(desc(purchaseOrders.poNumber));
}

export async function getPOLinesForReceiving(poId: string) {
  const [po] = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplierId: purchaseOrders.supplierId,
      supplier: suppliers.name,
      branchId: purchaseOrders.branchId,
      costCenterId: purchaseOrders.costCenterId,
      costCenterName: costCenters.name,
      status: purchaseOrders.status,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .leftJoin(costCenters, eq(purchaseOrders.costCenterId, costCenters.id))
    .where(eq(purchaseOrders.id, poId));
  if (!po) return null;

  const lines = await db
    .select({
      id: purchaseOrderLines.id,
      stockItemId: purchaseOrderLines.stockItemId,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      unitLabel: purchaseOrderLines.unitLabel,
      qty: purchaseOrderLines.qty,
      rate: purchaseOrderLines.rate,
      taxRate: purchaseOrderLines.taxRate,
      currentRate: stockItems.purchaseRate,
      // grn_lines, grns, AND the outer purchase_order_lines all have an "id"
      // column, so every reference inside this correlated join subquery must
      // be table-qualified as literal text — drizzle's ${table.id} renders as
      // a bare "id" with no prefix, which Postgres rejects as ambiguous the
      // moment more than one in-scope table has a same-named column.
      alreadyReceived: sql<number>`coalesce((
        select sum(grn_lines.received_qty) from grn_lines
        join grns on grn_lines.grn_id = grns.id
        where grn_lines.purchase_order_line_id = purchase_order_lines.id and grns.status = 'POSTED'
      ), 0)::float8`,
    })
    .from(purchaseOrderLines)
    .innerJoin(stockItems, eq(purchaseOrderLines.stockItemId, stockItems.id))
    .where(eq(purchaseOrderLines.purchaseOrderId, poId))
    .orderBy(purchaseOrderLines.lineNo);

  return { po, lines };
}

export async function getGrnDetail(id: string) {
  const [grn] = await db
    .select({
      id: grns.id,
      grnNumber: grns.grnNumber,
      poNumber: purchaseOrders.poNumber,
      supplier: suppliers.name,
      supplierTrn: suppliers.trn,
      supplierContactName: suppliers.contactName,
      supplierPhone: suppliers.phone,
      supplierEmail: suppliers.email,
      branchId: grns.branchId,
      branchName: branches.name,
      receivedDate: grns.receivedDate,
      invoiceNumber: grns.invoiceNumber,
      invoiceDueDate: grns.invoiceDueDate,
      documentType: grns.documentType,
      attachmentUrl: grns.attachmentUrl,
      status: grns.status,
      purchaseOrderId: grns.purchaseOrderId,
      paymentMethod: grns.paymentMethod,
      paymentStatus: grns.paymentStatus,
      paidAt: grns.paidAt,
    })
    .from(grns)
    .innerJoin(suppliers, eq(grns.supplierId, suppliers.id))
    .leftJoin(branches, eq(grns.branchId, branches.id))
    .leftJoin(purchaseOrders, eq(grns.purchaseOrderId, purchaseOrders.id))
    .where(eq(grns.id, id));
  if (!grn) return null;

  const lines = await db
    .select({
      id: grnLines.id,
      name: stockItems.name,
      unitLabel: grnLines.unitLabel,
      receivedQty: grnLines.receivedQty,
      rate: grnLines.rate,
      discountPct: grnLines.discountPct,
      taxRate: grnLines.taxRate,
      isFoc: grnLines.isFoc,
      batchNo: grnLines.batchNo,
      lotNo: grnLines.lotNo,
      expiryDate: grnLines.expiryDate,
      condition: grnLines.condition,
      lineAmount: grnLines.lineAmount,
    })
    .from(grnLines)
    .innerJoin(stockItems, eq(grnLines.stockItemId, stockItems.id))
    .where(eq(grnLines.grnId, id));

  const net = lines.reduce((s, l) => s + l.lineAmount, 0);
  const vat = lines.reduce((s, l) => s + l.lineAmount * (l.taxRate / 100), 0);
  return { grn, lines, net, vat, total: net + vat };
}

export async function getGrnForEdit(id: string) {
  const [grn] = await db.select().from(grns).where(and(eq(grns.id, id), eq(grns.status, "DRAFT")));
  if (!grn) return null;

  const lines = await db
    .select({
      id: grnLines.id,
      stockItemId: grnLines.stockItemId,
      purchaseOrderLineId: grnLines.purchaseOrderLineId,
      name: stockItems.name,
      legacyCode: stockItems.legacyCode,
      unitLabel: grnLines.unitLabel,
      orderedQty: grnLines.orderedQty,
      receivedQty: grnLines.receivedQty,
      rate: grnLines.rate,
      discountPct: grnLines.discountPct,
      taxRate: grnLines.taxRate,
      isFoc: grnLines.isFoc,
      expiryDate: grnLines.expiryDate,
      condition: grnLines.condition,
      currentRate: stockItems.purchaseRate,
    })
    .from(grnLines)
    .innerJoin(stockItems, eq(grnLines.stockItemId, stockItems.id))
    .where(eq(grnLines.grnId, id));

  return { grn, lines };
}

export async function getGrnLinesForLabels(id: string) {
  const [grn] = await db
    .select({ id: grns.id, grnNumber: grns.grnNumber, supplier: suppliers.name, receivedDate: grns.receivedDate, status: grns.status })
    .from(grns)
    .innerJoin(suppliers, eq(grns.supplierId, suppliers.id))
    .where(eq(grns.id, id));
  if (!grn) return null;

  const lines = await db
    .select({
      id: grnLines.id,
      name: stockItems.name,
      legacyCode: stockItems.legacyCode,
      unitLabel: grnLines.unitLabel,
      receivedQty: grnLines.receivedQty,
      batchNo: grnLines.batchNo,
      lotNo: grnLines.lotNo,
      mfgDate: grnLines.mfgDate,
      expiryDate: grnLines.expiryDate,
      condition: grnLines.condition,
      stickerPrintedAt: grnLines.stickerPrintedAt,
    })
    .from(grnLines)
    .innerJoin(stockItems, eq(grnLines.stockItemId, stockItems.id))
    .where(eq(grnLines.grnId, id));

  return { grn, lines };
}

export async function getLotDetail(lotNo: string) {
  const [row] = await db
    .select({
      lineId: grnLines.id,
      name: stockItems.name,
      legacyCode: stockItems.legacyCode,
      unitLabel: grnLines.unitLabel,
      receivedQty: grnLines.receivedQty,
      batchNo: grnLines.batchNo,
      lotNo: grnLines.lotNo,
      mfgDate: grnLines.mfgDate,
      expiryDate: grnLines.expiryDate,
      condition: grnLines.condition,
      grnId: grns.id,
      grnNumber: grns.grnNumber,
      grnStatus: grns.status,
      receivedDate: grns.receivedDate,
      supplier: suppliers.name,
    })
    .from(grnLines)
    .innerJoin(grns, eq(grnLines.grnId, grns.id))
    .innerJoin(stockItems, eq(grnLines.stockItemId, stockItems.id))
    .innerJoin(suppliers, eq(grns.supplierId, suppliers.id))
    .where(eq(grnLines.lotNo, lotNo));

  if (row) return { source: "grn" as const, ...row };

  const [batch] = await db
    .select({
      productionBatchId: productionBatches.id,
      name: subRecipes.name,
      legacyCode: subRecipes.legacyCode,
      unitLabel: productionBatches.yieldUnit,
      yieldQty: productionBatches.yieldQty,
      batchNo: productionBatches.batchNo,
      lotNo: productionBatches.lotNo,
      producedDate: productionBatches.producedDate,
      expiryDate: productionBatches.expiryDate,
      status: productionBatches.status,
      branchName: branches.name,
    })
    .from(productionBatches)
    .innerJoin(subRecipes, eq(productionBatches.subRecipeId, subRecipes.id))
    .leftJoin(branches, eq(productionBatches.branchId, branches.id))
    .where(eq(productionBatches.lotNo, lotNo));

  return batch ? { source: "production" as const, ...batch } : null;
}

/* ============================================================
   Credit Notes
   ============================================================ */
export async function listCreditNotesForGrn(grnId: string) {
  return db
    .select({
      id: creditNotes.id,
      creditNoteNumber: creditNotes.creditNoteNumber,
      amount: creditNotes.amount,
      reason: creditNotes.reason,
      status: creditNotes.status,
      createdAt: creditNotes.createdAt,
    })
    .from(creditNotes)
    .where(eq(creditNotes.grnId, grnId))
    .orderBy(desc(creditNotes.createdAt));
}

export async function listAllCreditNotes() {
  return db
    .select({
      id: creditNotes.id,
      creditNoteNumber: creditNotes.creditNoteNumber,
      grnId: creditNotes.grnId,
      grnNumber: grns.grnNumber,
      supplierName: suppliers.name,
      amount: creditNotes.amount,
      reason: creditNotes.reason,
      status: creditNotes.status,
      createdAt: creditNotes.createdAt,
    })
    .from(creditNotes)
    .innerJoin(grns, eq(creditNotes.grnId, grns.id))
    .innerJoin(suppliers, eq(creditNotes.supplierId, suppliers.id))
    .orderBy(desc(creditNotes.createdAt));
}

export async function listSupplierReturnsForGrn(grnId: string) {
  return db
    .select({
      id: supplierReturns.id,
      number: supplierReturns.number,
      reason: supplierReturns.reason,
      value: supplierReturns.value,
      createdAt: supplierReturns.createdAt,
    })
    .from(supplierReturns)
    .where(eq(supplierReturns.grnId, grnId))
    .orderBy(desc(supplierReturns.createdAt));
}

export async function listAllSupplierReturns(filters: { from?: string; to?: string } = {}) {
  const conditions = [];
  if (filters.from) conditions.push(gte(supplierReturns.createdAt, new Date(filters.from + "T00:00:00")));
  if (filters.to) conditions.push(lte(supplierReturns.createdAt, new Date(filters.to + "T23:59:59")));
  return db
    .select({
      id: supplierReturns.id,
      number: supplierReturns.number,
      grnId: supplierReturns.grnId,
      grnNumber: grns.grnNumber,
      supplierName: suppliers.name,
      reason: supplierReturns.reason,
      value: supplierReturns.value,
      createdAt: supplierReturns.createdAt,
    })
    .from(supplierReturns)
    .innerJoin(grns, eq(supplierReturns.grnId, grns.id))
    .innerJoin(suppliers, eq(supplierReturns.supplierId, suppliers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(supplierReturns.createdAt));
}

// Each GRN line's remaining returnable qty = received - already returned
// against that specific line (across every past supplier return for this GRN).
export async function getGrnLinesForReturn(grnId: string) {
  const lines = await db
    .select({
      id: grnLines.id,
      stockItemId: grnLines.stockItemId,
      name: stockItems.name,
      legacyCode: stockItems.legacyCode,
      unitLabel: grnLines.unitLabel,
      receivedQty: grnLines.receivedQty,
      rate: grnLines.rate,
    })
    .from(grnLines)
    .innerJoin(stockItems, eq(grnLines.stockItemId, stockItems.id))
    .where(eq(grnLines.grnId, grnId));

  const returned = await db
    .select({ grnLineId: supplierReturnLines.grnLineId, qty: supplierReturnLines.qty })
    .from(supplierReturnLines)
    .innerJoin(supplierReturns, eq(supplierReturnLines.supplierReturnId, supplierReturns.id))
    .where(eq(supplierReturns.grnId, grnId));
  const returnedByLine = new Map<string, number>();
  for (const r of returned) returnedByLine.set(r.grnLineId, (returnedByLine.get(r.grnLineId) ?? 0) + r.qty);

  return lines.map((l) => ({ ...l, alreadyReturned: returnedByLine.get(l.id) ?? 0, remaining: Math.max(l.receivedQty - (returnedByLine.get(l.id) ?? 0), 0) }));
}

/* ============================================================
   Consolidated Invoices — groups POSTED GRNs (not already consolidated)
   by supplier, for combining several deliveries into one AP record.
   ============================================================ */
export async function listConsolidatableGrnsBySupplier() {
  const alreadyConsolidated = db.select({ grnId: consolidatedInvoiceGrns.grnId }).from(consolidatedInvoiceGrns);
  const rows = await db
    .select({
      id: grns.id,
      grnNumber: grns.grnNumber,
      receivedDate: grns.receivedDate,
      supplierId: grns.supplierId,
      supplierName: suppliers.name,
      net: sql<number>`coalesce((select sum(case when grn_lines.is_foc then 0 else grn_lines.received_qty * grn_lines.rate * (1 - grn_lines.discount_pct / 100) end) from grn_lines where grn_lines.grn_id = grns.id), 0)::float8`,
      vat: sql<number>`coalesce((select sum(case when grn_lines.is_foc then 0 else grn_lines.received_qty * grn_lines.rate * (1 - grn_lines.discount_pct / 100) * grn_lines.tax_rate / 100 end) from grn_lines where grn_lines.grn_id = grns.id), 0)::float8`,
    })
    .from(grns)
    .innerJoin(suppliers, eq(grns.supplierId, suppliers.id))
    .where(and(eq(grns.status, "POSTED"), notInArray(grns.id, alreadyConsolidated)))
    .orderBy(desc(grns.receivedDate));

  const bySupplier = new Map<string, { supplierId: string; supplierName: string; grns: { id: string; grnNumber: string; receivedDate: string; total: number }[] }>();
  for (const r of rows) {
    const g = bySupplier.get(r.supplierId) ?? { supplierId: r.supplierId, supplierName: r.supplierName, grns: [] };
    g.grns.push({ id: r.id, grnNumber: r.grnNumber, receivedDate: r.receivedDate, total: r.net + r.vat });
    bySupplier.set(r.supplierId, g);
  }
  return [...bySupplier.values()];
}

export async function listConsolidatedInvoices() {
  const rows = await db
    .select({
      id: consolidatedInvoices.id,
      number: consolidatedInvoices.number,
      supplierName: suppliers.name,
      invoiceDate: consolidatedInvoices.invoiceDate,
      total: consolidatedInvoices.total,
    })
    .from(consolidatedInvoices)
    .innerJoin(suppliers, eq(consolidatedInvoices.supplierId, suppliers.id))
    .orderBy(desc(consolidatedInvoices.number));

  const grnCounts = await db
    .select({ consolidatedInvoiceId: consolidatedInvoiceGrns.consolidatedInvoiceId, count: sql<number>`count(*)::int` })
    .from(consolidatedInvoiceGrns)
    .groupBy(consolidatedInvoiceGrns.consolidatedInvoiceId);
  const countById = new Map(grnCounts.map((c) => [c.consolidatedInvoiceId, c.count]));

  return rows.map((r) => ({ ...r, grnCount: countById.get(r.id) ?? 0 }));
}

export async function getConsolidatedInvoiceDetail(id: string) {
  const [ci] = await db
    .select({
      id: consolidatedInvoices.id,
      number: consolidatedInvoices.number,
      supplierName: suppliers.name,
      invoiceDate: consolidatedInvoices.invoiceDate,
      total: consolidatedInvoices.total,
      createdByName: profiles.name,
      createdAt: consolidatedInvoices.createdAt,
    })
    .from(consolidatedInvoices)
    .innerJoin(suppliers, eq(consolidatedInvoices.supplierId, suppliers.id))
    .leftJoin(profiles, eq(consolidatedInvoices.createdBy, profiles.id))
    .where(eq(consolidatedInvoices.id, id));
  if (!ci) return null;

  const grnRows = await db
    .select({
      grnId: grns.id,
      grnNumber: grns.grnNumber,
      receivedDate: grns.receivedDate,
      net: sql<number>`coalesce((select sum(case when grn_lines.is_foc then 0 else grn_lines.received_qty * grn_lines.rate * (1 - grn_lines.discount_pct / 100) end) from grn_lines where grn_lines.grn_id = grns.id), 0)::float8`,
      vat: sql<number>`coalesce((select sum(case when grn_lines.is_foc then 0 else grn_lines.received_qty * grn_lines.rate * (1 - grn_lines.discount_pct / 100) * grn_lines.tax_rate / 100 end) from grn_lines where grn_lines.grn_id = grns.id), 0)::float8`,
    })
    .from(consolidatedInvoiceGrns)
    .innerJoin(grns, eq(consolidatedInvoiceGrns.grnId, grns.id))
    .where(eq(consolidatedInvoiceGrns.consolidatedInvoiceId, id))
    .orderBy(desc(grns.receivedDate));

  return { ci, grns: grnRows.map((g) => ({ ...g, total: g.net + g.vat })) };
}

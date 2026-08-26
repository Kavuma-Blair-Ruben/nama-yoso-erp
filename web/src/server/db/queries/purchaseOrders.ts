import "server-only";
import { db } from "@/server/db";
import { purchaseOrders, purchaseOrderLines, suppliers, stockItems, branches, policySettings, poApprovalSteps, purchaseOrderApprovals, roles, profiles } from "@/server/db/schema";
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

export type PoApprovalStepProgress = { stepOrder: number; roleName: string; approvedByName: string | null; approvedAt: Date | null };

// Whether this specific PO's total actually triggers the chain, and how far
// through it this PO has gotten — null `applies` means the chain either
// isn't configured or this PO's total doesn't reach the threshold, so the
// UI can skip rendering the progress panel entirely rather than show an
// always-empty one.
export async function getPoApprovalProgress(id: string, total: number): Promise<{ applies: boolean; threshold: number | null; steps: PoApprovalStepProgress[] }> {
  const [settings] = await db.select({ threshold: policySettings.poApprovalThreshold }).from(policySettings);
  const chain = await db
    .select({ stepOrder: poApprovalSteps.stepOrder, roleName: roles.name })
    .from(poApprovalSteps)
    .innerJoin(roles, eq(poApprovalSteps.roleId, roles.id))
    .orderBy(poApprovalSteps.stepOrder);

  const done = await db
    .select({ stepOrder: purchaseOrderApprovals.stepOrder, approvedByName: profiles.name, approvedAt: purchaseOrderApprovals.approvedAt })
    .from(purchaseOrderApprovals)
    .innerJoin(profiles, eq(purchaseOrderApprovals.approvedBy, profiles.id))
    .where(eq(purchaseOrderApprovals.purchaseOrderId, id));

  // Two ways this panel is worth showing: the CURRENT chain config gates
  // this PO's total, or this specific PO already has real approval history
  // (recorded under a chain that may since have been reconfigured) — the
  // latter keeps old POs' audit trail visible even after policy changes.
  const currentlyApplies = settings?.threshold != null && chain.length > 0 && total >= settings.threshold;
  const applies = currentlyApplies || done.length > 0;
  if (!applies) return { applies: false, threshold: settings?.threshold ?? null, steps: [] };

  const doneByStep = new Map(done.map((d) => [d.stepOrder, d]));

  return {
    applies: true,
    threshold: settings!.threshold,
    steps: chain.map((s) => ({
      stepOrder: s.stepOrder,
      roleName: s.roleName,
      approvedByName: doneByStep.get(s.stepOrder)?.approvedByName ?? null,
      approvedAt: doneByStep.get(s.stepOrder)?.approvedAt ?? null,
    })),
  };
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

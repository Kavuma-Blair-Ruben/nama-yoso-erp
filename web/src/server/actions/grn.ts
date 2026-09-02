"use server";

import { revalidatePath } from "next/cache";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { grns, grnLines, purchaseOrders, purchaseOrderLines, stockItems, priceHistory, suppliers, branches, rolePurchaseLimits, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { assertBranchAccess } from "@/server/auth/branchAccess";
import { nextGrnNumber, nextBatchNumber, nextLotNumber } from "@/server/db/sequences";
import { uploadPhoto, deletePhoto } from "@/lib/supabaseAdmin";
import { recordStockMovement } from "@/server/db/stockLedger";
import { getDefaultCostCenterId } from "@/server/db/costCenterDefaults";
import { convertQtyToCanonical } from "@/lib/unitMath";
import { checkSupplierReceivingLimit, checkAbovePriceBreach, checkBranchReceivingLimit } from "@/server/policyChecks";
import { sendToRoutedPrinter } from "@/lib/printRouting";
import { buildGrnLabelEscPos } from "@/lib/escpos";
import { claimUsableLimitOverride } from "@/server/actions/policies";

// Thrown inside a db.transaction() callback to trigger a real rollback when
// a role-cap block survives the claimUsableLimitOverride check (no approved
// exception found) — caught just outside the transaction and converted back
// into this action's normal { error } return shape.
class RoleCapBreachSignal extends Error {}

const lineSchema = z.object({
  stockItemId: z.string().min(1),
  purchaseOrderLineId: z.string().nullable().optional(),
  unitLabel: z.string().optional(),
  orderedQty: z.number().nullable().optional(),
  receivedQty: z.number().min(0),
  rate: z.number().min(0),
  discountPct: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).default(5),
  isFoc: z.boolean().default(false),
  expiryDate: z.string().optional(),
  mfgDate: z.string().optional(),
  condition: z.enum(["ACCEPTED", "DAMAGED", "REJECTED"]).default("ACCEPTED"),
  // Whether a rate that differs from the item's current master price should
  // be written back to stock_items.purchase_rate + price_history. Defaults
  // true so this can't silently change existing behavior for any caller that
  // doesn't send it (e.g. postDraftGrn, which rebuilds input from stored lines).
  updatePrice: z.boolean().default(true),
});

const grnInputSchema = z.object({
  purchaseOrderId: z.string().nullable(),
  supplierId: z.string().min(1),
  branchId: z.string().min(1),
  // Direct GRN only — an LPO-backed GRN always inherits the LPO's own
  // sector instead (see insertGrn).
  costCenterId: z.string().optional(),
  receivedDate: z.string().min(1),
  invoiceNumber: z.string().optional(),
  invoiceDueDate: z.string().optional(),
  documentType: z.enum(["TAX_INVOICE", "DELIVERY_NOTE"]).optional(),
  attachmentUrl: z.string().optional(),
  // Direct GRN only — a petty-cash purchase has no formal supplier
  // invoice, so the receipt/attachment is optional for it (see the
  // attachment gates in postGRN/postDraftGrn below).
  paymentMethod: z.enum(["INVOICE", "PETTY_CASH"]).default("INVOICE"),
  // Petty cash only — supplierId always points at one generic "Cash"
  // supplier for these, so this is the only place the real small/informal
  // vendor gets recorded. Purely informational.
  vendorNote: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

export type GrnActionResult = { error?: string; id?: string; warning?: string };

// The transaction client (`tx`) drizzle passes into db.transaction()'s callback
// isn't structurally identical to `db` itself (it lacks `$client`), so derive
// its type from the callback signature rather than reusing `typeof db`.
type Db = Parameters<Parameters<typeof db.transaction>[0]>[0];

function grnTotal(input: z.infer<typeof grnInputSchema>): number {
  return input.lines.reduce((s, l) => s + (l.isFoc ? 0 : l.receivedQty * l.rate * (1 - l.discountPct / 100) * (1 + l.taxRate / 100)), 0);
}

async function computeGrnWarning(tx: Db, input: z.infer<typeof grnInputSchema>): Promise<string | undefined> {
  const total = grnTotal(input);
  const warnings: string[] = [];
  const receivingBreach = await checkSupplierReceivingLimit(tx, input.supplierId, total);
  if (receivingBreach) warnings.push(receivingBreach);
  const priceBreach = await checkAbovePriceBreach(
    tx,
    input.lines.map((l) => ({ stockItemId: l.stockItemId, rate: l.rate, purchaseOrderLineId: l.purchaseOrderLineId }))
  );
  if (priceBreach) warnings.push(priceBreach);
  const [branch] = await tx.select({ name: branches.name }).from(branches).where(eq(branches.id, input.branchId));
  const branchBreach = await checkBranchReceivingLimit(tx, input.branchId, branch?.name ?? input.branchId, total);
  if (branchBreach) warnings.push(branchBreach);
  return warnings.length ? warnings.join(" ") : undefined;
}

// Unlike every other check above, this is a real block — a role with a
// configured maxGrnAmount can't post a single GRN over that value, same
// hard-stop precedent as policySettings.poApprovalThreshold.
async function checkRoleGrnCap(roleId: string, total: number): Promise<string | null> {
  const [limit] = await db.select({ maxGrnAmount: rolePurchaseLimits.maxGrnAmount }).from(rolePurchaseLimits).where(eq(rolePurchaseLimits.roleId, roleId));
  if (limit?.maxGrnAmount == null || total <= limit.maxGrnAmount) return null;
  return `This GRN (AED ${total.toFixed(2)}) is over your role's AED ${limit.maxGrnAmount} per-GRN limit — ask someone with a higher limit to post it.`;
}

// Real block — an LPO-backed GRN can't be posted until its PO has actually
// cleared the DRAFT -> APPROVED transition (see updatePOStatus's approval
// chain in purchaseOrders.ts). Without this, the multi-step approval chain
// only ever gated the PO's own status field, not the receiving it exists to
// control. Direct GRNs (no purchaseOrderId) are unaffected.
async function checkPoReceivable(purchaseOrderId: string): Promise<string | null> {
  const [po] = await db.select({ status: purchaseOrders.status, poNumber: purchaseOrders.poNumber }).from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId));
  if (!po) return null;
  if (po.status === "DRAFT") return `${po.poNumber} hasn't been approved yet — approve it before receiving against it.`;
  if (po.status === "CANCELLED") return `${po.poNumber} has been cancelled — it can't be received against.`;
  return null;
}

async function insertGrn(tx: Db, input: z.infer<typeof grnInputSchema>, status: "DRAFT" | "POSTED", actorId: string) {
  const grnNumber = await nextGrnNumber();

  // Inherit the sector from the LPO being received against, if it has one;
  // otherwise use whatever the Direct GRN form's picker sent, falling back
  // to the branch's General sector if even that's missing.
  let costCenterId: string | undefined;
  if (input.purchaseOrderId) {
    const [po] = await tx.select({ costCenterId: purchaseOrders.costCenterId }).from(purchaseOrders).where(eq(purchaseOrders.id, input.purchaseOrderId));
    costCenterId = po?.costCenterId ?? undefined;
  } else {
    costCenterId = input.costCenterId;
  }
  costCenterId ??= await getDefaultCostCenterId(tx, input.branchId);

  const [grn] = await tx
    .insert(grns)
    .values({
      grnNumber,
      purchaseOrderId: input.purchaseOrderId ?? undefined,
      supplierId: input.supplierId,
      branchId: input.branchId,
      costCenterId,
      receivedDate: input.receivedDate,
      invoiceNumber: input.invoiceNumber,
      invoiceDueDate: input.invoiceDueDate || undefined,
      documentType: input.documentType,
      attachmentUrl: input.attachmentUrl,
      paymentMethod: input.paymentMethod,
      vendorNote: input.paymentMethod === "PETTY_CASH" ? input.vendorNote?.trim() || undefined : undefined,
      // Cash is paid on the spot — there's no outstanding-payable concept
      // for a petty-cash purchase, unlike an invoice GRN which defaults to
      // OUTSTANDING until markGrnPaymentStatus marks it PAID later.
      paymentStatus: input.paymentMethod === "PETTY_CASH" ? "PAID" : "OUTSTANDING",
      status,
      postedAt: status === "POSTED" ? new Date() : undefined,
      postedBy: status === "POSTED" ? actorId : undefined,
      createdBy: actorId,
    })
    .returning({ id: grns.id });

  const batchNo = await nextBatchNumber();
  for (const [i, line] of input.lines.entries()) {
    const [item] = await tx.select({ legacyCode: stockItems.legacyCode }).from(stockItems).where(eq(stockItems.id, line.stockItemId));
    const lotNo = await nextLotNumber(item?.legacyCode ?? "GEN");
    const lineAmount = line.isFoc ? 0 : line.receivedQty * line.rate * (1 - line.discountPct / 100);
    await tx.insert(grnLines).values({
      grnId: grn.id,
      purchaseOrderLineId: line.purchaseOrderLineId ?? undefined,
      stockItemId: line.stockItemId,
      unitLabel: line.unitLabel,
      orderedQty: line.orderedQty ?? undefined,
      receivedQty: line.receivedQty,
      rate: line.rate,
      discountPct: line.discountPct,
      taxRate: line.taxRate,
      isFoc: line.isFoc,
      batchNo,
      lotNo,
      mfgDate: line.mfgDate || undefined,
      expiryDate: line.expiryDate || undefined,
      condition: line.condition,
      lineAmount,
    });
    void i;
  }

  return { grnId: grn.id, grnNumber, costCenterId };
}

async function applyGrnSideEffects(tx: Db, grnId: string, costCenterId: string, input: z.infer<typeof grnInputSchema>, actorId: string) {
  // Rate changes vs. current master price -> price_history + live rate update,
  // and a stock-in movement for every accepted line — the one place GRN
  // receiving needs a unit conversion (purchase unit -> canonical KG/LTR-or-
  // piece basis), since production/recipe costing already speak that basis.
  for (const line of input.lines) {
    if (line.condition !== "ACCEPTED") continue;
    const [item] = await tx.select().from(stockItems).where(eq(stockItems.id, line.stockItemId));
    if (!item) continue;

    if (line.updatePrice && item.purchaseRate != null && item.purchaseRate !== line.rate) {
      const scale = item.purchaseRate !== 0 ? line.rate / item.purchaseRate : 1;
      await tx
        .update(stockItems)
        .set({
          purchaseRate: line.rate,
          ratePerKgL: item.ratePerKgL != null ? item.ratePerKgL * scale : undefined,
          ratePerGMl: item.ratePerGMl != null ? item.ratePerGMl * scale : undefined,
          updatedAt: new Date(),
        })
        .where(eq(stockItems.id, item.id));
      await tx.insert(priceHistory).values({ stockItemId: item.id, oldRate: item.purchaseRate, newRate: line.rate, changedBy: actorId, source: "grn", grnId });
    }

    if (line.receivedQty > 0) {
      const qtyInIssueUnit = line.receivedQty * (item.unitWeight ?? 1);
      const canonicalQty = convertQtyToCanonical(qtyInIssueUnit, item.issueUnit);
      await recordStockMovement(tx, {
        stockItemId: item.id,
        branchId: input.branchId,
        costCenterId,
        qtyDelta: canonicalQty,
        unitLabel: item.issueUnit,
        movementType: "GRN_RECEIPT",
        refType: "grn",
        refId: grnId,
        actorId,
      });
    }
  }

  // Advance PO status by comparing cumulative posted-received qty to ordered qty.
  if (input.purchaseOrderId) {
    const poLines = await tx
      .select({
        id: purchaseOrderLines.id,
        qty: purchaseOrderLines.qty,
        // grn_lines, grns, and purchase_order_lines all have their own "id"
        // column — every reference in this correlated join subquery must be
        // table-qualified as literal text (drizzle's ${table.id} renders
        // unqualified and Postgres rejects that as ambiguous here).
        received: sql<number>`coalesce((
          select sum(grn_lines.received_qty) from grn_lines
          join grns on grn_lines.grn_id = grns.id
          where grn_lines.purchase_order_line_id = purchase_order_lines.id and grns.status = 'POSTED'
        ), 0)::float8`,
      })
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, input.purchaseOrderId));

    const allFull = poLines.every((l) => l.received >= l.qty);
    const anyReceived = poLines.some((l) => l.received > 0);
    const newStatus = allFull ? "FULLY RECEIVED" : anyReceived ? "PARTIALLY RECEIVED" : undefined;
    if (newStatus) await tx.update(purchaseOrders).set({ status: newStatus, updatedAt: new Date() }).where(eq(purchaseOrders.id, input.purchaseOrderId));
  }
}

export async function postGRN(input: z.infer<typeof grnInputSchema>): Promise<GrnActionResult> {
  const session = await assertPermission("grn", "edit");
  const parsed = grnInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one valid item line." };
  // Checked before the attachment requirement — no point sending someone off
  // to find the invoice for an order that isn't even approved yet.
  if (parsed.data.purchaseOrderId) {
    const poBreach = await checkPoReceivable(parsed.data.purchaseOrderId);
    if (poBreach) return { error: poBreach };
  }
  if (parsed.data.paymentMethod !== "PETTY_CASH" && !parsed.data.attachmentUrl?.trim()) {
    return { error: "Upload or scan the supplier invoice before posting — a GRN can't be closed without it." };
  }
  await assertBranchAccess(session, parsed.data.branchId);
  const total = grnTotal(parsed.data);
  const roleCapBreach = await checkRoleGrnCap(session.role.id, total);

  // Atomic: a failure partway through (e.g. the PO-status query) must not
  // leave a POSTED GRN with no price_history / PO-status side effects applied.
  let grnId: string, warning: string | undefined;
  try {
    ({ grnId, warning } = await db.transaction(async (tx) => {
      // A blocked role cap isn't necessarily a dead end — if this requester
      // has a designated approver's sign-off on file for this amount, spend
      // it now instead of blocking (see requestLimitOverride/reviewLimitOverride).
      if (roleCapBreach) {
        const claimed = await claimUsableLimitOverride(tx, session.profile.id, "GRN", total);
        if (!claimed) throw new RoleCapBreachSignal(roleCapBreach);
      }
      const created = await insertGrn(tx, parsed.data, "POSTED", session.profile.id);
      await applyGrnSideEffects(tx, created.grnId, created.costCenterId, parsed.data, session.profile.id);
      const grnWarning = await computeGrnWarning(tx, parsed.data);
      const [supplier] = await tx.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, parsed.data.supplierId));
      await tx.insert(auditLog).values({
        actorId: session.profile.id,
        action: "Goods Received",
        entity: "GRN",
        entityLabel: created.grnNumber,
        detail: `${supplier?.name ?? ""} — ${parsed.data.lines.length} line(s)${grnWarning ? " ⚠ " + grnWarning : ""}`,
      });
      return { ...created, warning: grnWarning };
    }));
  } catch (e) {
    if (e instanceof RoleCapBreachSignal) return { error: e.message };
    throw e;
  }
  // Best-effort, after the transaction commits — a missing/offline printer
  // must never undo a real GRN post that already adjusted stock.
  await printGrnLabels(grnId, parsed.data.branchId);

  revalidatePath("/grn");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  if (parsed.data.purchaseOrderId) revalidatePath(`/purchase-orders/${parsed.data.purchaseOrderId}`);
  return { id: grnId, warning };
}

export async function saveGrnDraft(input: z.infer<typeof grnInputSchema>): Promise<GrnActionResult> {
  const session = await assertPermission("grn", "edit");
  const parsed = grnInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one valid item line." };
  await assertBranchAccess(session, parsed.data.branchId);

  const { grnId } = await db.transaction(async (tx) => {
    const created = await insertGrn(tx, parsed.data, "DRAFT", session.profile.id);
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Saved", entity: "GRN", entityLabel: created.grnNumber, detail: "Stock not yet updated" });
    return created;
  });

  revalidatePath("/grn");
  return { id: grnId };
}

export async function postDraftGrn(id: string): Promise<GrnActionResult> {
  const session = await assertPermission("grn", "edit");

  const result = await db.transaction(async (tx) => {
    const [grn] = await tx.select().from(grns).where(and(eq(grns.id, id), eq(grns.status, "DRAFT")));
    if (!grn) return { error: "GRN not found or already posted." as const };
    await assertBranchAccess(session, grn.branchId);
    // Checked before the attachment requirement — no point sending someone
    // off to find the invoice for an order that isn't even approved yet.
    if (grn.purchaseOrderId) {
      const [po] = await tx.select({ status: purchaseOrders.status, poNumber: purchaseOrders.poNumber }).from(purchaseOrders).where(eq(purchaseOrders.id, grn.purchaseOrderId));
      if (po?.status === "DRAFT") return { error: `${po.poNumber} hasn't been approved yet — approve it before receiving against it.` as const };
      if (po?.status === "CANCELLED") return { error: `${po.poNumber} has been cancelled — it can't be received against.` as const };
    }
    if (grn.paymentMethod !== "PETTY_CASH" && !grn.attachmentUrl?.trim()) {
      return { error: "Upload or scan the supplier invoice before posting — a GRN can't be closed without it." as const };
    }

    const lines = await tx.select().from(grnLines).where(eq(grnLines.grnId, id));
    const input: z.infer<typeof grnInputSchema> = {
      purchaseOrderId: grn.purchaseOrderId,
      supplierId: grn.supplierId,
      branchId: grn.branchId,
      receivedDate: grn.receivedDate,
      paymentMethod: grn.paymentMethod as "INVOICE" | "PETTY_CASH",
      vendorNote: grn.vendorNote ?? undefined,
      lines: lines.map((l) => ({
        stockItemId: l.stockItemId,
        purchaseOrderLineId: l.purchaseOrderLineId,
        receivedQty: l.receivedQty,
        rate: l.rate,
        discountPct: l.discountPct,
        taxRate: l.taxRate,
        isFoc: l.isFoc,
        condition: l.condition as "ACCEPTED" | "DAMAGED" | "REJECTED",
        // The draft's per-line toggle isn't persisted (grn_lines has no such
        // column) — posting a saved draft always applies a detected price
        // change, matching this app's existing default-on behavior.
        updatePrice: true,
      })),
    };
    const draftTotal = grnTotal(input);
    const roleCapBreach = await checkRoleGrnCap(session.role.id, draftTotal);
    if (roleCapBreach) {
      const claimed = await claimUsableLimitOverride(tx, session.profile.id, "GRN", draftTotal);
      if (!claimed) return { error: roleCapBreach };
    }
    const costCenterId = grn.costCenterId ?? (await getDefaultCostCenterId(tx, grn.branchId));
    await applyGrnSideEffects(tx, id, costCenterId, input, session.profile.id);
    const grnWarning = await computeGrnWarning(tx, input);
    await tx.update(grns).set({ status: "POSTED", postedAt: new Date(), postedBy: session.profile.id }).where(eq(grns.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Posted", entity: "GRN", entityLabel: grn.grnNumber, detail: `Stock updated${grnWarning ? " ⚠ " + grnWarning : ""}` });
    return { id, warning: grnWarning, branchId: grn.branchId };
  });
  if ("error" in result) return result;
  // Best-effort, after the transaction commits — same reasoning as postGRN.
  await printGrnLabels(id, result.branchId);

  revalidatePath(`/grn/${id}`);
  revalidatePath("/grn");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return result;
}

export async function uploadGrnInvoice(formData: FormData): Promise<{ error?: string; url?: string }> {
  await assertPermission("grn", "edit");
  const file = formData.get("invoice");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an invoice file to upload." };

  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `grn-invoices/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const url = await uploadPhoto(path, file);
  return { url };
}

export async function deleteGrnInvoice(url: string): Promise<{ error?: string }> {
  await assertPermission("grn", "edit");
  try {
    await deletePhoto(url);
    return {};
  } catch {
    return { error: "Couldn't remove the old file, but you can still upload a replacement." };
  }
}

export async function updateGrnDraft(id: string, input: z.infer<typeof grnInputSchema>): Promise<GrnActionResult> {
  const session = await assertPermission("grn", "edit");
  const parsed = grnInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one valid item line." };

  const [existing] = await db.select().from(grns).where(and(eq(grns.id, id), eq(grns.status, "DRAFT")));
  if (!existing) return { error: "GRN not found or already posted — it can no longer be edited." };
  await assertBranchAccess(session, existing.branchId);
  await assertBranchAccess(session, parsed.data.branchId);

  await db.transaction(async (tx) => {
    let costCenterId: string | undefined;
    if (parsed.data.purchaseOrderId) {
      const [po] = await tx.select({ costCenterId: purchaseOrders.costCenterId }).from(purchaseOrders).where(eq(purchaseOrders.id, parsed.data.purchaseOrderId));
      costCenterId = po?.costCenterId ?? undefined;
    } else {
      costCenterId = parsed.data.costCenterId;
    }
    costCenterId ??= await getDefaultCostCenterId(tx, parsed.data.branchId);

    await tx
      .update(grns)
      .set({
        supplierId: parsed.data.supplierId,
        branchId: parsed.data.branchId,
        costCenterId,
        receivedDate: parsed.data.receivedDate,
        invoiceNumber: parsed.data.invoiceNumber,
        invoiceDueDate: parsed.data.invoiceDueDate || undefined,
        documentType: parsed.data.documentType,
        attachmentUrl: parsed.data.attachmentUrl,
        paymentMethod: parsed.data.paymentMethod,
        vendorNote: parsed.data.paymentMethod === "PETTY_CASH" ? parsed.data.vendorNote?.trim() || undefined : undefined,
        paymentStatus: parsed.data.paymentMethod === "PETTY_CASH" ? "PAID" : "OUTSTANDING",
      })
      .where(eq(grns.id, id));

    // Draft lines haven't affected stock/price yet, so it's safe to replace
    // them wholesale rather than diffing — same pattern as recipe editing.
    await tx.delete(grnLines).where(eq(grnLines.grnId, id));
    const batchNo = await nextBatchNumber();
    for (const line of parsed.data.lines) {
      const [item] = await tx.select({ legacyCode: stockItems.legacyCode }).from(stockItems).where(eq(stockItems.id, line.stockItemId));
      const lotNo = await nextLotNumber(item?.legacyCode ?? "GEN");
      const lineAmount = line.isFoc ? 0 : line.receivedQty * line.rate * (1 - line.discountPct / 100);
      await tx.insert(grnLines).values({
        grnId: id,
        purchaseOrderLineId: line.purchaseOrderLineId ?? undefined,
        stockItemId: line.stockItemId,
        unitLabel: line.unitLabel,
        orderedQty: line.orderedQty ?? undefined,
        receivedQty: line.receivedQty,
        rate: line.rate,
        discountPct: line.discountPct,
        taxRate: line.taxRate,
        isFoc: line.isFoc,
        batchNo,
        lotNo,
        mfgDate: line.mfgDate || undefined,
        expiryDate: line.expiryDate || undefined,
        condition: line.condition,
        lineAmount,
      });
    }

    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Edited", entity: "GRN", entityLabel: existing.grnNumber, detail: `${parsed.data.lines.length} line(s)` });
  });

  revalidatePath(`/grn/${id}`);
  revalidatePath("/grn");
  return { id };
}

export async function markGrnPaymentStatus(id: string, status: "OUTSTANDING" | "PAID"): Promise<GrnActionResult> {
  const session = await assertPermission("grn", "edit");

  const [grn] = await db.select({ grnNumber: grns.grnNumber, status: grns.status }).from(grns).where(eq(grns.id, id));
  if (!grn) return { error: "GRN not found." };
  if (grn.status !== "POSTED") return { error: "Only a posted GRN carries a real invoice — post it first." };

  await db
    .update(grns)
    .set({
      paymentStatus: status,
      paidAt: status === "PAID" ? new Date() : null,
      paidBy: status === "PAID" ? session.profile.id : null,
    })
    .where(eq(grns.id, id));

  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: status === "PAID" ? "Marked Paid" : "Marked Outstanding",
    entity: "GRN",
    entityLabel: grn.grnNumber,
    detail: status === "PAID" ? "Payment recorded" : "Reverted to outstanding",
  });

  revalidatePath(`/grn/${id}`);
  revalidatePath("/grn");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { id };
}

// Fires once, right after the auto-print effect actually shows the browser's
// print dialog for a freshly posted GRN's batch/lot stickers — same pattern
// as markExpiryTicketsPrinted / markProductionTicketPrinted.
export async function markGrnStickersPrinted(grnId: string, lineIds: string[]): Promise<{ error?: string }> {
  await assertPermission("grn", "edit");
  if (lineIds.length === 0) return {};
  const now = new Date();
  for (const lineId of lineIds) {
    await db.update(grnLines).set({ stickerPrintedAt: now }).where(eq(grnLines.id, lineId));
  }
  revalidatePath(`/grn/${grnId}`);
  return {};
}

// Sends one label per received line, in sequence, to whichever device the
// given branch has routed for 'grn_label'. Shared by the automatic
// post-posting print (see postGRN/postDraftGrn — fires the moment a GRN
// closes, for every received line, best-effort so a missing/offline
// printer never undoes a real receipt that already adjusted stock) and the
// manual "Send Labels to Printer" button (for re-printing after the fact,
// e.g. a sticker got damaged).
async function printGrnLabels(grnId: string, branchId: string): Promise<{ sent: number; total: number; lastError: string | null }> {
  const lines = await db
    .select({ name: stockItems.name, legacyCode: stockItems.legacyCode, batchNo: grnLines.batchNo, lotNo: grnLines.lotNo, mfgDate: grnLines.mfgDate, expiryDate: grnLines.expiryDate })
    .from(grnLines)
    .innerJoin(stockItems, eq(grnLines.stockItemId, stockItems.id))
    .where(eq(grnLines.grnId, grnId));

  let sent = 0;
  let lastError: string | null = null;
  for (const line of lines) {
    const result = await sendToRoutedPrinter(
      branchId,
      "grn_label",
      buildGrnLabelEscPos({ itemName: line.name, itemCode: line.legacyCode, batchNo: line.batchNo, lotNo: line.lotNo, mfgDate: line.mfgDate, expiryDate: line.expiryDate })
    );
    if (result.ok) sent++;
    else lastError = result.status;
  }
  return { sent, total: lines.length, lastError };
}

export async function sendGrnLabelsToRoutedPrinter(grnId: string): Promise<{ error?: string; ok?: boolean; message?: string }> {
  await assertPermission("grn", "view");
  const [grn] = await db.select({ branchId: grns.branchId }).from(grns).where(eq(grns.id, grnId));
  if (!grn) return { error: "GRN not found." };

  const { sent, total, lastError } = await printGrnLabels(grnId, grn.branchId);
  if (total === 0) return { error: "This GRN has no lines to label." };
  if (sent === 0) return { error: lastError ?? "No labels were sent." };
  return { ok: true, message: `Sent ${sent} of ${total} label(s).${sent < total ? ` Last error: ${lastError}` : ""}` };
}

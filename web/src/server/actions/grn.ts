"use server";

import { revalidatePath } from "next/cache";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { grns, grnLines, purchaseOrders, purchaseOrderLines, stockItems, priceHistory, suppliers, branches, rolePurchaseLimits, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextGrnNumber, nextBatchNumber, nextLotNumber } from "@/server/db/sequences";
import { uploadPhoto, deletePhoto } from "@/lib/supabaseAdmin";
import { recordStockMovement } from "@/server/db/stockLedger";
import { convertQtyToCanonical } from "@/lib/unitMath";
import { checkSupplierReceivingLimit, checkAbovePriceBreach, checkBranchReceivingLimit } from "@/server/policyChecks";

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
  receivedDate: z.string().min(1),
  invoiceNumber: z.string().optional(),
  invoiceDueDate: z.string().optional(),
  documentType: z.enum(["TAX_INVOICE", "DELIVERY_NOTE"]).optional(),
  attachmentUrl: z.string().optional(),
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

async function insertGrn(tx: Db, input: z.infer<typeof grnInputSchema>, status: "DRAFT" | "POSTED", actorId: string) {
  const grnNumber = await nextGrnNumber();
  const [grn] = await tx
    .insert(grns)
    .values({
      grnNumber,
      purchaseOrderId: input.purchaseOrderId ?? undefined,
      supplierId: input.supplierId,
      branchId: input.branchId,
      receivedDate: input.receivedDate,
      invoiceNumber: input.invoiceNumber,
      invoiceDueDate: input.invoiceDueDate || undefined,
      documentType: input.documentType,
      attachmentUrl: input.attachmentUrl,
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

  return { grnId: grn.id, grnNumber };
}

async function applyGrnSideEffects(tx: Db, grnId: string, input: z.infer<typeof grnInputSchema>, actorId: string) {
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
      await tx.insert(priceHistory).values({ stockItemId: item.id, oldRate: item.purchaseRate, newRate: line.rate, changedBy: actorId, source: "grn" });
    }

    if (line.receivedQty > 0) {
      const qtyInIssueUnit = line.receivedQty * (item.unitWeight ?? 1);
      const canonicalQty = convertQtyToCanonical(qtyInIssueUnit, item.issueUnit);
      await recordStockMovement(tx, {
        stockItemId: item.id,
        branchId: input.branchId,
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
  if (!parsed.data.attachmentUrl?.trim()) {
    return { error: "Upload or scan the supplier invoice before posting — a GRN can't be closed without it." };
  }
  const roleCapBreach = await checkRoleGrnCap(session.role.id, grnTotal(parsed.data));
  if (roleCapBreach) return { error: roleCapBreach };

  // Atomic: a failure partway through (e.g. the PO-status query) must not
  // leave a POSTED GRN with no price_history / PO-status side effects applied.
  const { grnId, warning } = await db.transaction(async (tx) => {
    const created = await insertGrn(tx, parsed.data, "POSTED", session.profile.id);
    await applyGrnSideEffects(tx, created.grnId, parsed.data, session.profile.id);
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
  });

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
    if (!grn.attachmentUrl?.trim()) {
      return { error: "Upload or scan the supplier invoice before posting — a GRN can't be closed without it." as const };
    }

    const lines = await tx.select().from(grnLines).where(eq(grnLines.grnId, id));
    const input: z.infer<typeof grnInputSchema> = {
      purchaseOrderId: grn.purchaseOrderId,
      supplierId: grn.supplierId,
      branchId: grn.branchId,
      receivedDate: grn.receivedDate,
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
    const roleCapBreach = await checkRoleGrnCap(session.role.id, grnTotal(input));
    if (roleCapBreach) return { error: roleCapBreach };
    await applyGrnSideEffects(tx, id, input, session.profile.id);
    const grnWarning = await computeGrnWarning(tx, input);
    await tx.update(grns).set({ status: "POSTED", postedAt: new Date(), postedBy: session.profile.id }).where(eq(grns.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Posted", entity: "GRN", entityLabel: grn.grnNumber, detail: `Stock updated${grnWarning ? " ⚠ " + grnWarning : ""}` });
    return { id, warning: grnWarning };
  });
  if ("error" in result) return result;

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

  await db.transaction(async (tx) => {
    await tx
      .update(grns)
      .set({
        supplierId: parsed.data.supplierId,
        branchId: parsed.data.branchId,
        receivedDate: parsed.data.receivedDate,
        invoiceNumber: parsed.data.invoiceNumber,
        invoiceDueDate: parsed.data.invoiceDueDate || undefined,
        documentType: parsed.data.documentType,
        attachmentUrl: parsed.data.attachmentUrl,
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

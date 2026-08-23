"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { stockTransfers, stockTransferLines, stockItems, auditLog, branches } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextTransferNo } from "@/server/db/sequences";
import { recordStockMovement } from "@/server/db/stockLedger";

const lineSchema = z.object({
  stockItemId: z.string().min(1),
  qty: z.number().min(0),
  unitLabel: z.string().optional(),
  rate: z.number().min(0).optional(),
});

const transferInputSchema = z.object({
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  transferDate: z.string().min(1),
  staffName: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

export type TransferActionResult = { error?: string; id?: string };

type Db = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertTransfer(tx: Db, input: z.infer<typeof transferInputSchema>, status: "DRAFT" | "IN_TRANSIT", actorId: string) {
  const transferNo = await nextTransferNo();

  let totalCost = 0;
  const lineRows: { stockItemId: string; qty: number; unitLabel?: string; rateAtTransfer?: number; amountAtTransfer?: number }[] = [];
  for (const l of input.lines) {
    const [item] = await tx.select({ ratePerKgL: stockItems.ratePerKgL }).from(stockItems).where(eq(stockItems.id, l.stockItemId));
    const rate = l.rate ?? item?.ratePerKgL ?? 0;
    const amount = l.qty * rate;
    totalCost += amount;
    lineRows.push({ stockItemId: l.stockItemId, qty: l.qty, unitLabel: l.unitLabel, rateAtTransfer: rate, amountAtTransfer: amount });
  }

  const [transfer] = await tx
    .insert(stockTransfers)
    .values({
      transferNo,
      fromBranchId: input.fromBranchId,
      toBranchId: input.toBranchId,
      transferDate: input.transferDate,
      staffName: input.staffName,
      notes: input.notes,
      totalCost,
      status,
      sentAt: status === "IN_TRANSIT" ? new Date() : undefined,
      sentBy: status === "IN_TRANSIT" ? actorId : undefined,
      createdBy: actorId,
    })
    .returning({ id: stockTransfers.id });

  for (const row of lineRows) {
    await tx.insert(stockTransferLines).values({ stockTransferId: transfer.id, ...row });
  }

  return { transferId: transfer.id, transferNo };
}

// Send: deducts the source branch only. Receive: credits the destination
// branch only. Split out of what used to be one applyTransferSideEffects
// call, so stock genuinely sits "in transit" — belonging to neither
// branch's balance — between the two steps, matching a real truck on the road.
async function applyTransferOut(tx: Db, transferId: string, input: z.infer<typeof transferInputSchema>, actorId: string) {
  for (const l of input.lines) {
    if (l.qty <= 0) continue;
    await recordStockMovement(tx, {
      stockItemId: l.stockItemId,
      branchId: input.fromBranchId,
      qtyDelta: -l.qty,
      unitLabel: l.unitLabel,
      movementType: "TRANSFER_OUT",
      refType: "stock_transfer",
      refId: transferId,
      actorId,
    });
  }
}

async function applyTransferIn(tx: Db, transferId: string, input: z.infer<typeof transferInputSchema>, actorId: string) {
  for (const l of input.lines) {
    if (l.qty <= 0) continue;
    await recordStockMovement(tx, {
      stockItemId: l.stockItemId,
      branchId: input.toBranchId,
      qtyDelta: l.qty,
      unitLabel: l.unitLabel,
      movementType: "TRANSFER_IN",
      refType: "stock_transfer",
      refId: transferId,
      actorId,
    });
  }
}

// Creates the transfer already IN_TRANSIT (skipping DRAFT) and deducts the
// source branch immediately — the destination doesn't get credited until a
// separate receiveTransfer() confirms the goods actually arrived.
export async function sendTransfer(input: z.infer<typeof transferInputSchema>): Promise<TransferActionResult> {
  const session = await assertPermission("transfers", "edit");
  const parsed = transferInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one item to transfer." };
  if (parsed.data.fromBranchId === parsed.data.toBranchId) return { error: "From and To branch must be different." };

  const { transferId } = await db.transaction(async (tx) => {
    const created = await insertTransfer(tx, parsed.data, "IN_TRANSIT", session.profile.id);
    await applyTransferOut(tx, created.transferId, parsed.data, session.profile.id);
    const [fromB] = await tx.select({ name: branches.name }).from(branches).where(eq(branches.id, parsed.data.fromBranchId));
    const [toB] = await tx.select({ name: branches.name }).from(branches).where(eq(branches.id, parsed.data.toBranchId));
    await tx.insert(auditLog).values({
      actorId: session.profile.id,
      action: "Transfer Sent",
      entity: "Stock Transfer",
      entityLabel: created.transferNo,
      detail: `${fromB?.name ?? ""} → ${toB?.name ?? ""} — ${parsed.data.lines.length} item(s), awaiting receipt`,
    });
    return created;
  });

  revalidatePath("/transfers");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { id: transferId };
}

export async function saveTransferDraft(input: z.infer<typeof transferInputSchema>): Promise<TransferActionResult> {
  const session = await assertPermission("transfers", "edit");
  const parsed = transferInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one item to transfer." };
  if (parsed.data.fromBranchId === parsed.data.toBranchId) return { error: "From and To branch must be different." };

  const { transferId } = await db.transaction(async (tx) => {
    const created = await insertTransfer(tx, parsed.data, "DRAFT", session.profile.id);
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Saved", entity: "Stock Transfer", entityLabel: created.transferNo, detail: "Stock not yet updated" });
    return created;
  });

  revalidatePath("/transfers");
  return { id: transferId };
}

// Promotes a DRAFT to IN_TRANSIT — same "send" side effect as sendTransfer,
// just reading the draft's already-saved lines instead of fresh input.
export async function sendTransferDraft(id: string): Promise<TransferActionResult> {
  const session = await assertPermission("transfers", "edit");

  const result = await db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.status, "DRAFT")));
    if (!transfer) return { error: "Transfer not found or already sent." as const };

    const lines = await tx.select().from(stockTransferLines).where(eq(stockTransferLines.stockTransferId, id));
    const input: z.infer<typeof transferInputSchema> = {
      fromBranchId: transfer.fromBranchId,
      toBranchId: transfer.toBranchId,
      transferDate: transfer.transferDate,
      staffName: transfer.staffName ?? undefined,
      notes: transfer.notes ?? undefined,
      lines: lines.map((l) => ({ stockItemId: l.stockItemId, qty: l.qty, unitLabel: l.unitLabel ?? undefined, rate: l.rateAtTransfer ?? undefined })),
    };
    await applyTransferOut(tx, id, input, session.profile.id);
    await tx.update(stockTransfers).set({ status: "IN_TRANSIT", sentAt: new Date(), sentBy: session.profile.id }).where(eq(stockTransfers.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Transfer Sent", entity: "Stock Transfer", entityLabel: transfer.transferNo, detail: "Source stock deducted, awaiting receipt" });
    return { id };
  });
  if ("error" in result) return result;

  revalidatePath(`/transfers/${id}`);
  revalidatePath("/transfers");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return result;
}

// The confirming step: credits the destination branch and closes the
// transfer out. Only valid from IN_TRANSIT — a still-DRAFT transfer has no
// stock movement to confirm yet.
export async function receiveTransfer(id: string): Promise<TransferActionResult> {
  const session = await assertPermission("transfers", "edit");

  const result = await db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.status, "IN_TRANSIT")));
    if (!transfer) return { error: "Transfer not found or not awaiting receipt." as const };

    const lines = await tx.select().from(stockTransferLines).where(eq(stockTransferLines.stockTransferId, id));
    const input: z.infer<typeof transferInputSchema> = {
      fromBranchId: transfer.fromBranchId,
      toBranchId: transfer.toBranchId,
      transferDate: transfer.transferDate,
      lines: lines.map((l) => ({ stockItemId: l.stockItemId, qty: l.qty, unitLabel: l.unitLabel ?? undefined, rate: l.rateAtTransfer ?? undefined })),
    };
    await applyTransferIn(tx, id, input, session.profile.id);
    await tx.update(stockTransfers).set({ status: "POSTED", postedAt: new Date(), postedBy: session.profile.id }).where(eq(stockTransfers.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Transfer Received", entity: "Stock Transfer", entityLabel: transfer.transferNo, detail: "Destination stock credited" });
    return { id };
  });
  if ("error" in result) return result;

  revalidatePath(`/transfers/${id}`);
  revalidatePath("/transfers");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return result;
}

export async function updateTransferDraft(id: string, input: z.infer<typeof transferInputSchema>): Promise<TransferActionResult> {
  const session = await assertPermission("transfers", "edit");
  const parsed = transferInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one item to transfer." };
  if (parsed.data.fromBranchId === parsed.data.toBranchId) return { error: "From and To branch must be different." };

  const [existing] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.status, "DRAFT")));
  if (!existing) return { error: "Transfer not found or already sent — it can no longer be edited." };

  await db.transaction(async (tx) => {
    let totalCost = 0;
    const lineRows: { stockItemId: string; qty: number; unitLabel?: string; rateAtTransfer?: number; amountAtTransfer?: number }[] = [];
    for (const l of parsed.data.lines) {
      const [item] = await tx.select({ ratePerKgL: stockItems.ratePerKgL }).from(stockItems).where(eq(stockItems.id, l.stockItemId));
      const rate = l.rate ?? item?.ratePerKgL ?? 0;
      const amount = l.qty * rate;
      totalCost += amount;
      lineRows.push({ stockItemId: l.stockItemId, qty: l.qty, unitLabel: l.unitLabel, rateAtTransfer: rate, amountAtTransfer: amount });
    }

    await tx
      .update(stockTransfers)
      .set({
        fromBranchId: parsed.data.fromBranchId,
        toBranchId: parsed.data.toBranchId,
        transferDate: parsed.data.transferDate,
        staffName: parsed.data.staffName,
        notes: parsed.data.notes,
        totalCost,
      })
      .where(eq(stockTransfers.id, id));

    await tx.delete(stockTransferLines).where(eq(stockTransferLines.stockTransferId, id));
    for (const row of lineRows) {
      await tx.insert(stockTransferLines).values({ stockTransferId: id, ...row });
    }

    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Edited", entity: "Stock Transfer", entityLabel: existing.transferNo, detail: `${parsed.data.lines.length} item(s)` });
  });

  revalidatePath(`/transfers/${id}`);
  revalidatePath("/transfers");
  return { id };
}

export async function deleteTransferDraft(id: string): Promise<TransferActionResult> {
  const session = await assertPermission("transfers", "edit");

  const [existing] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.status, "DRAFT")));
  if (!existing) return { error: "Transfer not found or already sent — it can no longer be deleted." };

  await db.transaction(async (tx) => {
    await tx.delete(stockTransferLines).where(eq(stockTransferLines.stockTransferId, id));
    await tx.delete(stockTransfers).where(eq(stockTransfers.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Deleted", entity: "Stock Transfer", entityLabel: existing.transferNo, detail: "Removed" });
  });

  revalidatePath("/transfers");
  return { id };
}

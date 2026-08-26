import "server-only";
import { db } from "@/server/db";
import { stockTransfers, stockTransferLines, stockItems, branches, profiles } from "@/server/db/schema";
import { and, eq, desc, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const fromBranch = alias(branches, "from_branch");
const toBranch = alias(branches, "to_branch");
const sentByProfile = alias(profiles, "sent_by_profile");
const postedByProfile = alias(profiles, "posted_by_profile");

export async function listTransfers(filters: { status?: string; from?: string; to?: string }) {
  const conditions = [];
  if (filters.status) conditions.push(eq(stockTransfers.status, filters.status));
  if (filters.from) conditions.push(gte(stockTransfers.transferDate, filters.from));
  if (filters.to) conditions.push(lte(stockTransfers.transferDate, filters.to));

  return db
    .select({
      id: stockTransfers.id,
      transferNo: stockTransfers.transferNo,
      fromBranchName: fromBranch.name,
      toBranchName: toBranch.name,
      transferDate: stockTransfers.transferDate,
      staffName: stockTransfers.staffName,
      totalCost: stockTransfers.totalCost,
      status: stockTransfers.status,
    })
    .from(stockTransfers)
    .innerJoin(fromBranch, eq(stockTransfers.fromBranchId, fromBranch.id))
    .innerJoin(toBranch, eq(stockTransfers.toBranchId, toBranch.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(stockTransfers.transferNo));
}

export async function getTransferDetail(id: string) {
  const [transfer] = await db
    .select({
      id: stockTransfers.id,
      transferNo: stockTransfers.transferNo,
      fromBranchId: stockTransfers.fromBranchId,
      fromBranchName: fromBranch.name,
      toBranchId: stockTransfers.toBranchId,
      toBranchName: toBranch.name,
      transferDate: stockTransfers.transferDate,
      staffName: stockTransfers.staffName,
      status: stockTransfers.status,
      totalCost: stockTransfers.totalCost,
      notes: stockTransfers.notes,
      sentAt: stockTransfers.sentAt,
      sentByName: sentByProfile.name,
      postedAt: stockTransfers.postedAt,
      postedByName: postedByProfile.name,
    })
    .from(stockTransfers)
    .innerJoin(fromBranch, eq(stockTransfers.fromBranchId, fromBranch.id))
    .innerJoin(toBranch, eq(stockTransfers.toBranchId, toBranch.id))
    .leftJoin(sentByProfile, eq(stockTransfers.sentBy, sentByProfile.id))
    .leftJoin(postedByProfile, eq(stockTransfers.postedBy, postedByProfile.id))
    .where(eq(stockTransfers.id, id));
  if (!transfer) return null;

  const lines = await db
    .select({
      id: stockTransferLines.id,
      stockItemId: stockTransferLines.stockItemId,
      name: stockItems.name,
      legacyCode: stockItems.legacyCode,
      qty: stockTransferLines.qty,
      unitLabel: stockTransferLines.unitLabel,
      rateAtTransfer: stockTransferLines.rateAtTransfer,
      amountAtTransfer: stockTransferLines.amountAtTransfer,
    })
    .from(stockTransferLines)
    .innerJoin(stockItems, eq(stockTransferLines.stockItemId, stockItems.id))
    .where(eq(stockTransferLines.stockTransferId, id));

  return { transfer, lines };
}

export async function getTransferForEdit(id: string) {
  const [transfer] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.status, "DRAFT")));
  if (!transfer) return null;

  const lines = await db
    .select({
      stockItemId: stockTransferLines.stockItemId,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      qty: stockTransferLines.qty,
      unitLabel: stockTransferLines.unitLabel,
      rateAtTransfer: stockTransferLines.rateAtTransfer,
    })
    .from(stockTransferLines)
    .innerJoin(stockItems, eq(stockTransferLines.stockItemId, stockItems.id))
    .where(eq(stockTransferLines.stockTransferId, id));

  return { transfer, lines };
}

// Same shape as getTransferForEdit but without the DRAFT filter — used to
// seed a "Repeat" form from any past transfer (typically POSTED).
export async function getTransferForClone(id: string) {
  const [transfer] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
  if (!transfer) return null;

  const lines = await db
    .select({
      stockItemId: stockTransferLines.stockItemId,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      qty: stockTransferLines.qty,
      unitLabel: stockTransferLines.unitLabel,
      rateAtTransfer: stockTransferLines.rateAtTransfer,
    })
    .from(stockTransferLines)
    .innerJoin(stockItems, eq(stockTransferLines.stockItemId, stockItems.id))
    .where(eq(stockTransferLines.stockTransferId, id));

  return { transfer, lines };
}

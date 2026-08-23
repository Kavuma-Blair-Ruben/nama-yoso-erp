import "server-only";
import { db } from "@/server/db";
import { grns, grnLines, stockItems, suppliers, productionBatches, subRecipes } from "@/server/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { todayStr } from "@/lib/format";

export const EXPIRY_BUCKET_ORDER = ["EXPIRED", "TODAY", "TOMORROW", "7 DAYS", "15 DAYS", "30 DAYS", "LATER"] as const;
export type ExpiryBucket = (typeof EXPIRY_BUCKET_ORDER)[number];
export const EXPIRY_BUCKET_LABELS: Record<ExpiryBucket, string> = {
  EXPIRED: "Already Expired",
  TODAY: "Expiring Today",
  TOMORROW: "Expiring Tomorrow",
  "7 DAYS": "Within 7 Days",
  "15 DAYS": "Within 15 Days",
  "30 DAYS": "Within 30 Days",
  LATER: "Later",
};

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function bucketOf(days: number): ExpiryBucket {
  if (days < 0) return "EXPIRED";
  if (days === 0) return "TODAY";
  if (days === 1) return "TOMORROW";
  if (days <= 7) return "7 DAYS";
  if (days <= 15) return "15 DAYS";
  if (days <= 30) return "30 DAYS";
  return "LATER";
}

export const MAX_EXPIRY_EXTENSIONS = 2;

export type ExpiryRow = {
  id: string;
  source: "grn_line" | "production_batch";
  kind: "Purchased" | "Produced";
  name: string;
  code: string;
  unit: string | null;
  qty: number;
  batchNo: string | null;
  lotNo: string | null;
  expiryDate: string;
  daysLeft: number;
  bucket: ExpiryBucket;
  supplier: string;
  reference: string;
  linkHref: string;
  extensionCount: number;
  extensionsLeft: number;
  ticketPrintedAt: string | null;
};

// Merges GRN-received batches and in-house production batches into one
// expiry-bucketed list — same aggregation as index.html's
// allReceivedBatches(), just sourced from the real tables instead of the
// in-memory GRN/production event arrays.
export async function listExpiringBatches(): Promise<ExpiryRow[]> {
  const today = todayStr();

  const purchased = await db
    .select({
      lineId: grnLines.id,
      name: stockItems.name,
      code: stockItems.legacyCode,
      unit: grnLines.unitLabel,
      qty: grnLines.receivedQty,
      batchNo: grnLines.batchNo,
      lotNo: grnLines.lotNo,
      expiryDate: grnLines.expiryDate,
      extensionCount: grnLines.expiryExtensionCount,
      ticketPrintedAt: grnLines.expiryTicketPrintedAt,
      supplier: suppliers.name,
      grnId: grns.id,
      grnNumber: grns.grnNumber,
    })
    .from(grnLines)
    .innerJoin(grns, eq(grnLines.grnId, grns.id))
    .innerJoin(stockItems, eq(grnLines.stockItemId, stockItems.id))
    .innerJoin(suppliers, eq(grns.supplierId, suppliers.id))
    .where(and(eq(grns.status, "POSTED"), eq(grnLines.condition, "ACCEPTED"), isNotNull(grnLines.expiryDate)));

  const produced = await db
    .select({
      name: subRecipes.name,
      code: subRecipes.legacyCode,
      unit: productionBatches.yieldUnit,
      qty: productionBatches.yieldQty,
      batchNo: productionBatches.batchNo,
      lotNo: productionBatches.lotNo,
      expiryDate: productionBatches.expiryDate,
      extensionCount: productionBatches.expiryExtensionCount,
      ticketPrintedAt: productionBatches.expiryTicketPrintedAt,
      id: productionBatches.id,
    })
    .from(productionBatches)
    .innerJoin(subRecipes, eq(productionBatches.subRecipeId, subRecipes.id))
    .where(and(eq(productionBatches.status, "POSTED"), isNotNull(productionBatches.expiryDate)));

  const rows: ExpiryRow[] = [
    ...purchased.map((b): ExpiryRow => {
      const days = daysBetween(today, b.expiryDate!);
      return {
        id: b.lineId,
        source: "grn_line",
        kind: "Purchased",
        name: b.name,
        code: b.code,
        unit: b.unit,
        qty: b.qty,
        batchNo: b.batchNo,
        lotNo: b.lotNo,
        expiryDate: b.expiryDate!,
        daysLeft: days,
        bucket: bucketOf(days),
        supplier: b.supplier,
        reference: b.grnNumber,
        linkHref: `/grn/${b.grnId}`,
        extensionCount: b.extensionCount,
        extensionsLeft: MAX_EXPIRY_EXTENSIONS - b.extensionCount,
        ticketPrintedAt: b.ticketPrintedAt ? b.ticketPrintedAt.toISOString() : null,
      };
    }),
    ...produced.map((b): ExpiryRow => {
      const days = daysBetween(today, b.expiryDate!);
      return {
        id: b.id,
        source: "production_batch",
        kind: "Produced",
        name: b.name,
        code: b.code,
        unit: b.unit,
        qty: b.qty,
        batchNo: b.batchNo,
        lotNo: b.lotNo,
        expiryDate: b.expiryDate!,
        daysLeft: days,
        bucket: bucketOf(days),
        supplier: "In-House Production",
        reference: b.batchNo,
        linkHref: `/production/${b.id}`,
        extensionCount: b.extensionCount,
        extensionsLeft: MAX_EXPIRY_EXTENSIONS - b.extensionCount,
        ticketPrintedAt: b.ticketPrintedAt ? b.ticketPrintedAt.toISOString() : null,
      };
    }),
  ];

  return rows.sort((a, b) => a.daysLeft - b.daysLeft);
}

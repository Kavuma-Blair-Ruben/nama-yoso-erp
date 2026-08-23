import "server-only";
import { db } from "@/server/db";
import { materialRequests, materialRequestLines, stockItems, profiles } from "@/server/db/schema";
import { and, eq, or, ilike, desc } from "drizzle-orm";

export const MR_LOCATIONS = ["Central Warehouse", "NAMAYOSO", "THG", "Kitchen", "Bar"] as const;
export const MR_STATUSES = ["PENDING APPROVAL", "APPROVED", "REJECTED", "FULFILLED"] as const;
export type MrStatus = (typeof MR_STATUSES)[number];

// Which status buttons are valid from the current one — matches
// index.html's mrDrawerHTML nextStatuses map exactly.
export const MR_NEXT_STATUSES: Record<MrStatus, MrStatus[]> = {
  "PENDING APPROVAL": ["APPROVED", "REJECTED"],
  APPROVED: ["FULFILLED"],
  REJECTED: [],
  FULFILLED: [],
};

export async function listMaterialRequests(filters: { q?: string; status?: string }) {
  const conditions = [];
  if (filters.q) {
    conditions.push(or(ilike(materialRequests.mrNumber, `%${filters.q}%`), ilike(materialRequests.fromLocation, `%${filters.q}%`), ilike(materialRequests.toLocation, `%${filters.q}%`))!);
  }
  if (filters.status) conditions.push(eq(materialRequests.status, filters.status));

  const rows = await db
    .select({
      id: materialRequests.id,
      mrNumber: materialRequests.mrNumber,
      fromLocation: materialRequests.fromLocation,
      toLocation: materialRequests.toLocation,
      requiredDate: materialRequests.requiredDate,
      status: materialRequests.status,
    })
    .from(materialRequests)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(materialRequests.mrNumber));

  const lineCounts = await db.select({ materialRequestId: materialRequestLines.materialRequestId }).from(materialRequestLines);
  const countByMr = new Map<string, number>();
  for (const l of lineCounts) countByMr.set(l.materialRequestId, (countByMr.get(l.materialRequestId) ?? 0) + 1);

  return rows.map((r) => ({ ...r, lineCount: countByMr.get(r.id) ?? 0 }));
}

export async function getMaterialRequestDetail(id: string) {
  const [request] = await db
    .select({
      id: materialRequests.id,
      mrNumber: materialRequests.mrNumber,
      fromLocation: materialRequests.fromLocation,
      toLocation: materialRequests.toLocation,
      requiredDate: materialRequests.requiredDate,
      status: materialRequests.status,
      notes: materialRequests.notes,
      createdAt: materialRequests.createdAt,
      createdByName: profiles.name,
    })
    .from(materialRequests)
    .leftJoin(profiles, eq(materialRequests.createdBy, profiles.id))
    .where(eq(materialRequests.id, id));
  if (!request) return null;

  const lines = await db
    .select({ id: materialRequestLines.id, stockItemId: materialRequestLines.stockItemId, name: stockItems.name, legacyCode: stockItems.legacyCode, qty: materialRequestLines.qty, unitLabel: materialRequestLines.unitLabel })
    .from(materialRequestLines)
    .innerJoin(stockItems, eq(materialRequestLines.stockItemId, stockItems.id))
    .where(eq(materialRequestLines.materialRequestId, id));

  return { request, lines };
}

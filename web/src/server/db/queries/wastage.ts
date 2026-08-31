import "server-only";
import { db } from "@/server/db";
import { wastageEvents, wastageLines, stockItems, categories, branches, profiles, wastageReasons } from "@/server/db/schema";
import { and, eq, desc, gte, lte } from "drizzle-orm";

export async function listWastageReasons() {
  return db.select({ id: wastageReasons.id, name: wastageReasons.name, isExpense: wastageReasons.isExpense }).from(wastageReasons).orderBy(wastageReasons.name);
}

// For the barcode scanner (see src/lib/scanCode.ts / src/server/actions/scanner.ts)
// — the wastage/scrap ticket prints wastageNo as a CODE128 barcode, this is
// what resolves a scan of it back to the real event, same "just enough to
// show a summary + link to the full page" shape as the scanner's product
// lookup.
export async function getWastageEventByNumber(wastageNo: string) {
  const [row] = await db
    .select({
      id: wastageEvents.id,
      wastageNo: wastageEvents.wastageNo,
      eventDate: wastageEvents.eventDate,
      costCenter: wastageEvents.costCenter,
      staffName: wastageEvents.staffName,
      status: wastageEvents.status,
      totalCost: wastageEvents.totalCost,
    })
    .from(wastageEvents)
    .where(eq(wastageEvents.wastageNo, wastageNo));
  return row ?? null;
}

export async function listWastageEvents(filters: { status?: string; costCenterId?: string; from?: string; to?: string; excludeDemo?: boolean }) {
  const conditions = [];
  if (filters.status) conditions.push(eq(wastageEvents.status, filters.status));
  if (filters.costCenterId) conditions.push(eq(wastageEvents.costCenterId, filters.costCenterId));
  if (filters.from) conditions.push(gte(wastageEvents.eventDate, filters.from));
  if (filters.to) conditions.push(lte(wastageEvents.eventDate, filters.to));
  // Only used by the Dashboard digest's "Wastage Today" KPI — the plain
  // Wastage list stays unfiltered.
  if (filters.excludeDemo) conditions.push(eq(branches.isDemo, false));

  return db
    .select({
      id: wastageEvents.id,
      wastageNo: wastageEvents.wastageNo,
      eventDate: wastageEvents.eventDate,
      costCenter: wastageEvents.costCenter,
      branchName: branches.name,
      staffName: wastageEvents.staffName,
      totalCost: wastageEvents.totalCost,
      status: wastageEvents.status,
    })
    .from(wastageEvents)
    .leftJoin(branches, eq(wastageEvents.branchId, branches.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(wastageEvents.wastageNo));
}

export async function getWastageEventDetail(id: string) {
  const [event] = await db
    .select({
      id: wastageEvents.id,
      wastageNo: wastageEvents.wastageNo,
      eventDate: wastageEvents.eventDate,
      costCenter: wastageEvents.costCenter,
      branchId: wastageEvents.branchId,
      branchName: branches.name,
      staffName: wastageEvents.staffName,
      status: wastageEvents.status,
      totalCost: wastageEvents.totalCost,
      postedAt: wastageEvents.postedAt,
      postedByName: profiles.name,
    })
    .from(wastageEvents)
    .leftJoin(branches, eq(wastageEvents.branchId, branches.id))
    .leftJoin(profiles, eq(wastageEvents.postedBy, profiles.id))
    .where(eq(wastageEvents.id, id));
  if (!event) return null;

  const lines = await db
    .select({
      id: wastageLines.id,
      stockItemId: wastageLines.stockItemId,
      name: stockItems.name,
      legacyCode: stockItems.legacyCode,
      qty: wastageLines.qty,
      unitLabel: wastageLines.unitLabel,
      reason: wastageLines.reason,
      notes: wastageLines.notes,
      rateAtWaste: wastageLines.rateAtWaste,
      amountAtWaste: wastageLines.amountAtWaste,
      photoUrl: wastageLines.photoUrl,
    })
    .from(wastageLines)
    .innerJoin(stockItems, eq(wastageLines.stockItemId, stockItems.id))
    .where(eq(wastageLines.wastageEventId, id));

  return { event, lines };
}

export async function getWastageEventForEdit(id: string) {
  const [event] = await db.select().from(wastageEvents).where(and(eq(wastageEvents.id, id), eq(wastageEvents.status, "DRAFT")));
  if (!event) return null;

  const lines = await db
    .select({
      stockItemId: wastageLines.stockItemId,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      qty: wastageLines.qty,
      unitLabel: wastageLines.unitLabel,
      reason: wastageLines.reason,
      notes: wastageLines.notes,
      rateAtWaste: wastageLines.rateAtWaste,
      photoUrl: wastageLines.photoUrl,
    })
    .from(wastageLines)
    .innerJoin(stockItems, eq(wastageLines.stockItemId, stockItems.id))
    .where(eq(wastageLines.wastageEventId, id));

  return { event, lines };
}

// Same shape as getWastageEventForEdit but without the DRAFT filter — used
// to seed a "Repeat" form from any past event (typically POSTED), not just
// an in-progress draft.
export async function getWastageEventForClone(id: string) {
  const [event] = await db.select().from(wastageEvents).where(eq(wastageEvents.id, id));
  if (!event) return null;

  const lines = await db
    .select({
      stockItemId: wastageLines.stockItemId,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      qty: wastageLines.qty,
      unitLabel: wastageLines.unitLabel,
      reason: wastageLines.reason,
      notes: wastageLines.notes,
      rateAtWaste: wastageLines.rateAtWaste,
      photoUrl: wastageLines.photoUrl,
    })
    .from(wastageLines)
    .innerJoin(stockItems, eq(wastageLines.stockItemId, stockItems.id))
    .where(eq(wastageLines.wastageEventId, id));

  return { event, lines };
}

// Report aggregates for the Wastage Tracking dashboard — reason/section/
// category breakdowns + top items, mirrors index.html's groupSum() but
// scoped to POSTED events only (drafts haven't affected stock yet).
export async function getWastageStats(filters: { costCenterId?: string } = {}) {
  const conditions = [eq(wastageEvents.status, "POSTED")];
  if (filters.costCenterId) conditions.push(eq(wastageEvents.costCenterId, filters.costCenterId));

  const rows = await db
    .select({
      amount: wastageLines.amountAtWaste,
      reason: wastageLines.reason,
      costCenter: wastageEvents.costCenter,
      category: categories.name,
      itemName: stockItems.name,
      eventDate: wastageEvents.eventDate,
    })
    .from(wastageLines)
    .innerJoin(wastageEvents, eq(wastageLines.wastageEventId, wastageEvents.id))
    .innerJoin(stockItems, eq(wastageLines.stockItemId, stockItems.id))
    .leftJoin(categories, eq(stockItems.categoryId, categories.id))
    .where(and(...conditions));

  function groupSum(key: "reason" | "costCenter" | "category" | "itemName") {
    const g = new Map<string, number>();
    for (const r of rows) {
      const k = r[key] || "Uncategorized";
      g.set(k, (g.get(k) ?? 0) + (r.amount ?? 0));
    }
    return [...g.entries()].sort((a, b) => b[1] - a[1]);
  }

  const totalWaste = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const days = new Set(rows.map((r) => r.eventDate)).size;

  return {
    totalWaste,
    eventCount: rows.length,
    days,
    avgPerDay: days ? totalWaste / days : 0,
    byReason: groupSum("reason"),
    bySection: groupSum("costCenter"),
    byCategory: groupSum("category"),
    topItems: groupSum("itemName").slice(0, 8),
  };
}

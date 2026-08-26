import "server-only";
import { db } from "@/server/db";
import { stockCounts, stockCountLines, stockItems, branches, profiles, stockCountTemplates, stockCountTemplateItems } from "@/server/db/schema";
import { and, eq, desc, count, gte, lte } from "drizzle-orm";

export async function listStockCounts(filters: { status?: string; from?: string; to?: string }) {
  const conditions = [];
  if (filters.status) conditions.push(eq(stockCounts.status, filters.status));
  if (filters.from) conditions.push(gte(stockCounts.countDate, filters.from));
  if (filters.to) conditions.push(lte(stockCounts.countDate, filters.to));

  const rows = await db
    .select({
      id: stockCounts.id,
      countNo: stockCounts.countNo,
      costCenter: stockCounts.costCenter,
      branchName: branches.name,
      countDate: stockCounts.countDate,
      totalVarianceValue: stockCounts.totalVarianceValue,
      status: stockCounts.status,
      lineCount: count(stockCountLines.id),
    })
    .from(stockCounts)
    .leftJoin(branches, eq(stockCounts.branchId, branches.id))
    .leftJoin(stockCountLines, eq(stockCountLines.stockCountId, stockCounts.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(stockCounts.id, branches.name)
    .orderBy(desc(stockCounts.countNo));

  return rows;
}

export async function getStockCountDetail(id: string) {
  const [stockCount] = await db
    .select({
      id: stockCounts.id,
      countNo: stockCounts.countNo,
      branchId: stockCounts.branchId,
      branchName: branches.name,
      costCenter: stockCounts.costCenter,
      countDate: stockCounts.countDate,
      staffName: stockCounts.staffName,
      status: stockCounts.status,
      totalVarianceValue: stockCounts.totalVarianceValue,
      postedAt: stockCounts.postedAt,
      postedByName: profiles.name,
    })
    .from(stockCounts)
    .leftJoin(branches, eq(stockCounts.branchId, branches.id))
    .leftJoin(profiles, eq(stockCounts.postedBy, profiles.id))
    .where(eq(stockCounts.id, id));
  if (!stockCount) return null;

  const lines = await db
    .select({
      id: stockCountLines.id,
      stockItemId: stockCountLines.stockItemId,
      name: stockItems.name,
      legacyCode: stockItems.legacyCode,
      systemQty: stockCountLines.systemQty,
      countedQty: stockCountLines.countedQty,
      unitLabel: stockCountLines.unitLabel,
      rateAtCount: stockCountLines.rateAtCount,
    })
    .from(stockCountLines)
    .innerJoin(stockItems, eq(stockCountLines.stockItemId, stockItems.id))
    .where(eq(stockCountLines.stockCountId, id));

  return { stockCount, lines };
}

// Templates only ever store the item roster — system qty is always re-read
// live from stockBalances (already prefetched into the builder) when a
// template is loaded into a new count, never stored on the template itself.
export async function listStockCountTemplatesWithItems() {
  const templates = await db.select({ id: stockCountTemplates.id, name: stockCountTemplates.name, costCenter: stockCountTemplates.costCenter }).from(stockCountTemplates).orderBy(stockCountTemplates.name);
  const items = await db.select({ templateId: stockCountTemplateItems.templateId, stockItemId: stockCountTemplateItems.stockItemId }).from(stockCountTemplateItems);
  return templates.map((t) => ({ ...t, stockItemIds: items.filter((i) => i.templateId === t.id).map((i) => i.stockItemId) }));
}

export async function getStockCountForEdit(id: string) {
  const [stockCount] = await db.select().from(stockCounts).where(and(eq(stockCounts.id, id), eq(stockCounts.status, "DRAFT")));
  if (!stockCount) return null;

  const lines = await getStockCountDraftLines(id);
  return { stockCount, lines };
}

// Split out from getStockCountForEdit so the "pull in others' counts"
// refresh action (see updateStockCountDraft's upsert-not-replace save,
// which lets concurrent counters' additions survive each other's saves)
// can re-fetch just the lines without a second full page load.
export async function getStockCountDraftLines(id: string) {
  return db
    .select({
      stockItemId: stockCountLines.stockItemId,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      systemQty: stockCountLines.systemQty,
      countedQty: stockCountLines.countedQty,
      unitLabel: stockCountLines.unitLabel,
      rateAtCount: stockCountLines.rateAtCount,
      countedByName: profiles.name,
    })
    .from(stockCountLines)
    .innerJoin(stockItems, eq(stockCountLines.stockItemId, stockItems.id))
    .leftJoin(profiles, eq(stockCountLines.countedBy, profiles.id))
    .where(eq(stockCountLines.stockCountId, id));
}

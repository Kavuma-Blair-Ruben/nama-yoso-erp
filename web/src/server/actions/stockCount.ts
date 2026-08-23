"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { stockCounts, stockCountLines, stockItems, stockBalances, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextStockCountNo } from "@/server/db/sequences";
import { recordStockMovement } from "@/server/db/stockLedger";

const lineSchema = z.object({
  stockItemId: z.string().min(1),
  systemQty: z.number(),
  countedQty: z.number().nullable(),
  unitLabel: z.string().optional(),
  rate: z.number().min(0).optional(),
});

const stockCountInputSchema = z.object({
  branchId: z.string().min(1),
  costCenter: z.string().optional(),
  countDate: z.string().min(1),
  staffName: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

export type StockCountActionResult = { error?: string; id?: string };

type Db = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The variance value shown while building/reviewing a count uses the
// systemQty snapshotted when each line was added, purely for context —
// applyStockCountSideEffects() re-reads the live balance right before
// posting, so the actual stock adjustment always reflects whatever else
// happened to that item/branch in between, not a stale snapshot.
function computeTotalVarianceValue(input: z.infer<typeof stockCountInputSchema>): number {
  return input.lines.reduce((s, l) => {
    if (l.countedQty == null) return s;
    return s + (l.countedQty - l.systemQty) * (l.rate ?? 0);
  }, 0);
}

async function insertStockCount(tx: Db, input: z.infer<typeof stockCountInputSchema>, status: "DRAFT" | "POSTED", actorId: string) {
  const countNo = await nextStockCountNo();
  const totalVarianceValue = computeTotalVarianceValue(input);

  const [stockCount] = await tx
    .insert(stockCounts)
    .values({
      countNo,
      branchId: input.branchId,
      costCenter: input.costCenter,
      countDate: input.countDate,
      staffName: input.staffName,
      totalVarianceValue,
      status,
      postedAt: status === "POSTED" ? new Date() : undefined,
      postedBy: status === "POSTED" ? actorId : undefined,
      createdBy: actorId,
    })
    .returning({ id: stockCounts.id });

  for (const l of input.lines) {
    const [item] = await tx.select({ ratePerKgL: stockItems.ratePerKgL }).from(stockItems).where(eq(stockItems.id, l.stockItemId));
    const rate = l.rate ?? item?.ratePerKgL ?? 0;
    await tx.insert(stockCountLines).values({
      stockCountId: stockCount.id,
      stockItemId: l.stockItemId,
      systemQty: l.systemQty,
      countedQty: l.countedQty ?? undefined,
      unitLabel: l.unitLabel,
      rateAtCount: rate,
    });
  }

  return { countId: stockCount.id, countNo };
}

async function applyStockCountSideEffects(tx: Db, countId: string, branchId: string, input: z.infer<typeof stockCountInputSchema>, actorId: string) {
  for (const l of input.lines) {
    if (l.countedQty == null) continue;
    const [balance] = await tx.select().from(stockBalances).where(and(eq(stockBalances.stockItemId, l.stockItemId), eq(stockBalances.branchId, branchId)));
    const currentQty = balance?.qtyOnHand ?? 0;
    const delta = l.countedQty - currentQty;
    if (Math.abs(delta) < 0.0001) continue;
    await recordStockMovement(tx, {
      stockItemId: l.stockItemId,
      branchId,
      qtyDelta: delta,
      unitLabel: l.unitLabel,
      movementType: "STOCK_COUNT_ADJUSTMENT",
      refType: "stock_count",
      refId: countId,
      notes: `Counted ${l.countedQty}, system showed ${currentQty}`,
      actorId,
    });
  }
}

export async function postStockCount(input: z.infer<typeof stockCountInputSchema>): Promise<StockCountActionResult> {
  const session = await assertPermission("stockcount", "edit");
  const parsed = stockCountInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one counted item." };

  const { countId } = await db.transaction(async (tx) => {
    const created = await insertStockCount(tx, parsed.data, "POSTED", session.profile.id);
    await applyStockCountSideEffects(tx, created.countId, parsed.data.branchId, parsed.data, session.profile.id);
    await tx.insert(auditLog).values({
      actorId: session.profile.id,
      action: "Stock Count Posted",
      entity: "Stock Count",
      entityLabel: created.countNo,
      detail: `${parsed.data.lines.length} item(s) counted`,
    });
    return created;
  });

  revalidatePath("/stock-count");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { id: countId };
}

export async function saveStockCountDraft(input: z.infer<typeof stockCountInputSchema>): Promise<StockCountActionResult> {
  const session = await assertPermission("stockcount", "edit");
  const parsed = stockCountInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one item to the count." };

  const { countId } = await db.transaction(async (tx) => {
    const created = await insertStockCount(tx, parsed.data, "DRAFT", session.profile.id);
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Saved", entity: "Stock Count", entityLabel: created.countNo, detail: "Stock not yet adjusted" });
    return created;
  });

  revalidatePath("/stock-count");
  return { id: countId };
}

export async function postStockCountDraft(id: string): Promise<StockCountActionResult> {
  const session = await assertPermission("stockcount", "edit");

  const result = await db.transaction(async (tx) => {
    const [stockCount] = await tx.select().from(stockCounts).where(and(eq(stockCounts.id, id), eq(stockCounts.status, "DRAFT")));
    if (!stockCount) return { error: "Stock count not found or already posted." as const };

    const lines = await tx.select().from(stockCountLines).where(eq(stockCountLines.stockCountId, id));
    const input: z.infer<typeof stockCountInputSchema> = {
      branchId: stockCount.branchId,
      costCenter: stockCount.costCenter ?? undefined,
      countDate: stockCount.countDate,
      staffName: stockCount.staffName ?? undefined,
      lines: lines.map((l) => ({ stockItemId: l.stockItemId, systemQty: l.systemQty, countedQty: l.countedQty, unitLabel: l.unitLabel ?? undefined, rate: l.rateAtCount ?? undefined })),
    };
    const totalVarianceValue = computeTotalVarianceValue(input);
    await applyStockCountSideEffects(tx, id, stockCount.branchId, input, session.profile.id);
    await tx.update(stockCounts).set({ status: "POSTED", postedAt: new Date(), postedBy: session.profile.id, totalVarianceValue }).where(eq(stockCounts.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Stock Count Posted", entity: "Stock Count", entityLabel: stockCount.countNo, detail: "Stock adjusted" });
    return { id };
  });
  if ("error" in result) return result;

  revalidatePath(`/stock-count/${id}`);
  revalidatePath("/stock-count");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return result;
}

export async function updateStockCountDraft(id: string, input: z.infer<typeof stockCountInputSchema>): Promise<StockCountActionResult> {
  const session = await assertPermission("stockcount", "edit");
  const parsed = stockCountInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one item to the count." };

  const [existing] = await db.select().from(stockCounts).where(and(eq(stockCounts.id, id), eq(stockCounts.status, "DRAFT")));
  if (!existing) return { error: "Stock count not found or already posted — it can no longer be edited." };

  await db.transaction(async (tx) => {
    const totalVarianceValue = computeTotalVarianceValue(parsed.data);
    await tx
      .update(stockCounts)
      .set({
        branchId: parsed.data.branchId,
        costCenter: parsed.data.costCenter,
        countDate: parsed.data.countDate,
        staffName: parsed.data.staffName,
        totalVarianceValue,
      })
      .where(eq(stockCounts.id, id));

    await tx.delete(stockCountLines).where(eq(stockCountLines.stockCountId, id));
    for (const l of parsed.data.lines) {
      const [item] = await tx.select({ ratePerKgL: stockItems.ratePerKgL }).from(stockItems).where(eq(stockItems.id, l.stockItemId));
      const rate = l.rate ?? item?.ratePerKgL ?? 0;
      await tx.insert(stockCountLines).values({
        stockCountId: id,
        stockItemId: l.stockItemId,
        systemQty: l.systemQty,
        countedQty: l.countedQty ?? undefined,
        unitLabel: l.unitLabel,
        rateAtCount: rate,
      });
    }

    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Edited", entity: "Stock Count", entityLabel: existing.countNo, detail: `${parsed.data.lines.length} item(s)` });
  });

  revalidatePath(`/stock-count/${id}`);
  revalidatePath("/stock-count");
  return { id };
}

export async function deleteStockCountDraft(id: string): Promise<StockCountActionResult> {
  const session = await assertPermission("stockcount", "edit");

  const [existing] = await db.select().from(stockCounts).where(and(eq(stockCounts.id, id), eq(stockCounts.status, "DRAFT")));
  if (!existing) return { error: "Stock count not found or already posted — it can no longer be deleted." };

  await db.transaction(async (tx) => {
    await tx.delete(stockCountLines).where(eq(stockCountLines.stockCountId, id));
    await tx.delete(stockCounts).where(eq(stockCounts.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Deleted", entity: "Stock Count", entityLabel: existing.countNo, detail: "Removed" });
  });

  revalidatePath("/stock-count");
  return { id };
}

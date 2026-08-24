"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { wastageEvents, wastageLines, stockItems, auditLog, costCenters } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextWastageNo } from "@/server/db/sequences";
import { recordStockMovement } from "@/server/db/stockLedger";
import { uploadPhoto, deletePhoto } from "@/lib/supabaseAdmin";
import { loadCostingGraph, recipeCurrentCost, flattenRecipeToStockLines, type RecipeWasteLine } from "@/server/costing/recipeCost";

const lineSchema = z.object({
  stockItemId: z.string().min(1),
  qty: z.number().min(0),
  unitLabel: z.string().optional(),
  reason: z.string().min(1),
  notes: z.string().optional(),
  rate: z.number().min(0).optional(),
  photoUrl: z.string().optional(),
});

const wastageInputSchema = z.object({
  eventDate: z.string().min(1),
  costCenterId: z.string().min(1),
  branchId: z.string().min(1),
  staffName: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

export type WastageActionResult = { error?: string; id?: string };

type Db = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertWastageEvent(tx: Db, input: z.infer<typeof wastageInputSchema>, status: "DRAFT" | "POSTED", actorId: string) {
  const wastageNo = await nextWastageNo();

  const [costCenter] = await tx.select({ name: costCenters.name }).from(costCenters).where(eq(costCenters.id, input.costCenterId));

  let totalCost = 0;
  const lineRows: { stockItemId: string; qty: number; unitLabel?: string; reason: string; notes?: string; rateAtWaste?: number; amountAtWaste?: number; photoUrl?: string }[] = [];
  for (const l of input.lines) {
    const [item] = await tx.select({ ratePerKgL: stockItems.ratePerKgL }).from(stockItems).where(eq(stockItems.id, l.stockItemId));
    const rate = l.rate ?? item?.ratePerKgL ?? 0;
    const amount = l.qty * rate;
    totalCost += amount;
    lineRows.push({ stockItemId: l.stockItemId, qty: l.qty, unitLabel: l.unitLabel, reason: l.reason, notes: l.notes, rateAtWaste: rate, amountAtWaste: amount, photoUrl: l.photoUrl });
  }

  const [event] = await tx
    .insert(wastageEvents)
    .values({
      wastageNo,
      eventDate: input.eventDate,
      costCenter: costCenter?.name ?? "",
      costCenterId: input.costCenterId,
      branchId: input.branchId,
      staffName: input.staffName,
      totalCost,
      status,
      postedAt: status === "POSTED" ? new Date() : undefined,
      postedBy: status === "POSTED" ? actorId : undefined,
      createdBy: actorId,
    })
    .returning({ id: wastageEvents.id });

  for (const row of lineRows) {
    await tx.insert(wastageLines).values({ wastageEventId: event.id, ...row });
  }

  return { eventId: event.id, wastageNo };
}

async function applyWastageSideEffects(tx: Db, eventId: string, input: z.infer<typeof wastageInputSchema>, actorId: string) {
  for (const l of input.lines) {
    if (l.qty <= 0) continue;
    await recordStockMovement(tx, {
      stockItemId: l.stockItemId,
      branchId: input.branchId,
      costCenterId: input.costCenterId,
      qtyDelta: -l.qty,
      unitLabel: l.unitLabel,
      movementType: "WASTAGE",
      refType: "wastage_event",
      refId: eventId,
      notes: l.reason,
      actorId,
    });
  }
}

export async function postWastageEvent(input: z.infer<typeof wastageInputSchema>): Promise<WastageActionResult> {
  const session = await assertPermission("wastage", "edit");
  const parsed = wastageInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one wasted item." };

  const { eventId } = await db.transaction(async (tx) => {
    const created = await insertWastageEvent(tx, parsed.data, "POSTED", session.profile.id);
    await applyWastageSideEffects(tx, created.eventId, parsed.data, session.profile.id);
    await tx.insert(auditLog).values({
      actorId: session.profile.id,
      action: "Wastage Logged",
      entity: "Wastage Event",
      entityLabel: created.wastageNo,
      detail: `${parsed.data.lines.length} item(s)`,
    });
    return created;
  });

  revalidatePath("/wastage");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { id: eventId };
}

export async function saveWastageDraft(input: z.infer<typeof wastageInputSchema>): Promise<WastageActionResult> {
  const session = await assertPermission("wastage", "edit");
  const parsed = wastageInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one wasted item." };

  const { eventId } = await db.transaction(async (tx) => {
    const created = await insertWastageEvent(tx, parsed.data, "DRAFT", session.profile.id);
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Saved", entity: "Wastage Event", entityLabel: created.wastageNo, detail: "Stock not yet updated" });
    return created;
  });

  revalidatePath("/wastage");
  return { id: eventId };
}

export async function postWastageDraft(id: string): Promise<WastageActionResult> {
  const session = await assertPermission("wastage", "edit");

  const result = await db.transaction(async (tx) => {
    const [event] = await tx.select().from(wastageEvents).where(and(eq(wastageEvents.id, id), eq(wastageEvents.status, "DRAFT")));
    if (!event) return { error: "Wastage event not found or already posted." as const };
    if (!event.costCenterId) return { error: "This draft has no sector set — edit it and pick one before posting." as const };

    const lines = await tx.select().from(wastageLines).where(eq(wastageLines.wastageEventId, id));
    const input: z.infer<typeof wastageInputSchema> = {
      eventDate: event.eventDate,
      costCenterId: event.costCenterId,
      branchId: event.branchId,
      staffName: event.staffName ?? undefined,
      lines: lines.map((l) => ({ stockItemId: l.stockItemId, qty: l.qty, unitLabel: l.unitLabel ?? undefined, reason: l.reason, notes: l.notes ?? undefined, rate: l.rateAtWaste ?? undefined, photoUrl: l.photoUrl ?? undefined })),
    };
    await applyWastageSideEffects(tx, id, input, session.profile.id);
    await tx.update(wastageEvents).set({ status: "POSTED", postedAt: new Date(), postedBy: session.profile.id }).where(eq(wastageEvents.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Wastage Logged", entity: "Wastage Event", entityLabel: event.wastageNo, detail: "Stock updated" });
    return { id };
  });
  if ("error" in result) return result;

  revalidatePath(`/wastage/${id}`);
  revalidatePath("/wastage");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return result;
}

export async function updateWastageDraft(id: string, input: z.infer<typeof wastageInputSchema>): Promise<WastageActionResult> {
  const session = await assertPermission("wastage", "edit");
  const parsed = wastageInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one wasted item." };

  const [existing] = await db.select().from(wastageEvents).where(and(eq(wastageEvents.id, id), eq(wastageEvents.status, "DRAFT")));
  if (!existing) return { error: "Wastage event not found or already posted — it can no longer be edited." };

  await db.transaction(async (tx) => {
    const [costCenter] = await tx.select({ name: costCenters.name }).from(costCenters).where(eq(costCenters.id, parsed.data.costCenterId));

    let totalCost = 0;
    const lineRows: { stockItemId: string; qty: number; unitLabel?: string; reason: string; notes?: string; rateAtWaste?: number; amountAtWaste?: number; photoUrl?: string }[] = [];
    for (const l of parsed.data.lines) {
      const [item] = await tx.select({ ratePerKgL: stockItems.ratePerKgL }).from(stockItems).where(eq(stockItems.id, l.stockItemId));
      const rate = l.rate ?? item?.ratePerKgL ?? 0;
      const amount = l.qty * rate;
      totalCost += amount;
      lineRows.push({ stockItemId: l.stockItemId, qty: l.qty, unitLabel: l.unitLabel, reason: l.reason, notes: l.notes, rateAtWaste: rate, amountAtWaste: amount, photoUrl: l.photoUrl });
    }

    await tx
      .update(wastageEvents)
      .set({
        eventDate: parsed.data.eventDate,
        costCenter: costCenter?.name ?? "",
        costCenterId: parsed.data.costCenterId,
        branchId: parsed.data.branchId,
        staffName: parsed.data.staffName,
        totalCost,
      })
      .where(eq(wastageEvents.id, id));

    await tx.delete(wastageLines).where(eq(wastageLines.wastageEventId, id));
    for (const row of lineRows) {
      await tx.insert(wastageLines).values({ wastageEventId: id, ...row });
    }

    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Edited", entity: "Wastage Event", entityLabel: existing.wastageNo, detail: `${parsed.data.lines.length} item(s)` });
  });

  revalidatePath(`/wastage/${id}`);
  revalidatePath("/wastage");
  return { id };
}

export async function deleteWastageDraft(id: string): Promise<WastageActionResult> {
  const session = await assertPermission("wastage", "edit");

  const [existing] = await db.select().from(wastageEvents).where(and(eq(wastageEvents.id, id), eq(wastageEvents.status, "DRAFT")));
  if (!existing) return { error: "Wastage event not found or already posted — it can no longer be deleted." };

  await db.transaction(async (tx) => {
    await tx.delete(wastageLines).where(eq(wastageLines.wastageEventId, id));
    await tx.delete(wastageEvents).where(eq(wastageEvents.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Deleted", entity: "Wastage Event", entityLabel: existing.wastageNo, detail: "Removed" });
  });

  revalidatePath("/wastage");
  return { id };
}

export async function uploadWastagePhoto(formData: FormData): Promise<{ error?: string; url?: string }> {
  await assertPermission("wastage", "edit");
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo to upload." };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `wastage/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const url = await uploadPhoto(path, file);
  return { url };
}

export async function deleteWastagePhoto(url: string): Promise<{ error?: string }> {
  await assertPermission("wastage", "edit");
  try {
    await deletePhoto(url);
    return {};
  } catch {
    return { error: "Couldn't remove the old photo, but you can still upload a replacement." };
  }
}

// Powers "Waste a Finished Dish" — given a main recipe and how many portions
// were wasted, returns the flat list of real stock deductions (its live
// ingredient breakdown, scaled by portions) for the client to drop straight
// into the normal wastage line editor.
export async function getRecipeWasteLines(mainRecipeCode: string, portions: number): Promise<{ error?: string; lines?: RecipeWasteLine[]; recipeName?: string }> {
  await assertPermission("wastage", "edit");
  if (!(portions > 0)) return { error: "Enter how many portions were wasted." };

  const graph = await loadCostingGraph();
  const recipe = graph.mainRecipes.find((m) => m.legacyCode === mainRecipeCode);
  if (!recipe) return { error: "Recipe not found." };

  const cur = recipeCurrentCost(graph, recipe);
  const lines = flattenRecipeToStockLines(cur.lines, portions);
  if (lines.length === 0) return { error: "This recipe has no stock-backed ingredients to deduct." };
  return { lines, recipeName: recipe.name };
}

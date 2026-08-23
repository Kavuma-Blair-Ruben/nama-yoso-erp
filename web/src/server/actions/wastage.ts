"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { wastageEvents, wastageLines, stockItems, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextWastageNo } from "@/server/db/sequences";
import { recordStockMovement } from "@/server/db/stockLedger";
import { uploadPhoto, deletePhoto } from "@/lib/supabaseAdmin";
import { loadCostingGraph, recipeCurrentCost, type Ingredient, type IngredientCostResult } from "@/server/costing/recipeCost";

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
  costCenter: z.string().min(1),
  branchId: z.string().min(1),
  staffName: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

export type WastageActionResult = { error?: string; id?: string };

type Db = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertWastageEvent(tx: Db, input: z.infer<typeof wastageInputSchema>, status: "DRAFT" | "POSTED", actorId: string) {
  const wastageNo = await nextWastageNo();

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
      costCenter: input.costCenter,
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
      detail: `${parsed.data.costCenter} — ${parsed.data.lines.length} item(s)`,
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

    const lines = await tx.select().from(wastageLines).where(eq(wastageLines.wastageEventId, id));
    const input: z.infer<typeof wastageInputSchema> = {
      eventDate: event.eventDate,
      costCenter: event.costCenter,
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
      .set({ eventDate: parsed.data.eventDate, costCenter: parsed.data.costCenter, branchId: parsed.data.branchId, staffName: parsed.data.staffName, totalCost })
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

export type RecipeWasteLine = { stockItemId: string; unitLabel: string | null; qty: number; rate: number; legacyCode: string; name: string };

// A recipe's top-level ingredient lines are already the right granularity to
// deduct — a sub-recipe ingredient has its own stock_item_id and gets
// deducted from ITS OWN balance (same as wasting a sub-recipe batch
// directly), not exploded further. Only an ingredient that is itself a main
// recipe (a nested "combo") has no stock item to deduct from, so that one
// case recurses into its own resolved lines (already computed by
// ingredientCost/recipeCurrentCost via the shared `sub` shape).
function flattenRecipeToStockLines(lines: { ing: Ingredient; result: IngredientCostResult }[], multiplier: number): RecipeWasteLine[] {
  const out: RecipeWasteLine[] = [];
  for (const { ing, result } of lines) {
    if (ing.stockItemId) {
      const qty = ing.qty * multiplier;
      const rate = ing.qty !== 0 ? result.cost / ing.qty : (ing.rateAtBuild ?? 0);
      out.push({ stockItemId: ing.stockItemId, unitLabel: ing.unitLabel, qty, rate, legacyCode: ing.legacyCode, name: ing.name });
    } else if (result.sub) {
      out.push(...flattenRecipeToStockLines(result.sub.lines, multiplier * ing.qty));
    }
  }
  return out;
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

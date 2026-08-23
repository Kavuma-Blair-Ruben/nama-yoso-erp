"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { productionBatches, productionBatchIngredients, subRecipes, stockItems, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextProductionBatchNo, nextLotNumber } from "@/server/db/sequences";
import { recordStockMovement } from "@/server/db/stockLedger";
import { convertQtyToCanonical } from "@/lib/unitMath";

const ingredientSchema = z.object({
  stockItemId: z.string().min(1),
  qty: z.number().min(0),
  unitLabel: z.string().optional(),
  rate: z.number().min(0).optional(),
});

const productionInputSchema = z.object({
  subRecipeId: z.string().min(1),
  branchId: z.string().min(1),
  scaleMultiplier: z.number().min(0.0001),
  yieldQty: z.number().min(0),
  yieldUnit: z.string().optional(),
  producedDate: z.string().min(1),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
  ingredients: z.array(ingredientSchema).min(1),
});

export type ProductionActionResult = { error?: string; id?: string };

// Same tx-typing pattern used elsewhere: the callback param drizzle passes
// into db.transaction() isn't structurally identical to `db` itself.
type Db = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertProductionBatch(tx: Db, input: z.infer<typeof productionInputSchema>, status: "DRAFT" | "POSTED", actorId: string) {
  const [subRecipe] = await tx.select().from(subRecipes).where(eq(subRecipes.id, input.subRecipeId));
  if (!subRecipe) throw new Error("Sub-recipe not found.");

  const batchNo = await nextProductionBatchNo();
  const lotNo = await nextLotNumber(subRecipe.legacyCode);

  let totalCost = 0;
  const ingredientRows: { stockItemId: string; qty: number; unitLabel?: string; rateAtProduction?: number; amountAtProduction?: number }[] = [];
  for (const ing of input.ingredients) {
    const [item] = await tx.select({ ratePerKgL: stockItems.ratePerKgL }).from(stockItems).where(eq(stockItems.id, ing.stockItemId));
    const rate = ing.rate ?? item?.ratePerKgL ?? 0;
    const amount = ing.qty * rate;
    totalCost += amount;
    ingredientRows.push({ stockItemId: ing.stockItemId, qty: ing.qty, unitLabel: ing.unitLabel, rateAtProduction: rate, amountAtProduction: amount });
  }
  const costPerUnit = input.yieldQty > 0 ? totalCost / input.yieldQty : undefined;

  const [batch] = await tx
    .insert(productionBatches)
    .values({
      batchNo,
      lotNo,
      subRecipeId: input.subRecipeId,
      branchId: input.branchId,
      scaleMultiplier: input.scaleMultiplier,
      yieldQty: input.yieldQty,
      yieldUnit: input.yieldUnit,
      totalCost,
      costPerUnit,
      producedDate: input.producedDate,
      expiryDate: input.expiryDate || undefined,
      status,
      notes: input.notes,
      postedAt: status === "POSTED" ? new Date() : undefined,
      postedBy: status === "POSTED" ? actorId : undefined,
      createdBy: actorId,
    })
    .returning({ id: productionBatches.id });

  for (const row of ingredientRows) {
    await tx.insert(productionBatchIngredients).values({ productionBatchId: batch.id, ...row });
  }

  return { batchId: batch.id, batchNo, subRecipe };
}

// Consumes each ingredient's own stock balance and credits the sub-recipe's
// linked stock item with the yield — soft-warns rather than blocking on
// insufficient stock, matching the app's existing non-blocking
// missing-ingredient style in recipe costing.
async function applyProductionSideEffects(
  tx: Db,
  batchId: string,
  input: z.infer<typeof productionInputSchema>,
  subRecipeStockItemId: string,
  actorId: string
) {
  for (const ing of input.ingredients) {
    if (ing.qty <= 0) continue;
    await recordStockMovement(tx, {
      stockItemId: ing.stockItemId,
      branchId: input.branchId,
      qtyDelta: -ing.qty,
      unitLabel: ing.unitLabel,
      movementType: "PRODUCTION_CONSUME",
      refType: "production_batch",
      refId: batchId,
      actorId,
    });
  }

  if (input.yieldQty > 0) {
    // yieldQty is stored raw (e.g. 5500 "G", matching sub_recipes.yield_qty's
    // own convention) — canonicalize before crediting the ledger, which
    // speaks KG/LTR-or-piece throughout (see convertQtyToCanonical).
    await recordStockMovement(tx, {
      stockItemId: subRecipeStockItemId,
      branchId: input.branchId,
      qtyDelta: convertQtyToCanonical(input.yieldQty, input.yieldUnit),
      unitLabel: input.yieldUnit,
      movementType: "PRODUCTION_OUTPUT",
      refType: "production_batch",
      refId: batchId,
      actorId,
    });
  }
}

export async function postProductionBatch(input: z.infer<typeof productionInputSchema>): Promise<ProductionActionResult> {
  const session = await assertPermission("subrecipes", "edit");
  const parsed = productionInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add a valid yield and at least one ingredient line." };

  const { batchId } = await db.transaction(async (tx) => {
    const created = await insertProductionBatch(tx, parsed.data, "POSTED", session.profile.id);
    await applyProductionSideEffects(tx, created.batchId, parsed.data, created.subRecipe.stockItemId, session.profile.id);
    await tx.insert(auditLog).values({
      actorId: session.profile.id,
      action: "Production Posted",
      entity: "Production Batch",
      entityLabel: created.batchNo,
      detail: `${created.subRecipe.name} — yield ${parsed.data.yieldQty} ${parsed.data.yieldUnit ?? ""}`.trim(),
    });
    return created;
  });

  revalidatePath("/production");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { id: batchId };
}

export async function saveProductionDraft(input: z.infer<typeof productionInputSchema>): Promise<ProductionActionResult> {
  const session = await assertPermission("subrecipes", "edit");
  const parsed = productionInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add a valid yield and at least one ingredient line." };

  const { batchId } = await db.transaction(async (tx) => {
    const created = await insertProductionBatch(tx, parsed.data, "DRAFT", session.profile.id);
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Saved", entity: "Production Batch", entityLabel: created.batchNo, detail: "Stock not yet updated" });
    return created;
  });

  revalidatePath("/production");
  return { id: batchId };
}

export async function postProductionDraft(id: string): Promise<ProductionActionResult> {
  const session = await assertPermission("subrecipes", "edit");

  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.select().from(productionBatches).where(and(eq(productionBatches.id, id), eq(productionBatches.status, "DRAFT")));
    if (!batch) return { error: "Production batch not found or already posted." as const };

    const [subRecipe] = await tx.select().from(subRecipes).where(eq(subRecipes.id, batch.subRecipeId));
    if (!subRecipe) return { error: "Sub-recipe not found." as const };

    const ingredientRows = await tx.select().from(productionBatchIngredients).where(eq(productionBatchIngredients.productionBatchId, id));
    const input: z.infer<typeof productionInputSchema> = {
      subRecipeId: batch.subRecipeId,
      branchId: batch.branchId,
      scaleMultiplier: batch.scaleMultiplier,
      yieldQty: batch.yieldQty,
      yieldUnit: batch.yieldUnit ?? undefined,
      producedDate: batch.producedDate,
      ingredients: ingredientRows.map((r) => ({ stockItemId: r.stockItemId, qty: r.qty, unitLabel: r.unitLabel ?? undefined, rate: r.rateAtProduction ?? undefined })),
    };
    await applyProductionSideEffects(tx, id, input, subRecipe.stockItemId, session.profile.id);
    await tx.update(productionBatches).set({ status: "POSTED", postedAt: new Date(), postedBy: session.profile.id }).where(eq(productionBatches.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Production Posted", entity: "Production Batch", entityLabel: batch.batchNo, detail: "Stock updated" });
    return { id };
  });
  if ("error" in result) return result;

  revalidatePath(`/production/${id}`);
  revalidatePath("/production");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return result;
}

export async function updateProductionDraft(id: string, input: z.infer<typeof productionInputSchema>): Promise<ProductionActionResult> {
  const session = await assertPermission("subrecipes", "edit");
  const parsed = productionInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add a valid yield and at least one ingredient line." };

  const [existing] = await db.select().from(productionBatches).where(and(eq(productionBatches.id, id), eq(productionBatches.status, "DRAFT")));
  if (!existing) return { error: "Production batch not found or already posted — it can no longer be edited." };

  await db.transaction(async (tx) => {
    let totalCost = 0;
    const ingredientRows: { stockItemId: string; qty: number; unitLabel?: string; rateAtProduction?: number; amountAtProduction?: number }[] = [];
    for (const ing of parsed.data.ingredients) {
      const [item] = await tx.select({ ratePerKgL: stockItems.ratePerKgL }).from(stockItems).where(eq(stockItems.id, ing.stockItemId));
      const rate = ing.rate ?? item?.ratePerKgL ?? 0;
      const amount = ing.qty * rate;
      totalCost += amount;
      ingredientRows.push({ stockItemId: ing.stockItemId, qty: ing.qty, unitLabel: ing.unitLabel, rateAtProduction: rate, amountAtProduction: amount });
    }
    const costPerUnit = parsed.data.yieldQty > 0 ? totalCost / parsed.data.yieldQty : undefined;

    await tx
      .update(productionBatches)
      .set({
        subRecipeId: parsed.data.subRecipeId,
        branchId: parsed.data.branchId,
        scaleMultiplier: parsed.data.scaleMultiplier,
        yieldQty: parsed.data.yieldQty,
        yieldUnit: parsed.data.yieldUnit,
        totalCost,
        costPerUnit,
        producedDate: parsed.data.producedDate,
        expiryDate: parsed.data.expiryDate || undefined,
        notes: parsed.data.notes,
      })
      .where(eq(productionBatches.id, id));

    // Draft ingredients haven't affected stock/cost yet, so it's safe to
    // replace them wholesale rather than diffing — same pattern as GRN drafts.
    await tx.delete(productionBatchIngredients).where(eq(productionBatchIngredients.productionBatchId, id));
    for (const row of ingredientRows) {
      await tx.insert(productionBatchIngredients).values({ productionBatchId: id, ...row });
    }

    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Edited", entity: "Production Batch", entityLabel: existing.batchNo, detail: `${parsed.data.ingredients.length} ingredient(s)` });
  });

  revalidatePath(`/production/${id}`);
  revalidatePath("/production");
  return { id };
}

export async function deleteProductionDraft(id: string): Promise<ProductionActionResult> {
  const session = await assertPermission("subrecipes", "edit");

  const [existing] = await db.select().from(productionBatches).where(and(eq(productionBatches.id, id), eq(productionBatches.status, "DRAFT")));
  if (!existing) return { error: "Production batch not found or already posted — it can no longer be deleted." };

  await db.transaction(async (tx) => {
    await tx.delete(productionBatchIngredients).where(eq(productionBatchIngredients.productionBatchId, id));
    await tx.delete(productionBatches).where(eq(productionBatches.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Draft Deleted", entity: "Production Batch", entityLabel: existing.batchNo, detail: "Removed" });
  });

  revalidatePath("/production");
  return { id };
}

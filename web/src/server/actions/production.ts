"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { productionBatches, productionBatchIngredients, subRecipes, stockItems, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { assertBranchAccess } from "@/server/auth/branchAccess";
import type { Session } from "@/server/auth/session";
import { nextProductionBatchNo, nextLotNumber } from "@/server/db/sequences";
import { recordStockMovement } from "@/server/db/stockLedger";
import { getDefaultCostCenterId } from "@/server/db/costCenterDefaults";
import { convertQtyToCanonical } from "@/lib/unitMath";
import { sendToRoutedPrinter } from "@/lib/printRouting";
import { buildProductionLabelEscPos } from "@/lib/escpos";

const ingredientSchema = z.object({
  stockItemId: z.string().min(1),
  qty: z.number().min(0),
  unitLabel: z.string().optional(),
  rate: z.number().min(0).optional(),
});

const productionInputSchema = z.object({
  subRecipeId: z.string().min(1),
  branchId: z.string().min(1),
  costCenterId: z.string().optional(),
  scaleMultiplier: z.number().min(0.0001),
  yieldQty: z.number().min(0),
  yieldUnit: z.string().optional(),
  producedDate: z.string().min(1),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
  staffName: z.string().optional(),
  ingredients: z.array(ingredientSchema).min(1),
});

export type ProductionActionResult = { error?: string; id?: string };
export type CloseProductionResult = { error?: string; id?: string; batchNo?: string; durationMinutes?: number };

// Same tx-typing pattern used elsewhere: the callback param drizzle passes
// into db.transaction() isn't structurally identical to `db` itself.
type Db = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertProductionBatch(tx: Db, input: z.infer<typeof productionInputSchema>, actorId: string) {
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

  // Falls back to the branch's Kitchen sector if the builder didn't send one.
  const costCenterId = input.costCenterId ?? (await getDefaultCostCenterId(tx, input.branchId, "Kitchen"));

  const [batch] = await tx
    .insert(productionBatches)
    .values({
      batchNo,
      lotNo,
      subRecipeId: input.subRecipeId,
      branchId: input.branchId,
      costCenterId,
      scaleMultiplier: input.scaleMultiplier,
      yieldQty: input.yieldQty,
      yieldUnit: input.yieldUnit,
      totalCost,
      costPerUnit,
      producedDate: input.producedDate,
      expiryDate: input.expiryDate || undefined,
      status: "OPEN",
      notes: input.notes,
      staffName: input.staffName || undefined,
      createdBy: actorId,
    })
    .returning({ id: productionBatches.id });

  for (const row of ingredientRows) {
    await tx.insert(productionBatchIngredients).values({ productionBatchId: batch.id, ...row });
  }

  return { batchId: batch.id, batchNo, lotNo, subRecipe };
}

// Consumes each ingredient's own stock balance and credits the sub-recipe's
// linked stock item with the yield — soft-warns rather than blocking on
// insufficient stock, matching the app's existing non-blocking
// missing-ingredient style in recipe costing.
async function applyProductionSideEffects(
  tx: Db,
  batchId: string,
  costCenterId: string,
  input: z.infer<typeof productionInputSchema>,
  subRecipeStockItemId: string,
  actorId: string
) {
  for (const ing of input.ingredients) {
    if (ing.qty <= 0) continue;
    await recordStockMovement(tx, {
      stockItemId: ing.stockItemId,
      branchId: input.branchId,
      costCenterId,
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
      costCenterId,
      qtyDelta: convertQtyToCanonical(input.yieldQty, input.yieldUnit),
      unitLabel: input.yieldUnit,
      movementType: "PRODUCTION_OUTPUT",
      refType: "production_batch",
      refId: batchId,
      actorId,
    });
  }
}

// Opens a new production ticket — mints its batch/lot number, stock is NOT
// touched yet. Staff keeps this OPEN while actively producing under this
// lot (e.g. vacuum-sealing many packs), printing as many copies of the
// batch/lot label as needed, then closes it via closeProductionBatch once done.
export async function openProductionBatch(input: z.infer<typeof productionInputSchema>): Promise<ProductionActionResult> {
  const session = await assertPermission("subrecipes", "edit");
  const parsed = productionInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add a valid yield and at least one ingredient line." };
  await assertBranchAccess(session, parsed.data.branchId);

  const { batchId, batchNo, lotNo, subRecipe } = await db.transaction(async (tx) => {
    const created = await insertProductionBatch(tx, parsed.data, session.profile.id);
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Production Opened", entity: "Production Batch", entityLabel: created.batchNo, detail: "Stock not yet updated" });
    return created;
  });

  // Best-effort — run after the transaction commits so a missing/offline
  // printer never undoes a real production ticket that already exists.
  await sendToRoutedPrinter(
    parsed.data.branchId,
    "production_label",
    buildProductionLabelEscPos({
      batchNo,
      lotNo,
      subRecipeName: subRecipe.name,
      yieldQty: parsed.data.yieldQty,
      yieldUnit: parsed.data.yieldUnit ?? "",
      producedDate: parsed.data.producedDate,
      expiryDate: parsed.data.expiryDate ?? null,
    })
  );

  revalidatePath("/production");
  return { id: batchId };
}

// Finalizes an OPEN production ticket: consumes ingredient stock, credits
// the finished item's stock, locks the record from further edits, and
// reports the open->close turnaround time. Shared by the manual "Close
// Production" button and the scan-to-close flow below.
async function closeProductionBatchCore(id: string, session: Session, closeDetail: string): Promise<CloseProductionResult> {
  const actorId = session.profile.id;
  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.select().from(productionBatches).where(and(eq(productionBatches.id, id), eq(productionBatches.status, "OPEN")));
    if (!batch) return { error: "Production batch not found or already closed." as const };
    await assertBranchAccess(session, batch.branchId);

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
    const costCenterId = batch.costCenterId ?? (await getDefaultCostCenterId(tx, batch.branchId, "Kitchen"));
    await applyProductionSideEffects(tx, id, costCenterId, input, subRecipe.stockItemId, actorId);
    const postedAt = new Date();
    await tx.update(productionBatches).set({ status: "CLOSED", postedAt, postedBy: actorId }).where(eq(productionBatches.id, id));
    const durationMinutes = Math.round((postedAt.getTime() - batch.createdAt.getTime()) / 60000);
    await tx.insert(auditLog).values({
      actorId,
      action: "Production Closed",
      entity: "Production Batch",
      entityLabel: batch.batchNo,
      detail: `${closeDetail} — turnaround ${durationMinutes}m`,
    });
    return { id, batchNo: batch.batchNo, durationMinutes };
  });
  if ("error" in result) return result;

  revalidatePath(`/production/${id}`);
  revalidatePath("/production");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return result;
}

export async function closeProductionBatch(id: string): Promise<CloseProductionResult> {
  const session = await assertPermission("subrecipes", "edit");
  return closeProductionBatchCore(id, session, "Stock updated");
}

// Scan-to-close: staff scans the same barcode printed on the ticket when the
// batch was opened (encodes the lot number — see ProductionReceipt) to close
// it, no need to navigate to the batch's page first. Looks the batch up by
// lot rather than id since that's what's actually printed and scannable.
export async function closeProductionBatchByLot(lotNo: string): Promise<CloseProductionResult> {
  const session = await assertPermission("subrecipes", "edit");
  const trimmed = lotNo.trim();
  if (!trimmed) return { error: "Scan a production ticket's barcode." };

  const [batch] = await db.select({ id: productionBatches.id, status: productionBatches.status, batchNo: productionBatches.batchNo }).from(productionBatches).where(eq(productionBatches.lotNo, trimmed));
  if (!batch) return { error: `No production ticket found for lot "${trimmed}".` };
  if (batch.status !== "OPEN") return { error: `${batch.batchNo} (lot ${trimmed}) is already closed.` };

  return closeProductionBatchCore(batch.id, session, "Stock updated (scan-to-close)");
}

// Fires once, right after the auto-print effect actually shows the browser's
// print dialog for a freshly opened ticket — mirrors markExpiryTicketsPrinted.
export async function markProductionTicketPrinted(id: string): Promise<{ error?: string }> {
  await assertPermission("subrecipes", "edit");
  await db.update(productionBatches).set({ openTicketPrintedAt: new Date() }).where(eq(productionBatches.id, id));
  revalidatePath(`/production/${id}`);
  return {};
}

export async function updateProductionBatch(id: string, input: z.infer<typeof productionInputSchema>): Promise<ProductionActionResult> {
  const session = await assertPermission("subrecipes", "edit");
  const parsed = productionInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add a valid yield and at least one ingredient line." };

  const [existing] = await db.select().from(productionBatches).where(and(eq(productionBatches.id, id), eq(productionBatches.status, "OPEN")));
  if (!existing) return { error: "Production batch not found or already closed — it can no longer be edited." };
  await assertBranchAccess(session, existing.branchId);
  await assertBranchAccess(session, parsed.data.branchId);

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
    const costCenterId = parsed.data.costCenterId ?? (await getDefaultCostCenterId(tx, parsed.data.branchId, "Kitchen"));

    await tx
      .update(productionBatches)
      .set({
        subRecipeId: parsed.data.subRecipeId,
        branchId: parsed.data.branchId,
        costCenterId,
        scaleMultiplier: parsed.data.scaleMultiplier,
        yieldQty: parsed.data.yieldQty,
        yieldUnit: parsed.data.yieldUnit,
        totalCost,
        costPerUnit,
        producedDate: parsed.data.producedDate,
        expiryDate: parsed.data.expiryDate || undefined,
        notes: parsed.data.notes,
        staffName: parsed.data.staffName || undefined,
      })
      .where(eq(productionBatches.id, id));

    // OPEN ingredients haven't affected stock/cost yet, so it's safe to
    // replace them wholesale rather than diffing — same pattern as GRN drafts.
    await tx.delete(productionBatchIngredients).where(eq(productionBatchIngredients.productionBatchId, id));
    for (const row of ingredientRows) {
      await tx.insert(productionBatchIngredients).values({ productionBatchId: id, ...row });
    }

    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Production Edited", entity: "Production Batch", entityLabel: existing.batchNo, detail: `${parsed.data.ingredients.length} ingredient(s)` });
  });

  revalidatePath(`/production/${id}`);
  revalidatePath("/production");
  return { id };
}

export async function deleteProductionBatch(id: string): Promise<ProductionActionResult> {
  const session = await assertPermission("subrecipes", "edit");

  const [existing] = await db.select().from(productionBatches).where(and(eq(productionBatches.id, id), eq(productionBatches.status, "OPEN")));
  if (!existing) return { error: "Production batch not found or already closed — it can no longer be deleted." };

  await db.transaction(async (tx) => {
    await tx.delete(productionBatchIngredients).where(eq(productionBatchIngredients.productionBatchId, id));
    await tx.delete(productionBatches).where(eq(productionBatches.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Production Discarded", entity: "Production Batch", entityLabel: existing.batchNo, detail: "Removed" });
  });

  revalidatePath("/production");
  return { id };
}

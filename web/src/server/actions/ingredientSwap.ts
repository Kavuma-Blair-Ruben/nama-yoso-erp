"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { recipeIngredients, stockItems, ingredientSwapEvents, ingredientSwapEventLines, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { loadCostingGraph, recipeCurrentCost, getSubRecipeCost, type CostingGraph, type Ingredient } from "@/server/costing/recipeCost";
import { categorizeUnit } from "@/lib/unitMath";

export type AffectedRecipe = {
  type: "main" | "sub";
  code: string;
  name: string;
  costBefore: number;
  costAfter: number;
  impact: number;
  impactPct: number;
  hasDuplicateLine: boolean;
};

export type SwapImpact = {
  fromItem: { id: string; code: string; name: string; issueUnit: string | null };
  toItem: { id: string; code: string; name: string; issueUnit: string | null };
  unitMismatch: boolean;
  targetIsSubRecipe: boolean;
  affected: AffectedRecipe[];
  totalImpact: number;
  affectedLineCount: number;
};

export type SwapPreviewResult = { error?: string; preview?: SwapImpact };

// Swaps stockItemId on the matching ingredient line(s) of just the affected
// recipes, in a shallow-cloned graph — everything else (rates, which items
// are sub-recipe-backed, etc.) stays the same shared data, so the existing
// recipeCurrentCost/getSubRecipeCost functions correctly recompute cost
// (including recursing into a sub-recipe that itself uses the swapped item,
// since that sub-recipe's own ingredient list is one of the ones mutated
// here too) with zero new costing logic and zero DB writes.
function buildAfterGraph(graph: CostingGraph, fromId: string, toId: string, affectedMainIds: Set<string>, affectedSubIds: Set<string>): CostingGraph {
  function swapIngredients(ings: Ingredient[]): Ingredient[] {
    return ings.map((ing) => (ing.stockItemId === fromId ? { ...ing, stockItemId: toId } : ing));
  }
  const mainRecipesById = new Map(graph.mainRecipesById);
  for (const id of affectedMainIds) {
    const node = mainRecipesById.get(id);
    if (node) mainRecipesById.set(id, { ...node, ingredients: swapIngredients(node.ingredients) });
  }
  const mainRecipes = graph.mainRecipes.map((m) => mainRecipesById.get(m.id) ?? m);
  const subRecipesById = new Map(graph.subRecipesById);
  for (const id of affectedSubIds) {
    const node = subRecipesById.get(id);
    if (node) subRecipesById.set(id, { ...node, ingredients: swapIngredients(node.ingredients) });
  }
  return { ...graph, mainRecipes, mainRecipesById, subRecipesById };
}

async function computeSwapImpact(fromStockItemId: string, toStockItemId: string): Promise<{ error?: string; impact?: SwapImpact }> {
  if (fromStockItemId === toStockItemId) return { error: "Pick a different item to swap to." };

  const [items, graph, ingredientRows] = await Promise.all([
    db.select({ id: stockItems.id, legacyCode: stockItems.legacyCode, name: stockItems.name, issueUnit: stockItems.issueUnit }).from(stockItems),
    loadCostingGraph(),
    db
      .select({ id: recipeIngredients.id, mainRecipeId: recipeIngredients.mainRecipeId, subRecipeId: recipeIngredients.subRecipeId, stockItemId: recipeIngredients.stockItemId })
      .from(recipeIngredients),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const fromItem = itemById.get(fromStockItemId);
  const toItem = itemById.get(toStockItemId);
  if (!fromItem) return { error: "The item you're replacing wasn't found." };
  if (!toItem) return { error: "The alternative item wasn't found." };

  const matchingRows = ingredientRows.filter((r) => r.stockItemId === fromStockItemId);
  const affectedMainIds = new Set(matchingRows.filter((r) => r.mainRecipeId).map((r) => r.mainRecipeId!));
  const affectedSubIds = new Set(matchingRows.filter((r) => r.subRecipeId).map((r) => r.subRecipeId!));

  const afterGraph = buildAfterGraph(graph, fromStockItemId, toStockItemId, affectedMainIds, affectedSubIds);

  const affected: AffectedRecipe[] = [];
  for (const id of affectedMainIds) {
    const before = graph.mainRecipesById.get(id);
    const after = afterGraph.mainRecipesById.get(id);
    if (!before || !after) continue;
    const costBefore = recipeCurrentCost(graph, before).perUnit;
    const costAfter = recipeCurrentCost(afterGraph, after).perUnit;
    const impact = costAfter - costBefore;
    affected.push({
      type: "main",
      code: before.legacyCode,
      name: before.name,
      costBefore,
      costAfter,
      impact,
      impactPct: costBefore ? (impact / costBefore) * 100 : 0,
      hasDuplicateLine: before.ingredients.some((ing) => ing.stockItemId === toStockItemId),
    });
  }
  for (const id of affectedSubIds) {
    const before = graph.subRecipesById.get(id);
    if (!before) continue;
    const costBefore = getSubRecipeCost(graph, id).perUnit;
    const costAfter = getSubRecipeCost(afterGraph, id).perUnit;
    const impact = costAfter - costBefore;
    affected.push({
      type: "sub",
      code: before.legacyCode,
      name: before.name,
      costBefore,
      costAfter,
      impact,
      impactPct: costBefore ? (impact / costBefore) * 100 : 0,
      hasDuplicateLine: before.ingredients.some((ing) => ing.stockItemId === toStockItemId),
    });
  }
  affected.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return {
    impact: {
      fromItem: { id: fromItem.id, code: fromItem.legacyCode, name: fromItem.name, issueUnit: fromItem.issueUnit },
      toItem: { id: toItem.id, code: toItem.legacyCode, name: toItem.name, issueUnit: toItem.issueUnit },
      unitMismatch: categorizeUnit(fromItem.issueUnit) !== categorizeUnit(toItem.issueUnit),
      targetIsSubRecipe: graph.subRecipeIdByStockItemId.has(toStockItemId),
      affected,
      totalImpact: affected.reduce((s, a) => s + a.impact, 0),
      affectedLineCount: matchingRows.length,
    },
  };
}

// Read-only — safe to call freely while the user is still picking an
// alternative. No DB writes; see buildAfterGraph's comment for why a
// preview doesn't need any.
export async function previewIngredientSwap(fromStockItemId: string, toStockItemId: string): Promise<SwapPreviewResult> {
  await assertPermission("ingredientswap", "view");
  const result = await computeSwapImpact(fromStockItemId, toStockItemId);
  if (result.error) return { error: result.error };
  return { preview: result.impact };
}

export type SwapCommitResult = { error?: string; eventId?: string };

// Repoints every recipe_ingredients row using fromStockItemId onto
// toStockItemId, resets rateAtBuild/amountAtBuild on those rows to the new
// item's current rate (this is a fresh baseline going forward, not a price
// change to track variance against — same reasoning as the system-wide
// recipe cost baseline reset), and logs one ingredient_swap_events row +
// one ingredient_swap_event_lines row per affected recipe so this shows up
// in the Ingredient Swaps report. Recomputes impact one more time inside
// the transaction (cheap — same in-memory graph work as the preview) so the
// logged numbers reflect the exact state being committed, not a possibly
// stale client-side preview.
export async function commitIngredientSwap(fromStockItemId: string, toStockItemId: string, reason?: string): Promise<SwapCommitResult> {
  const session = await assertPermission("ingredientswap", "edit");
  const result = await computeSwapImpact(fromStockItemId, toStockItemId);
  if (result.error || !result.impact) return { error: result.error ?? "Could not compute the swap impact." };
  const { impact } = result;
  if (impact.affectedLineCount === 0) return { error: `${impact.fromItem.name} isn't used in any recipe — nothing to swap.` };

  const [toRateRow] = await db.select({ ratePerKgL: stockItems.ratePerKgL }).from(stockItems).where(eq(stockItems.id, toStockItemId));
  const toRate = toRateRow?.ratePerKgL ?? 0;

  const eventId = await db.transaction(async (tx) => {
    await tx
      .update(recipeIngredients)
      .set({ stockItemId: toStockItemId, rateAtBuild: toRate, amountAtBuild: sql`${recipeIngredients.qty} * ${toRate}` })
      .where(eq(recipeIngredients.stockItemId, fromStockItemId));

    const [event] = await tx
      .insert(ingredientSwapEvents)
      .values({
        fromStockItemId,
        toStockItemId,
        reason: reason?.trim() || undefined,
        affectedLineCount: impact.affectedLineCount,
        totalCostImpact: impact.totalImpact,
        createdBy: session.profile.id,
      })
      .returning({ id: ingredientSwapEvents.id });

    if (impact.affected.length > 0) {
      await tx.insert(ingredientSwapEventLines).values(
        impact.affected.map((a) => ({
          eventId: event.id,
          recipeType: a.type,
          recipeCode: a.code,
          recipeName: a.name,
          costBefore: a.costBefore,
          costAfter: a.costAfter,
        }))
      );
    }

    await tx.insert(auditLog).values({
      actorId: session.profile.id,
      action: "Ingredient Swapped",
      entity: "Product",
      entityLabel: `${impact.fromItem.name} → ${impact.toItem.name}`,
      detail: `${impact.affectedLineCount} ingredient line(s) across ${impact.affected.length} recipe(s), total impact ${impact.totalImpact.toFixed(2)}`,
    });

    return event.id;
  });

  revalidatePath(`/products/${impact.fromItem.code}`);
  revalidatePath(`/products/${impact.toItem.code}`);
  revalidatePath("/recipes");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  for (const a of impact.affected) revalidatePath(`/recipes/${a.type}/${a.code}`);

  return { eventId };
}

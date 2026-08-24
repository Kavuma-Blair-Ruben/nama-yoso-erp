"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { mainRecipes, subRecipes, recipeIngredients, stockItems, auditLog, recipeBranchPrices } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextRecipeCode, nextProductCode } from "@/server/db/sequences";
import { uploadPhoto } from "@/lib/supabaseAdmin";
import { loadCostingGraph, recipeCurrentCost } from "@/server/costing/recipeCost";
import type { RecipeType } from "@/server/db/queries/recipes";

// Exactly one of stockItemId/ingredientMainRecipeId is set, mirroring the
// server's check constraint — a line is either real stock or another main
// recipe used as a "combo" component.
export type RecipeLineInput = { stockItemId: string | null; ingredientMainRecipeId: string | null; unitLabel: string; qty: number; wastagePct: number };

export type RecipeInput = {
  type: RecipeType;
  name: string;
  section: string;
  yieldQty: number | null;
  yieldUnit: string;
  cookBookText: string;
  sellingPrice: number | null;
  targetFoodCostPct: number | null;
  // Sub-recipe only.
  stockable?: boolean;
  shelfLifeDays?: number | null;
  storageInstructions?: string | null;
  branches: string[];
  // Main recipe only — per-branch selling-price overrides; a branch not
  // listed here falls back to sellingPrice.
  branchPrices?: { branchId: string; sellingPrice: number }[];
  lines: RecipeLineInput[];
};

export type RecipeActionResult = { error?: string; code?: string };

async function rateByStockItemId(ids: string[]) {
  if (ids.length === 0) return new Map<string, number | null>();
  const rows = await db.select({ id: stockItems.id, ratePerKgL: stockItems.ratePerKgL }).from(stockItems).where(inArray(stockItems.id, ids));
  return new Map(rows.map((r) => [r.id, r.ratePerKgL]));
}

// Live per-portion cost for main recipes used as "combo" ingredients of
// another main recipe — same costing convention as the detail page.
async function rateByMainRecipeId(ids: string[]) {
  const map = new Map<string, number | null>();
  if (ids.length === 0) return map;
  const graph = await loadCostingGraph();
  for (const id of ids) {
    const node = graph.mainRecipesById.get(id);
    map.set(id, node ? recipeCurrentCost(graph, node).perUnit : null);
  }
  return map;
}

function buildIngredientRows(
  input: RecipeInput,
  recipeId: string,
  rateByStock: Map<string, number | null>,
  rateByMainRecipe: Map<string, number | null>
) {
  return input.lines.map((l, i) => {
    const rate = l.ingredientMainRecipeId ? (rateByMainRecipe.get(l.ingredientMainRecipeId) ?? null) : (l.stockItemId ? rateByStock.get(l.stockItemId) ?? null : null);
    return {
      mainRecipeId: input.type === "main" ? recipeId : undefined,
      subRecipeId: input.type === "sub" ? recipeId : undefined,
      stockItemId: l.stockItemId ?? undefined,
      ingredientMainRecipeId: l.ingredientMainRecipeId ?? undefined,
      lineNo: i + 1,
      unitLabel: l.unitLabel || undefined,
      qty: l.qty,
      wastagePct: l.wastagePct || 0,
      rateAtBuild: rate ?? undefined,
      amountAtBuild: rate != null ? l.qty * rate : undefined,
    };
  });
}

export async function createRecipe(input: RecipeInput): Promise<RecipeActionResult> {
  const perm = input.type === "main" ? "recipes" : "subrecipes";
  const session = await assertPermission(perm, "edit");
  if (!input.name.trim()) return { error: "Recipe name is required." };
  if (input.lines.length === 0) return { error: "Add at least one ingredient." };

  const rateByStock = await rateByStockItemId(input.lines.filter((l) => l.stockItemId).map((l) => l.stockItemId!));
  const rateByMainRecipe = await rateByMainRecipeId(input.lines.filter((l) => l.ingredientMainRecipeId).map((l) => l.ingredientMainRecipeId!));

  const code = await db.transaction(async (tx) => {
    let recipeId: string;
    let code: string;
    if (input.type === "main") {
      code = await nextRecipeCode("MR");
      const [created] = await tx
        .insert(mainRecipes)
        .values({
          legacyCode: code,
          name: input.name,
          section: input.section || undefined,
          yieldQty: input.yieldQty ?? undefined,
          yieldUnit: input.yieldUnit || undefined,
          cookBookText: input.cookBookText || undefined,
          sellingPrice: input.sellingPrice ?? undefined,
          targetFoodCostPct: input.targetFoodCostPct ?? undefined,
          branches: input.branches,
        })
        .returning({ id: mainRecipes.id });
      recipeId = created.id;
      if (input.branchPrices?.length) {
        await tx.insert(recipeBranchPrices).values(input.branchPrices.map((bp) => ({ mainRecipeId: recipeId, branchId: bp.branchId, sellingPrice: bp.sellingPrice })));
      }
    } else {
      // A sub-recipe is the "recipe view" of a produced stock item — it shares
      // the same code as its underlying stock_items row (mirrors the original
      // source data, where ~151 codes existed as both a product and a recipe).
      code = await nextProductCode();
      const [stockItem] = await tx
        .insert(stockItems)
        .values({ legacyCode: code, sourceType: "produced", name: input.name, issueUnit: input.yieldUnit || undefined })
        .returning({ id: stockItems.id });
      const [created] = await tx
        .insert(subRecipes)
        .values({
          legacyCode: code,
          stockItemId: stockItem.id,
          name: input.name,
          section: input.section || undefined,
          yieldQty: input.yieldQty ?? undefined,
          yieldUnit: input.yieldUnit || undefined,
          cookBookText: input.cookBookText || undefined,
          stockable: input.stockable ?? true,
          shelfLifeDays: input.shelfLifeDays ?? undefined,
          storageInstructions: input.storageInstructions || undefined,
          branches: input.branches,
        })
        .returning({ id: subRecipes.id });
      recipeId = created.id;
    }

    await tx.insert(recipeIngredients).values(buildIngredientRows(input, recipeId, rateByStock, rateByMainRecipe));
    await tx.insert(auditLog).values({
      actorId: session.profile.id,
      action: "Created",
      entity: input.type === "main" ? "Main Recipe" : "Sub-Recipe",
      entityLabel: input.name,
      detail: `Code ${code}`,
    });
    return code;
  });

  revalidatePath("/recipes");
  return { code };
}

export async function updateRecipe(code: string, input: RecipeInput): Promise<RecipeActionResult> {
  const perm = input.type === "main" ? "recipes" : "subrecipes";
  const session = await assertPermission(perm, "edit");
  if (!input.name.trim()) return { error: "Recipe name is required." };
  if (input.lines.length === 0) return { error: "Add at least one ingredient." };

  const [existing] =
    input.type === "main"
      ? await db.select({ id: mainRecipes.id }).from(mainRecipes).where(eq(mainRecipes.legacyCode, code))
      : await db.select({ id: subRecipes.id }).from(subRecipes).where(eq(subRecipes.legacyCode, code));
  if (!existing) return { error: "Recipe not found." };

  const rateByStock = await rateByStockItemId(input.lines.filter((l) => l.stockItemId).map((l) => l.stockItemId!));
  const rateByMainRecipe = await rateByMainRecipeId(input.lines.filter((l) => l.ingredientMainRecipeId).map((l) => l.ingredientMainRecipeId!));

  await db.transaction(async (tx) => {
    if (input.type === "main") {
      await tx
        .update(mainRecipes)
        .set({
          name: input.name,
          section: input.section || null,
          yieldQty: input.yieldQty,
          yieldUnit: input.yieldUnit || null,
          cookBookText: input.cookBookText || null,
          sellingPrice: input.sellingPrice,
          targetFoodCostPct: input.targetFoodCostPct,
          branches: input.branches,
          updatedAt: new Date(),
        })
        .where(eq(mainRecipes.id, existing.id));
      await tx.delete(recipeIngredients).where(eq(recipeIngredients.mainRecipeId, existing.id));
      await tx.delete(recipeBranchPrices).where(eq(recipeBranchPrices.mainRecipeId, existing.id));
      if (input.branchPrices?.length) {
        await tx.insert(recipeBranchPrices).values(input.branchPrices.map((bp) => ({ mainRecipeId: existing.id, branchId: bp.branchId, sellingPrice: bp.sellingPrice })));
      }
    } else {
      await tx
        .update(subRecipes)
        .set({
          name: input.name,
          section: input.section || null,
          yieldQty: input.yieldQty,
          yieldUnit: input.yieldUnit || null,
          cookBookText: input.cookBookText || null,
          stockable: input.stockable ?? true,
          shelfLifeDays: input.shelfLifeDays ?? null,
          storageInstructions: input.storageInstructions || null,
          branches: input.branches,
          updatedAt: new Date(),
        })
        .where(eq(subRecipes.id, existing.id));
      await tx.delete(recipeIngredients).where(eq(recipeIngredients.subRecipeId, existing.id));
    }
    await tx.insert(recipeIngredients).values(buildIngredientRows(input, existing.id, rateByStock, rateByMainRecipe));
    await tx.insert(auditLog).values({
      actorId: session.profile.id,
      action: "Updated",
      entity: input.type === "main" ? "Main Recipe" : "Sub-Recipe",
      entityLabel: input.name,
      detail: `Code ${code}`,
    });
  });

  revalidatePath(`/recipes/${input.type}/${code}`);
  revalidatePath("/recipes");
  return { code };
}

export async function uploadRecipePhoto(type: RecipeType, code: string, formData: FormData): Promise<{ error?: string; url?: string }> {
  const perm = type === "main" ? "recipes" : "subrecipes";
  await assertPermission(perm, "edit");
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo to upload." };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `recipes/${code}-${Date.now()}.${ext}`;
  const url = await uploadPhoto(path, file);

  if (type === "main") await db.update(mainRecipes).set({ photoUrl: url, updatedAt: new Date() }).where(eq(mainRecipes.legacyCode, code));
  else await db.update(subRecipes).set({ photoUrl: url, updatedAt: new Date() }).where(eq(subRecipes.legacyCode, code));

  revalidatePath(`/recipes/${type}/${code}`);
  revalidatePath(`/recipes/${type}/${code}/edit`);
  return { url };
}

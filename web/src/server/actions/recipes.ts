"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { mainRecipes, subRecipes, recipeIngredients, stockItems, auditLog, recipeBranchPrices } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { getSession, hasAccess } from "@/server/auth/session";
import { nextRecipeCode, nextProductCode } from "@/server/db/sequences";
import { uploadPhoto } from "@/lib/supabaseAdmin";
import { loadCostingGraph, recipeCurrentCost } from "@/server/costing/recipeCost";
import { bestTextMatch } from "@/lib/textMatch";
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

export type RawRecipeImportLine = { ingredientCode?: string; ingredientName?: string; qtyNeeded: number; wastagePct: number; unitLabel: string };
export type RawRecipeImportGroup = {
  type: RecipeType;
  name: string;
  section?: string;
  yieldQty?: number | null;
  yieldUnit?: string;
  sellingPrice?: number | null;
  branches?: string[];
  lines: RawRecipeImportLine[];
};
export type RecipeBulkImportResult = { error?: string; imported?: string[]; failed?: { name: string; reason: string }[] };

// Ingredients are matched by code first (unambiguous — a stock item's
// legacyCode, which a sub-recipe's backing stock item shares too, so this
// naturally covers "use another sub-recipe as an ingredient" the same way
// the manual builder does), falling back to an exact then fuzzy name match.
// A main recipe used as a "combo" ingredient is only tried when the
// importing recipe is itself a main recipe, matching the DB check
// constraint (a sub-recipe's ingredients must always be real stock).
function resolveIngredient(
  line: RawRecipeImportLine,
  parentType: RecipeType,
  items: { id: string; legacyCode: string; name: string }[],
  recipes: { id: string; legacyCode: string; name: string }[]
): { stockItemId: string | null; ingredientMainRecipeId: string | null } | null {
  const code = line.ingredientCode?.trim();
  if (code) {
    const item = items.find((i) => i.legacyCode.toLowerCase() === code.toLowerCase());
    if (item) return { stockItemId: item.id, ingredientMainRecipeId: null };
    if (parentType === "main") {
      const recipe = recipes.find((r) => r.legacyCode.toLowerCase() === code.toLowerCase());
      if (recipe) return { stockItemId: null, ingredientMainRecipeId: recipe.id };
    }
  }
  const name = line.ingredientName?.trim();
  if (!name) return null;
  const exactItem = items.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (exactItem) return { stockItemId: exactItem.id, ingredientMainRecipeId: null };
  if (parentType === "main") {
    const exactRecipe = recipes.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (exactRecipe) return { stockItemId: null, ingredientMainRecipeId: exactRecipe.id };
  }
  const fuzzyItem = bestTextMatch(name, items, (i) => i.name);
  if (fuzzyItem) return { stockItemId: fuzzyItem.id, ingredientMainRecipeId: null };
  if (parentType === "main") {
    const fuzzyRecipe = bestTextMatch(name, recipes, (r) => r.name);
    if (fuzzyRecipe) return { stockItemId: null, ingredientMainRecipeId: fuzzyRecipe.id };
  }
  return null;
}

// Groups are pre-built client-side from the CSV's repeated header-fields-
// per-ingredient-row shape (grouped by Type+Name) — this action just
// resolves each group's ingredients against the real catalog and calls the
// existing createRecipe() per group, so code generation, rate-at-build
// computation, and the insert transaction all reuse that single code path
// rather than duplicating it. A group fails as a whole (nothing written)
// if any of its ingredients can't be resolved, or if createRecipe itself
// errors (e.g. no lines) — the rest of the batch still proceeds.
export async function bulkImportRecipes(groups: RawRecipeImportGroup[]): Promise<RecipeBulkImportResult> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };
  const types = new Set(groups.map((g) => g.type));
  if (types.has("main") && !hasAccess(session, "recipes", "edit")) return { error: 'Your role does not have edit access to "recipes".' };
  if (types.has("sub") && !hasAccess(session, "subrecipes", "edit")) return { error: 'Your role does not have edit access to "subrecipes".' };

  const validGroups = groups.filter((g) => g.name.trim());
  if (validGroups.length === 0) return { error: "No valid recipe rows found." };

  const [items, recipes] = await Promise.all([
    db.select({ id: stockItems.id, legacyCode: stockItems.legacyCode, name: stockItems.name }).from(stockItems),
    db.select({ id: mainRecipes.id, legacyCode: mainRecipes.legacyCode, name: mainRecipes.name }).from(mainRecipes),
  ]);

  const imported: string[] = [];
  const failed: { name: string; reason: string }[] = [];

  for (const g of validGroups) {
    if (g.lines.length === 0) {
      failed.push({ name: g.name, reason: "No ingredient lines." });
      continue;
    }

    const resolvedLines: RecipeLineInput[] = [];
    let lineError: string | null = null;
    for (const l of g.lines) {
      const resolved = resolveIngredient(l, g.type, items, recipes);
      if (!resolved) {
        lineError = `Ingredient "${l.ingredientCode || l.ingredientName || "(blank)"}" not found in products or recipes.`;
        break;
      }
      const qty = l.wastagePct > 0 && l.wastagePct < 100 ? l.qtyNeeded / (1 - l.wastagePct / 100) : l.qtyNeeded;
      resolvedLines.push({ ...resolved, unitLabel: l.unitLabel, qty, wastagePct: l.wastagePct });
    }
    if (lineError) {
      failed.push({ name: g.name, reason: lineError });
      continue;
    }

    const result = await createRecipe({
      type: g.type,
      name: g.name,
      section: g.section ?? "",
      yieldQty: g.yieldQty ?? null,
      yieldUnit: g.yieldUnit ?? "",
      cookBookText: "",
      sellingPrice: g.type === "main" ? (g.sellingPrice ?? null) : null,
      targetFoodCostPct: null,
      branches: g.branches ?? [],
      lines: resolvedLines,
    });
    if (result.error) failed.push({ name: g.name, reason: result.error });
    else imported.push(`${result.code} — ${g.name}`);
  }

  if (imported.length > 0) {
    await db.insert(auditLog).values({ actorId: session.profile.id, action: "Bulk Imported", entity: "Recipe", entityLabel: `${imported.length} recipe(s)`, detail: failed.length ? `${failed.length} failed` : undefined });
    revalidatePath("/recipes");
  }

  return { imported, failed };
}

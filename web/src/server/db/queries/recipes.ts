import "server-only";
import { db } from "@/server/db";
import { mainRecipes, subRecipes, recipeIngredients, stockItems, recipeBranchPrices, branches } from "@/server/db/schema";
import { eq, asc, and, ilike, or } from "drizzle-orm";
import { loadCostingGraph, recipeCurrentCost, recipeOriginalCost, getSubRecipeCost } from "@/server/costing/recipeCost";
import { normalizeToKgLtr } from "@/lib/unitMath";

export type RecipeType = "main" | "sub";

// Lightweight picker for "waste a finished dish" — just enough to let the
// user pick which main recipe was wasted before fanning it out into its
// live ingredient breakdown.
export async function listMainRecipesForPicker() {
  return db
    .select({ id: mainRecipes.id, legacyCode: mainRecipes.legacyCode, name: mainRecipes.name })
    .from(mainRecipes)
    .where(eq(mainRecipes.isArchived, false))
    .orderBy(mainRecipes.name);
}

// Lightweight name/code browse across both recipe types for the Print
// Center — deliberately skips loadCostingGraph() (used by listRecipesWithCost)
// since a print-document picker only needs code/name/section, not live cost.
export async function listRecipesForPrintCenter(q?: string): Promise<{ type: RecipeType; code: string; name: string; section: string | null }[]> {
  const [mains, subs] = await Promise.all([
    db
      .select({ code: mainRecipes.legacyCode, name: mainRecipes.name, section: mainRecipes.section })
      .from(mainRecipes)
      .where(and(eq(mainRecipes.isArchived, false), q ? or(ilike(mainRecipes.name, `%${q}%`), ilike(mainRecipes.legacyCode, `%${q}%`)) : undefined))
      .orderBy(mainRecipes.name)
      .limit(q ? 50 : 15),
    db
      .select({ code: subRecipes.legacyCode, name: subRecipes.name, section: subRecipes.section })
      .from(subRecipes)
      .where(and(eq(subRecipes.isArchived, false), q ? or(ilike(subRecipes.name, `%${q}%`), ilike(subRecipes.legacyCode, `%${q}%`)) : undefined))
      .orderBy(subRecipes.name)
      .limit(q ? 50 : 15),
  ]);

  return [...mains.map((r) => ({ type: "main" as const, ...r })), ...subs.map((r) => ({ type: "sub" as const, ...r }))];
}

export async function listRecipesWithCost(type: RecipeType, filters: { q?: string; section?: string; onlyFlagged?: boolean }) {
  const graph = await loadCostingGraph();
  const source = type === "main" ? graph.mainRecipes : [...graph.subRecipesById.values()];

  // isCombo/isModifier aren't part of the shared costing graph (they're
  // presentational, not costing-relevant) — a small separate lookup keeps
  // loadCostingGraph()'s shape untouched for its ~15 other call sites.
  const flaggedIds = filters.onlyFlagged
    ? new Set(
        type === "main"
          ? (await db.select({ id: mainRecipes.id }).from(mainRecipes).where(eq(mainRecipes.isCombo, true))).map((r) => r.id)
          : (await db.select({ id: subRecipes.id }).from(subRecipes).where(eq(subRecipes.isModifier, true))).map((r) => r.id)
      )
    : null;

  const q = filters.q?.trim().toLowerCase();
  const filtered = source.filter((r) => {
    if (q && !(r.name.toLowerCase().includes(q) || r.legacyCode.toLowerCase().includes(q))) return false;
    if (filters.section && r.section !== filters.section) return false;
    if (flaggedIds && !flaggedIds.has((r as { id: string }).id)) return false;
    return true;
  });

  const rows = filtered.map((r) => {
    let perUnit: number, missingCount: number, unreliableYield: boolean;
    if (type === "main") {
      const cur = recipeCurrentCost(graph, r);
      perUnit = cur.perUnit;
      missingCount = cur.missing.length;
      unreliableYield = false;
    } else {
      const cur = getSubRecipeCost(graph, (r as { id: string }).id);
      perUnit = cur.perUnit;
      missingCount = cur.missing.length;
      unreliableYield = cur.unreliableYield;
    }
    const orig = recipeOriginalCost(r, type === "main" || unreliableYield ? 1 : undefined);
    const variancePct = orig.perUnit ? ((perUnit - orig.perUnit) / orig.perUnit) * 100 : 0;
    const perKgLtr = type === "sub" && !unreliableYield ? normalizeToKgLtr(perUnit, r.yieldUnit) : null;
    return {
      code: r.legacyCode,
      name: r.name,
      section: r.section,
      yieldQty: r.yieldQty,
      yieldUnit: r.yieldUnit,
      perUnit,
      perKgLtr,
      origPerUnit: orig.perUnit,
      variancePct,
      missingCount,
      unreliableYield,
    };
  });

  const sections = [...new Set(source.map((r) => r.section).filter((s): s is string => !!s))].sort();
  return { rows, totalCount: source.length, sections };
}

// Menu > Products — a card-grid, menu-like view of Main Recipes grouped
// by category (photo/price up front), rather than Recipe Costing's
// spreadsheet-style table. Reuses the same costing graph as
// listRecipesWithCost — no new costing logic — plus one bulk join for
// photoUrl/sellingPrice (avoids an N+1 per-recipe fetch for a grid page).
export async function listMenuProducts() {
  const graph = await loadCostingGraph();
  const extras = await db.select({ id: mainRecipes.id, photoUrl: mainRecipes.photoUrl, sellingPrice: mainRecipes.sellingPrice }).from(mainRecipes);
  const extraById = new Map(extras.map((e) => [e.id, e]));

  const products = graph.mainRecipes.map((r) => {
    const cur = recipeCurrentCost(graph, r);
    const extra = extraById.get(r.id);
    return {
      code: r.legacyCode,
      name: r.name,
      section: r.section ?? "Uncategorized",
      perUnit: cur.perUnit,
      photoUrl: extra?.photoUrl ?? null,
      sellingPrice: extra?.sellingPrice ?? null,
    };
  });

  const byCategory = new Map<string, typeof products>();
  for (const p of products) byCategory.set(p.section, [...(byCategory.get(p.section) ?? []), p]);

  return [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([category, items]) => ({ category, items }));
}

// Menu > Modifiers — the same card-grid treatment as listMenuProducts,
// scoped to sub-recipes flagged as order-time add-ons rather than every
// production component.
export async function listMenuModifiers() {
  const graph = await loadCostingGraph();
  const flagged = await db.select({ id: subRecipes.id }).from(subRecipes).where(eq(subRecipes.isModifier, true));
  const flaggedIds = new Set(flagged.map((f) => f.id));

  return [...graph.subRecipesById.values()]
    .filter((r) => flaggedIds.has(r.id))
    .map((r) => {
      const cur = getSubRecipeCost(graph, r.id);
      return { code: r.legacyCode, name: r.name, section: r.section ?? "Uncategorized", perUnit: cur.perUnit };
    });
}

// Menu > Combos — same treatment, scoped to main recipes flagged as
// bundles of other dishes.
export async function listMenuCombos() {
  const graph = await loadCostingGraph();
  const extras = await db.select({ id: mainRecipes.id, photoUrl: mainRecipes.photoUrl, sellingPrice: mainRecipes.sellingPrice }).from(mainRecipes).where(eq(mainRecipes.isCombo, true));
  const extraById = new Map(extras.map((e) => [e.id, e]));

  return graph.mainRecipes
    .filter((r) => extraById.has(r.id))
    .map((r) => {
      const cur = recipeCurrentCost(graph, r);
      const extra = extraById.get(r.id);
      return { code: r.legacyCode, name: r.name, section: r.section ?? "Uncategorized", perUnit: cur.perUnit, photoUrl: extra?.photoUrl ?? null, sellingPrice: extra?.sellingPrice ?? null };
    });
}

export async function getRecipeDetail(type: RecipeType, code: string) {
  const graph = await loadCostingGraph();
  if (type === "main") {
    const recipe = graph.mainRecipes.find((r) => r.legacyCode === code);
    if (!recipe) return null;
    const cur = recipeCurrentCost(graph, recipe);
    const orig = recipeOriginalCost(recipe, 1);
    const variancePct = orig.perUnit ? ((cur.perUnit - orig.perUnit) / orig.perUnit) * 100 : 0;
    // sellingPrice/targetFoodCostPct/cookBookText/photoUrl are display-only
    // fields not needed by the costing graph — fetched separately and merged in.
    const [extra] = await db
      .select({
        sellingPrice: mainRecipes.sellingPrice,
        targetFoodCostPct: mainRecipes.targetFoodCostPct,
        cookBookText: mainRecipes.cookBookText,
        photoUrl: mainRecipes.photoUrl,
        branches: mainRecipes.branches,
        isCombo: mainRecipes.isCombo,
      })
      .from(mainRecipes)
      .where(eq(mainRecipes.legacyCode, code));
    const branchPrices = await db
      .select({ branchId: recipeBranchPrices.branchId, branchCode: branches.code, branchName: branches.name, sellingPrice: recipeBranchPrices.sellingPrice })
      .from(recipeBranchPrices)
      .innerJoin(branches, eq(recipeBranchPrices.branchId, branches.id))
      .where(eq(recipeBranchPrices.mainRecipeId, recipe.id))
      .orderBy(branches.name);
    return { recipe: { ...recipe, ...extra }, type, cur, orig, variancePct, branchPrices };
  }
  const recipe = [...graph.subRecipesById.values()].find((r) => r.legacyCode === code);
  if (!recipe) return null;
  const cur = getSubRecipeCost(graph, recipe.id);
  const orig = recipeOriginalCost(recipe, cur.unreliableYield ? 1 : undefined);
  const variancePct = orig.perUnit ? ((cur.perUnit - orig.perUnit) / orig.perUnit) * 100 : 0;
  const [extra] = await db
    .select({
      cookBookText: subRecipes.cookBookText,
      photoUrl: subRecipes.photoUrl,
      stockable: subRecipes.stockable,
      shelfLifeDays: subRecipes.shelfLifeDays,
      storageInstructions: subRecipes.storageInstructions,
      branches: subRecipes.branches,
      isModifier: subRecipes.isModifier,
    })
    .from(subRecipes)
    .where(eq(subRecipes.legacyCode, code));
  return { recipe: { ...recipe, ...extra }, type, cur, orig, variancePct, branchPrices: [] as { branchId: string; branchCode: string; branchName: string; sellingPrice: number }[] };
}

export async function listIngredientPickerItems() {
  return db
    .select({
      id: stockItems.id,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      issueUnit: stockItems.issueUnit,
      ratePerKgL: stockItems.ratePerKgL,
      sourceType: stockItems.sourceType,
    })
    .from(stockItems)
    .where(eq(stockItems.isActive, true))
    .orderBy(stockItems.name);
}

export type RecipeIngredientPickerItem = {
  kind: "stock" | "recipe";
  id: string;
  legacyCode: string;
  name: string;
  issueUnit: string | null;
  ratePerKgL: number | null;
  sourceType: string;
};

// Same stock-item picker as listIngredientPickerItems(), plus — only for
// main recipes — every other main recipe as a "combo" ingredient option,
// costed live per portion (recipeCurrentCost's own convention). Sub-recipes
// never get this extra group: their ingredients are real consumable stock
// that Production actually depletes.
export async function listRecipeIngredientPickerItems(type: RecipeType, excludeCode?: string): Promise<RecipeIngredientPickerItem[]> {
  const stockRows = await listIngredientPickerItems();
  const stockOptions: RecipeIngredientPickerItem[] = stockRows.map((r) => ({ kind: "stock" as const, ...r }));
  if (type !== "main") return stockOptions;

  const graph = await loadCostingGraph();
  const recipeOptions: RecipeIngredientPickerItem[] = graph.mainRecipes
    .filter((m) => m.legacyCode !== excludeCode)
    .map((m) => ({
      kind: "recipe" as const,
      id: m.id,
      legacyCode: m.legacyCode,
      name: m.name,
      issueUnit: "portion",
      ratePerKgL: recipeCurrentCost(graph, m).perUnit,
      sourceType: "recipe",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...stockOptions, ...recipeOptions];
}

export async function getRecipeForEdit(type: RecipeType, code: string) {
  if (type === "main") {
    const [recipe] = await db.select().from(mainRecipes).where(eq(mainRecipes.legacyCode, code));
    if (!recipe) return null;
    const ingredients = await db
      .select({
        id: recipeIngredients.id,
        stockItemId: recipeIngredients.stockItemId,
        ingredientMainRecipeId: recipeIngredients.ingredientMainRecipeId,
        unitLabel: recipeIngredients.unitLabel,
        qty: recipeIngredients.qty,
        wastagePct: recipeIngredients.wastagePct,
      })
      .from(recipeIngredients)
      .where(eq(recipeIngredients.mainRecipeId, recipe.id))
      .orderBy(asc(recipeIngredients.lineNo));
    const branchPrices = await db
      .select({ branchId: recipeBranchPrices.branchId, sellingPrice: recipeBranchPrices.sellingPrice })
      .from(recipeBranchPrices)
      .where(eq(recipeBranchPrices.mainRecipeId, recipe.id));
    return { recipe, ingredients, branchPrices };
  }
  const [recipe] = await db.select().from(subRecipes).where(eq(subRecipes.legacyCode, code));
  if (!recipe) return null;
  const ingredients = await db
    .select({
      id: recipeIngredients.id,
      stockItemId: recipeIngredients.stockItemId,
      ingredientMainRecipeId: recipeIngredients.ingredientMainRecipeId,
      unitLabel: recipeIngredients.unitLabel,
      qty: recipeIngredients.qty,
      wastagePct: recipeIngredients.wastagePct,
    })
    .from(recipeIngredients)
    .where(eq(recipeIngredients.subRecipeId, recipe.id))
    .orderBy(asc(recipeIngredients.lineNo));
  return { recipe, ingredients, branchPrices: [] as { branchId: string; sellingPrice: number }[] };
}

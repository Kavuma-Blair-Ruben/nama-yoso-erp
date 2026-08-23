import "server-only";
import { db } from "@/server/db";
import { mainRecipes, subRecipes, recipeIngredients, stockItems } from "@/server/db/schema";
import { normalizeToKgLtr } from "@/lib/unitMath";
export { displayYield, normalizeToKgLtr } from "@/lib/unitMath";

/**
 * Ported from index.html's recipeCurrentCost / recipeOriginalCost /
 * subRecipeCost / ingredientCost. Same algorithm, same unit-normalization
 * rules (recipe ingredient quantities are always KG/LTR-equivalent; a
 * sub-recipe's own per-yield-unit cost gets normalized to per-KG/LTR before
 * being multiplied by the parent's qty).
 *
 * One difference from the original: there is no separate "override" layer
 * here — stock_items.rate_per_kg_l IS the live rate (kept in sync with
 * purchase_rate by the price-update Server Action), so costing reads it
 * directly with no override-scaling step.
 */

export type MissingIngredient = { code: string; name: string };

export type Ingredient = {
  stockItemId: string | null;
  ingredientMainRecipeId: string | null;
  legacyCode: string;
  name: string;
  unitLabel: string | null;
  productIssueUnit: string | null;
  qty: number;
  rateAtBuild: number | null;
  amountAtBuild: number | null;
};

type SubRecipeNode = {
  id: string;
  legacyCode: string;
  name: string;
  section: string | null;
  yieldQty: number | null;
  yieldUnit: string | null;
  ingredients: Ingredient[];
};

type MainRecipeNode = {
  id: string;
  legacyCode: string;
  name: string;
  section: string | null;
  yieldQty: number | null;
  yieldUnit: string | null;
  ingredients: Ingredient[];
};

export type CostingGraph = {
  mainRecipes: MainRecipeNode[];
  mainRecipesById: Map<string, MainRecipeNode>;
  subRecipesById: Map<string, SubRecipeNode>;
  subRecipeIdByStockItemId: Map<string, string>;
  rateByStockItemId: Map<string, number | null>;
};

export async function loadCostingGraph(): Promise<CostingGraph> {
  const [items, subs, mains, ingredients] = await Promise.all([
    db.select({ id: stockItems.id, legacyCode: stockItems.legacyCode, name: stockItems.name, ratePerKgL: stockItems.ratePerKgL, issueUnit: stockItems.issueUnit }).from(stockItems),
    db
      .select({
        id: subRecipes.id,
        legacyCode: subRecipes.legacyCode,
        name: subRecipes.name,
        section: subRecipes.section,
        yieldQty: subRecipes.yieldQty,
        yieldUnit: subRecipes.yieldUnit,
        stockItemId: subRecipes.stockItemId,
      })
      .from(subRecipes),
    db
      .select({
        id: mainRecipes.id,
        legacyCode: mainRecipes.legacyCode,
        name: mainRecipes.name,
        section: mainRecipes.section,
        yieldQty: mainRecipes.yieldQty,
        yieldUnit: mainRecipes.yieldUnit,
      })
      .from(mainRecipes),
    db
      .select({
        mainRecipeId: recipeIngredients.mainRecipeId,
        subRecipeId: recipeIngredients.subRecipeId,
        stockItemId: recipeIngredients.stockItemId,
        ingredientMainRecipeId: recipeIngredients.ingredientMainRecipeId,
        unitLabel: recipeIngredients.unitLabel,
        qty: recipeIngredients.qty,
        rateAtBuild: recipeIngredients.rateAtBuild,
        amountAtBuild: recipeIngredients.amountAtBuild,
        lineNo: recipeIngredients.lineNo,
      })
      .from(recipeIngredients),
  ]);

  const itemById = new Map(items.map((i) => [i.id, i]));
  const mainById = new Map(mains.map((m) => [m.id, m]));
  const rateByStockItemId = new Map(items.map((i) => [i.id, i.ratePerKgL]));
  const subRecipeIdByStockItemId = new Map(subs.map((s) => [s.stockItemId, s.id]));

  function toIngredient(row: (typeof ingredients)[number]): Ingredient {
    if (row.ingredientMainRecipeId) {
      const main = mainById.get(row.ingredientMainRecipeId);
      return {
        stockItemId: null,
        ingredientMainRecipeId: row.ingredientMainRecipeId,
        legacyCode: main?.legacyCode ?? row.ingredientMainRecipeId,
        name: main?.name ?? "(unknown recipe)",
        unitLabel: row.unitLabel,
        productIssueUnit: null,
        qty: row.qty,
        rateAtBuild: row.rateAtBuild,
        amountAtBuild: row.amountAtBuild,
      };
    }
    const item = row.stockItemId ? itemById.get(row.stockItemId) : undefined;
    return {
      stockItemId: row.stockItemId,
      ingredientMainRecipeId: null,
      legacyCode: item?.legacyCode ?? row.stockItemId ?? "",
      name: item?.name ?? "(unknown item)",
      unitLabel: row.unitLabel,
      productIssueUnit: item?.issueUnit ?? null,
      qty: row.qty,
      rateAtBuild: row.rateAtBuild,
      amountAtBuild: row.amountAtBuild,
    };
  }

  const ingredientsByMain = new Map<string, Ingredient[]>();
  const ingredientsBySub = new Map<string, Ingredient[]>();
  ingredients
    .sort((a, b) => a.lineNo - b.lineNo)
    .forEach((row) => {
      if (row.mainRecipeId) {
        const arr = ingredientsByMain.get(row.mainRecipeId) ?? [];
        arr.push(toIngredient(row));
        ingredientsByMain.set(row.mainRecipeId, arr);
      } else if (row.subRecipeId) {
        const arr = ingredientsBySub.get(row.subRecipeId) ?? [];
        arr.push(toIngredient(row));
        ingredientsBySub.set(row.subRecipeId, arr);
      }
    });

  const subRecipesById = new Map<string, SubRecipeNode>(
    subs.map((s) => [s.id, { ...s, ingredients: ingredientsBySub.get(s.id) ?? [] }])
  );

  const mainRecipeNodes: MainRecipeNode[] = mains.map((m) => ({ ...m, ingredients: ingredientsByMain.get(m.id) ?? [] }));
  const mainRecipesById = new Map<string, MainRecipeNode>(mainRecipeNodes.map((m) => [m.id, m]));

  return { mainRecipes: mainRecipeNodes, mainRecipesById, subRecipesById, subRecipeIdByStockItemId, rateByStockItemId };
}

export type IngredientCostResult = { cost: number; missing: MissingIngredient[]; sub?: SubRecipeCostResult };
export type SubRecipeCostResult = {
  total: number;
  perUnit: number;
  yieldQty: number;
  yieldUnit: string | null;
  unreliableYield: boolean;
  missing: MissingIngredient[];
  lines: { ing: Ingredient; result: IngredientCostResult }[];
  name: string;
  code: string;
  section: string | null;
};
export type RecipeCostResult = {
  total: number;
  perUnit: number;
  missing: MissingIngredient[];
  lines: { ing: Ingredient; result: IngredientCostResult }[];
};

function ingredientCost(graph: CostingGraph, ing: Ingredient, visited: Set<string>): IngredientCostResult {
  if (ing.ingredientMainRecipeId) {
    const mainNode = graph.mainRecipesById.get(ing.ingredientMainRecipeId);
    if (!mainNode) {
      return { cost: ing.qty * (ing.rateAtBuild ?? 0), missing: [{ code: ing.legacyCode, name: ing.name }] };
    }
    const inner = recipeCurrentCost(graph, mainNode, visited);
    // Reported through the same `sub` shape sub-recipes use, so the ledger
    // UI can expand/drill into an embedded main recipe's own lines too —
    // yieldQty/yieldUnit are portion-based (no batch yield to normalize).
    return {
      cost: ing.qty * inner.perUnit,
      missing: inner.missing,
      sub: { total: inner.total, perUnit: inner.perUnit, yieldQty: 1, yieldUnit: null, unreliableYield: false, missing: inner.missing, lines: inner.lines, name: mainNode.name, code: mainNode.legacyCode, section: mainNode.section },
    };
  }
  const subRecipeId = ing.stockItemId ? graph.subRecipeIdByStockItemId.get(ing.stockItemId) : undefined;
  if (subRecipeId) {
    const sub = subRecipeCost(graph, subRecipeId, visited);
    const perKgLtr = normalizeToKgLtr(sub.perUnit, sub.yieldUnit);
    const rate = perKgLtr != null ? perKgLtr : sub.perUnit;
    return { cost: ing.qty * rate, missing: sub.missing, sub };
  }
  const rate = ing.stockItemId ? graph.rateByStockItemId.get(ing.stockItemId) : null;
  if (rate == null) {
    return { cost: ing.qty * (ing.rateAtBuild ?? 0), missing: [{ code: ing.legacyCode, name: ing.name }] };
  }
  return { cost: ing.qty * rate, missing: [] };
}

function subRecipeCost(graph: CostingGraph, subRecipeId: string, visited: Set<string>): SubRecipeCostResult {
  if (visited.has(subRecipeId)) {
    return { total: 0, perUnit: 0, yieldQty: 1, yieldUnit: "", unreliableYield: false, missing: [{ code: subRecipeId, name: "circular reference" }], lines: [], name: "", code: "", section: null };
  }
  const sr = graph.subRecipesById.get(subRecipeId);
  if (!sr) {
    return { total: 0, perUnit: 0, yieldQty: 1, yieldUnit: "", unreliableYield: false, missing: [{ code: subRecipeId, name: "sub-recipe not found" }], lines: [], name: "", code: "", section: null };
  }
  const nextVisited = new Set(visited);
  nextVisited.add(subRecipeId);
  let total = 0;
  let missing: MissingIngredient[] = [];
  const lines = sr.ingredients.map((ing) => {
    const r = ingredientCost(graph, ing, nextVisited);
    total += r.cost;
    missing = missing.concat(r.missing);
    return { ing, result: r };
  });
  // A handful of sub-recipes carry a "yield" under 1 piece that isn't a real
  // batch size (matches the same data caveat documented in index.html) —
  // treat as yield = 1 (cost per prep/portion) rather than dividing by it.
  const isUnreliablePieceYield =
    /^(PC|PCS|PIECE|EA|EACH)$/i.test((sr.yieldUnit ?? "").trim()) && sr.yieldQty != null && sr.yieldQty < 1;
  const yieldQty = isUnreliablePieceYield ? 1 : sr.yieldQty || 1;
  return {
    total,
    perUnit: total / yieldQty,
    yieldQty,
    yieldUnit: sr.yieldUnit,
    unreliableYield: isUnreliablePieceYield,
    missing,
    lines,
    name: sr.name,
    code: sr.legacyCode,
    section: sr.section,
  };
}

// NOTE: main-recipe "yield" in the source data is a cost checksum, not a
// physical batch yield, so main recipe cost is reported per portion (no
// division). Sub-recipes DO carry a genuine batch yield and stay costed per
// yield-unit, same as index.html.
//
// `visited` threads through recursion when this main recipe is itself used
// as an ingredient of another main recipe (a "combo" built from other
// dishes) — same cycle-guard convention as subRecipeCost, sharing one Set
// across both recipe types since their UUIDs never collide.
export function recipeCurrentCost(graph: CostingGraph, recipe: { id?: string; ingredients: Ingredient[] }, visited: Set<string> = new Set()): RecipeCostResult {
  if (recipe.id && visited.has(recipe.id)) {
    return { total: 0, perUnit: 0, missing: [{ code: recipe.id, name: "circular reference" }], lines: [] };
  }
  const nextVisited = recipe.id ? new Set(visited).add(recipe.id) : visited;
  let total = 0;
  let missing: MissingIngredient[] = [];
  const lines = recipe.ingredients.map((ing) => {
    const r = ingredientCost(graph, ing, nextVisited);
    total += r.cost;
    missing = missing.concat(r.missing);
    return { ing, result: r };
  });
  return { total, perUnit: total, missing, lines };
}

export function recipeOriginalCost(recipe: { ingredients: Ingredient[]; yieldQty?: number | null }, divisor?: number) {
  const total = recipe.ingredients.reduce((s, i) => s + (i.amountAtBuild ?? 0), 0);
  const d = divisor || recipe.yieldQty || 1;
  return { total, perUnit: total / d };
}

export function getSubRecipeCost(graph: CostingGraph, subRecipeId: string): SubRecipeCostResult {
  return subRecipeCost(graph, subRecipeId, new Set());
}

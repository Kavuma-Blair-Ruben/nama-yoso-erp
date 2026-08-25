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
  // Stock items flagged as packaging (box/bag/cutlery, not food) — lets
  // recipe costing report a separate Food Cost / Packaging Cost split
  // instead of one blended total, without a new ingredient-line concept
  // (a packaging item is added as a completely ordinary ingredient line).
  packagingStockItemIds: Set<string>;
};

export async function loadCostingGraph(): Promise<CostingGraph> {
  const [items, subs, mains, ingredients] = await Promise.all([
    db.select({ id: stockItems.id, legacyCode: stockItems.legacyCode, name: stockItems.name, ratePerKgL: stockItems.ratePerKgL, issueUnit: stockItems.issueUnit, isPackaging: stockItems.isPackaging }).from(stockItems),
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
  const packagingStockItemIds = new Set(items.filter((i) => i.isPackaging).map((i) => i.id));

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

  return { mainRecipes: mainRecipeNodes, mainRecipesById, subRecipesById, subRecipeIdByStockItemId, rateByStockItemId, packagingStockItemIds };
}

export type IngredientCostResult = { cost: number; packagingCost: number; missing: MissingIngredient[]; sub?: SubRecipeCostResult };
export type SubRecipeCostResult = {
  total: number;
  foodCost: number;
  packagingCost: number;
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
  foodCost: number;
  packagingCost: number;
  perUnit: number;
  missing: MissingIngredient[];
  lines: { ing: Ingredient; result: IngredientCostResult }[];
};

// Proportional split — applies a nested recipe's own packaging fraction to
// however much of it this line contributes, regardless of unit conversion
// (per-KG/L rate vs. per-portion), rather than re-deriving packaging qty
// from scratch for every possible nesting shape.
function packagingShareOf(cost: number, innerTotal: number, innerPackagingCost: number): number {
  return innerTotal > 0 ? cost * (innerPackagingCost / innerTotal) : 0;
}

function ingredientCost(graph: CostingGraph, ing: Ingredient, visited: Set<string>): IngredientCostResult {
  if (ing.ingredientMainRecipeId) {
    const mainNode = graph.mainRecipesById.get(ing.ingredientMainRecipeId);
    if (!mainNode) {
      return { cost: ing.qty * (ing.rateAtBuild ?? 0), packagingCost: 0, missing: [{ code: ing.legacyCode, name: ing.name }] };
    }
    const inner = recipeCurrentCost(graph, mainNode, visited);
    const cost = ing.qty * inner.perUnit;
    // Reported through the same `sub` shape sub-recipes use, so the ledger
    // UI can expand/drill into an embedded main recipe's own lines too —
    // yieldQty/yieldUnit are portion-based (no batch yield to normalize).
    return {
      cost,
      packagingCost: ing.qty * inner.packagingCost,
      missing: inner.missing,
      sub: {
        total: inner.total,
        foodCost: inner.foodCost,
        packagingCost: inner.packagingCost,
        perUnit: inner.perUnit,
        yieldQty: 1,
        yieldUnit: null,
        unreliableYield: false,
        missing: inner.missing,
        lines: inner.lines,
        name: mainNode.name,
        code: mainNode.legacyCode,
        section: mainNode.section,
      },
    };
  }
  const subRecipeId = ing.stockItemId ? graph.subRecipeIdByStockItemId.get(ing.stockItemId) : undefined;
  if (subRecipeId) {
    const sub = subRecipeCost(graph, subRecipeId, visited);
    const perKgLtr = normalizeToKgLtr(sub.perUnit, sub.yieldUnit);
    const rate = perKgLtr != null ? perKgLtr : sub.perUnit;
    const cost = ing.qty * rate;
    return { cost, packagingCost: packagingShareOf(cost, sub.total, sub.packagingCost), missing: sub.missing, sub };
  }
  const rate = ing.stockItemId ? graph.rateByStockItemId.get(ing.stockItemId) : null;
  if (rate == null) {
    return { cost: ing.qty * (ing.rateAtBuild ?? 0), packagingCost: 0, missing: [{ code: ing.legacyCode, name: ing.name }] };
  }
  const cost = ing.qty * rate;
  const isPackaging = !!ing.stockItemId && graph.packagingStockItemIds.has(ing.stockItemId);
  return { cost, packagingCost: isPackaging ? cost : 0, missing: [] };
}

function subRecipeCost(graph: CostingGraph, subRecipeId: string, visited: Set<string>): SubRecipeCostResult {
  if (visited.has(subRecipeId)) {
    return { total: 0, foodCost: 0, packagingCost: 0, perUnit: 0, yieldQty: 1, yieldUnit: "", unreliableYield: false, missing: [{ code: subRecipeId, name: "circular reference" }], lines: [], name: "", code: "", section: null };
  }
  const sr = graph.subRecipesById.get(subRecipeId);
  if (!sr) {
    return { total: 0, foodCost: 0, packagingCost: 0, perUnit: 0, yieldQty: 1, yieldUnit: "", unreliableYield: false, missing: [{ code: subRecipeId, name: "sub-recipe not found" }], lines: [], name: "", code: "", section: null };
  }
  const nextVisited = new Set(visited);
  nextVisited.add(subRecipeId);
  let total = 0;
  let packagingCost = 0;
  let missing: MissingIngredient[] = [];
  const lines = sr.ingredients.map((ing) => {
    const r = ingredientCost(graph, ing, nextVisited);
    total += r.cost;
    packagingCost += r.packagingCost;
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
    foodCost: total - packagingCost,
    packagingCost,
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
    return { total: 0, foodCost: 0, packagingCost: 0, perUnit: 0, missing: [{ code: recipe.id, name: "circular reference" }], lines: [] };
  }
  const nextVisited = recipe.id ? new Set(visited).add(recipe.id) : visited;
  let total = 0;
  let packagingCost = 0;
  let missing: MissingIngredient[] = [];
  const lines = recipe.ingredients.map((ing) => {
    const r = ingredientCost(graph, ing, nextVisited);
    total += r.cost;
    packagingCost += r.packagingCost;
    missing = missing.concat(r.missing);
    return { ing, result: r };
  });
  return { total, foodCost: total - packagingCost, packagingCost, perUnit: total, missing, lines };
}

export function recipeOriginalCost(recipe: { ingredients: Ingredient[]; yieldQty?: number | null }, divisor?: number) {
  const total = recipe.ingredients.reduce((s, i) => s + (i.amountAtBuild ?? 0), 0);
  const d = divisor || recipe.yieldQty || 1;
  return { total, perUnit: total / d };
}

export function getSubRecipeCost(graph: CostingGraph, subRecipeId: string): SubRecipeCostResult {
  return subRecipeCost(graph, subRecipeId, new Set());
}

export type RecipeWasteLine = { stockItemId: string; unitLabel: string | null; qty: number; rate: number; legacyCode: string; name: string };

// Turns a costed recipe's ingredient tree into a flat list of real stock
// deductions — one row per stock-backed ingredient, already scaled by
// `multiplier` (e.g. portions wasted, or units sold). A recipe's top-level
// ingredient lines are already the right granularity to deduct — a
// sub-recipe ingredient has its own stock_item_id and gets deducted from ITS
// OWN balance (same as wasting a sub-recipe batch directly), not exploded
// further. Only an ingredient that is itself a main recipe (a nested
// "combo") has no stock item to deduct from, so that one case recurses into
// its own resolved lines (already computed by ingredientCost/
// recipeCurrentCost via the shared `sub` shape). Shared by "Waste a Finished
// Dish" (src/server/actions/wastage.ts) and the Foodics sale webhook.
export function flattenRecipeToStockLines(lines: { ing: Ingredient; result: IngredientCostResult }[], multiplier: number): RecipeWasteLine[] {
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

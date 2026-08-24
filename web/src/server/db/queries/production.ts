import "server-only";
import { db } from "@/server/db";
import { productionBatches, productionBatchIngredients, subRecipes, stockItems, recipeIngredients, branches, profiles, stockBalances } from "@/server/db/schema";
import { and, eq, ilike, or, desc, inArray, sql } from "drizzle-orm";

// One round trip for the New Production Batch builder: every stockable,
// non-archived sub-recipe plus its flat ingredient list (at live rate),
// grouped in JS. Bounded by the sub-recipe count (tens, not thousands), so a
// single join beats N+1 fetch-per-selection round trips from the client.
export async function listEligibleSubRecipesWithIngredients() {
  const subs = await db
    .select({
      id: subRecipes.id,
      legacyCode: subRecipes.legacyCode,
      name: subRecipes.name,
      yieldQty: subRecipes.yieldQty,
      yieldUnit: subRecipes.yieldUnit,
      stockItemId: subRecipes.stockItemId,
      shelfLifeDays: subRecipes.shelfLifeDays,
      storageInstructions: subRecipes.storageInstructions,
    })
    .from(subRecipes)
    .where(and(eq(subRecipes.stockable, true), eq(subRecipes.isArchived, false)))
    .orderBy(subRecipes.name);

  const ingredientRows = await db
    .select({
      subRecipeId: recipeIngredients.subRecipeId,
      stockItemId: recipeIngredients.stockItemId,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      issueUnit: stockItems.issueUnit,
      ratePerKgL: stockItems.ratePerKgL,
      qty: recipeIngredients.qty,
      unitLabel: recipeIngredients.unitLabel,
      lineNo: recipeIngredients.lineNo,
    })
    .from(recipeIngredients)
    .innerJoin(stockItems, eq(recipeIngredients.stockItemId, stockItems.id))
    .where(inArray(recipeIngredients.subRecipeId, subs.map((s) => s.id)))
    .orderBy(recipeIngredients.lineNo);

  return subs.map((s) => ({
    ...s,
    // Sub-recipe ingredients are always real stock items (a main recipe can
    // never be embedded inside a sub-recipe — Production actually depletes
    // these), so stockItemId is guaranteed non-null here despite the column
    // being nullable at the schema level to support main-recipe-as-ingredient.
    ingredients: ingredientRows
      .filter((r) => r.subRecipeId === s.id)
      .map(({ subRecipeId: _subRecipeId, lineNo: _lineNo, stockItemId, ...rest }) => ({ stockItemId: stockItemId!, ...rest })),
  }));
}

// All (item, branch) balances, summed across every sector at that branch —
// small, bounded table — so the New Production Batch builder can show
// "Available" stock and a non-blocking shortage warning per ingredient
// without a fetch round trip on every branch/recipe change (matches
// index.html's productionIngredientRowsHTML). Summed rather than per-sector
// because these callers (Production, Purchase Orders) care about whether the
// branch has enough stock at all, not which sector it's sitting in — for a
// sector-scoped view see listStockBalancesBySector().
export async function listAllStockBalances() {
  return db
    .select({ stockItemId: stockBalances.stockItemId, branchId: stockBalances.branchId, qtyOnHand: sql<number>`sum(${stockBalances.qtyOnHand})` })
    .from(stockBalances)
    .groupBy(stockBalances.stockItemId, stockBalances.branchId);
}

// Ungrouped, per-sector balances — Stock Count needs the exact
// (stockItemId, branchId, costCenterId) row since a physical count is
// inherently scoped to one sector, not a branch-wide total.
export async function listStockBalancesBySector() {
  return db
    .select({ stockItemId: stockBalances.stockItemId, branchId: stockBalances.branchId, costCenterId: stockBalances.costCenterId, qtyOnHand: stockBalances.qtyOnHand })
    .from(stockBalances);
}

export async function listProductionBatches(filters: { status?: string; q?: string }) {
  const conditions = [];
  if (filters.status) conditions.push(eq(productionBatches.status, filters.status));
  if (filters.q) {
    conditions.push(
      or(ilike(subRecipes.name, `%${filters.q}%`), ilike(subRecipes.legacyCode, `%${filters.q}%`), ilike(productionBatches.batchNo, `%${filters.q}%`))!
    );
  }

  return db
    .select({
      id: productionBatches.id,
      batchNo: productionBatches.batchNo,
      lotNo: productionBatches.lotNo,
      subRecipeName: subRecipes.name,
      subRecipeCode: subRecipes.legacyCode,
      branchName: branches.name,
      yieldQty: productionBatches.yieldQty,
      yieldUnit: productionBatches.yieldUnit,
      totalCost: productionBatches.totalCost,
      producedDate: productionBatches.producedDate,
      status: productionBatches.status,
      createdAt: productionBatches.createdAt,
      postedAt: productionBatches.postedAt,
      staffName: productionBatches.staffName,
    })
    .from(productionBatches)
    .innerJoin(subRecipes, eq(productionBatches.subRecipeId, subRecipes.id))
    .leftJoin(branches, eq(productionBatches.branchId, branches.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(productionBatches.batchNo));
}

export async function getProductionBatchDetail(id: string) {
  const [batch] = await db
    .select({
      id: productionBatches.id,
      batchNo: productionBatches.batchNo,
      lotNo: productionBatches.lotNo,
      subRecipeId: productionBatches.subRecipeId,
      subRecipeName: subRecipes.name,
      subRecipeCode: subRecipes.legacyCode,
      stockItemId: subRecipes.stockItemId,
      storageInstructions: subRecipes.storageInstructions,
      branchId: productionBatches.branchId,
      branchName: branches.name,
      scaleMultiplier: productionBatches.scaleMultiplier,
      yieldQty: productionBatches.yieldQty,
      yieldUnit: productionBatches.yieldUnit,
      totalCost: productionBatches.totalCost,
      costPerUnit: productionBatches.costPerUnit,
      producedDate: productionBatches.producedDate,
      expiryDate: productionBatches.expiryDate,
      status: productionBatches.status,
      notes: productionBatches.notes,
      staffName: productionBatches.staffName,
      createdAt: productionBatches.createdAt,
      postedAt: productionBatches.postedAt,
      postedByName: profiles.name,
      openTicketPrintedAt: productionBatches.openTicketPrintedAt,
    })
    .from(productionBatches)
    .innerJoin(subRecipes, eq(productionBatches.subRecipeId, subRecipes.id))
    .leftJoin(branches, eq(productionBatches.branchId, branches.id))
    .leftJoin(profiles, eq(productionBatches.postedBy, profiles.id))
    .where(eq(productionBatches.id, id));
  if (!batch) return null;

  const ingredients = await db
    .select({
      id: productionBatchIngredients.id,
      stockItemId: productionBatchIngredients.stockItemId,
      name: stockItems.name,
      legacyCode: stockItems.legacyCode,
      qty: productionBatchIngredients.qty,
      unitLabel: productionBatchIngredients.unitLabel,
      rateAtProduction: productionBatchIngredients.rateAtProduction,
      amountAtProduction: productionBatchIngredients.amountAtProduction,
    })
    .from(productionBatchIngredients)
    .innerJoin(stockItems, eq(productionBatchIngredients.stockItemId, stockItems.id))
    .where(eq(productionBatchIngredients.productionBatchId, id));

  return { batch, ingredients };
}

export async function getProductionBatchForEdit(id: string) {
  const [batch] = await db.select().from(productionBatches).where(and(eq(productionBatches.id, id), eq(productionBatches.status, "OPEN")));
  if (!batch) return null;

  const ingredients = await db
    .select({
      stockItemId: productionBatchIngredients.stockItemId,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      qty: productionBatchIngredients.qty,
      unitLabel: productionBatchIngredients.unitLabel,
      rateAtProduction: productionBatchIngredients.rateAtProduction,
    })
    .from(productionBatchIngredients)
    .innerJoin(stockItems, eq(productionBatchIngredients.stockItemId, stockItems.id))
    .where(eq(productionBatchIngredients.productionBatchId, id));

  return { batch, ingredients };
}

// For "Repeat" — only the sub-recipe + scale + notes are copied; ingredient
// lines are deliberately NOT carried over so the builder recomputes them
// fresh from the sub-recipe's current definition and live rates (matches
// index.html's production "repeat", which only copied recipeCode/batches/
// staff and always recomputed ingredients live).
export async function getProductionBatchForClone(id: string) {
  const [batch] = await db.select().from(productionBatches).where(eq(productionBatches.id, id));
  return batch ?? null;
}

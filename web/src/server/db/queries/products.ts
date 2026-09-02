import "server-only";
import { db } from "@/server/db";
import {
  stockItems,
  categories,
  subcategories,
  suppliers,
  productSupplierPackaging,
  priceHistory,
  mainRecipes,
  subRecipes,
  recipeIngredients,
  stockBalances,
  stockLots,
  branches,
} from "@/server/db/schema";
import { and, eq, ilike, or, sql, desc, count, isNull } from "drizzle-orm";

export type ProductFilters = { q?: string; category?: string; subcategory?: string; storage?: string; supplier?: string; missingPrice?: boolean };

// priceChangeCount/qtyOnHand used to be correlated subqueries evaluated once
// PER stock item row — measured at 5.3s for 600 rows on the live DB. Same
// fix as listSuppliers (see its comment): each aggregate becomes its own
// GROUP BY over its own table, joined once as a derived table, instead of
// one subquery execution per outer row.
export async function listProducts(filters: ProductFilters) {
  const conditions = [eq(stockItems.isActive, true)];
  if (filters.q) {
    conditions.push(or(ilike(stockItems.name, `%${filters.q}%`), ilike(stockItems.legacyCode, `%${filters.q}%`))!);
  }
  if (filters.category) conditions.push(eq(categories.name, filters.category));
  if (filters.subcategory) conditions.push(eq(subcategories.name, filters.subcategory));
  if (filters.storage) conditions.push(eq(stockItems.storageType, filters.storage as "DRY" | "CHILLED" | "FROZEN"));
  if (filters.supplier) conditions.push(eq(suppliers.name, filters.supplier));
  if (filters.missingPrice) conditions.push(isNull(stockItems.ratePerKgL));

  const priceCountAgg = db
    .select({
      stockItemId: priceHistory.stockItemId,
      cnt: sql<number>`count(*)::int`.as("cnt"),
    })
    .from(priceHistory)
    .groupBy(priceHistory.stockItemId)
    .as("price_count_agg");

  // Summed across branches — Product Master isn't branch-scoped yet, so a
  // single total is the right first cut (per-branch appears on the detail page).
  const qtyAgg = db
    .select({
      stockItemId: stockBalances.stockItemId,
      qty: sql<number>`sum(${stockBalances.qtyOnHand})::float8`.as("qty"),
    })
    .from(stockBalances)
    .groupBy(stockBalances.stockItemId)
    .as("qty_agg");

  const rows = await db
    .select({
      id: stockItems.id,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      sourceType: stockItems.sourceType,
      category: categories.name,
      subcategory: subcategories.name,
      storageType: stockItems.storageType,
      supplier: suppliers.name,
      purchaseUnit: stockItems.purchaseUnit,
      issueUnit: stockItems.issueUnit,
      purchaseRate: stockItems.purchaseRate,
      ratePerKgL: stockItems.ratePerKgL,
      ratePerGMl: stockItems.ratePerGMl,
      priceChangeCount: sql<number>`coalesce(${priceCountAgg.cnt}, 0)`,
      qtyOnHand: sql<number>`coalesce(${qtyAgg.qty}, 0)`,
    })
    .from(stockItems)
    .leftJoin(categories, eq(stockItems.categoryId, categories.id))
    .leftJoin(subcategories, eq(stockItems.subcategoryId, subcategories.id))
    .leftJoin(suppliers, eq(stockItems.supplierId, suppliers.id))
    .leftJoin(priceCountAgg, eq(priceCountAgg.stockItemId, stockItems.id))
    .leftJoin(qtyAgg, eq(qtyAgg.stockItemId, stockItems.id))
    .where(and(...conditions))
    .orderBy(stockItems.legacyCode)
    .limit(600);

  return rows;
}

export async function listCategoriesForFilter() {
  return db.select({ name: categories.name }).from(categories).orderBy(categories.sortOrder);
}
export async function listSubcategoriesForFilter() {
  return db.select({ name: subcategories.name }).from(subcategories).orderBy(subcategories.name);
}
export async function listSuppliersForFilter() {
  return db.select({ name: suppliers.name }).from(suppliers).orderBy(suppliers.name);
}
export async function listAccountingCategories() {
  const rows = await db
    .selectDistinct({ value: stockItems.accountingCategory })
    .from(stockItems)
    .where(sql`${stockItems.accountingCategory} is not null`);
  return rows.map((r) => r.value!).sort();
}
export const STORAGE_TYPES = ["DRY", "CHILLED", "FROZEN"] as const;

export async function getProductByCode(code: string) {
  const [item] = await db
    .select({
      id: stockItems.id,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      sourceType: stockItems.sourceType,
      categoryId: stockItems.categoryId,
      category: categories.name,
      subcategory: subcategories.name,
      storageType: stockItems.storageType,
      supplierId: stockItems.supplierId,
      supplier: suppliers.name,
      purchaseUnit: stockItems.purchaseUnit,
      issueUnit: stockItems.issueUnit,
      unitWeight: stockItems.unitWeight,
      yieldPct: stockItems.yieldPct,
      netRecoveredQty: stockItems.netRecoveredQty,
      purchaseRate: stockItems.purchaseRate,
      ratePerKgL: stockItems.ratePerKgL,
      ratePerGMl: stockItems.ratePerGMl,
      accountingCategory: stockItems.accountingCategory,
      secondaryName: stockItems.secondaryName,
      branches: stockItems.branches,
      minLevel: stockItems.minLevel,
      parLevel: stockItems.parLevel,
      preferredCountingUnit: stockItems.preferredCountingUnit,
      defaultPrepWastagePct: stockItems.defaultPrepWastagePct,
      itemTaxRate: stockItems.itemTaxRate,
      nonCogs: stockItems.nonCogs,
      isPackaging: stockItems.isPackaging,
    })
    .from(stockItems)
    .leftJoin(categories, eq(stockItems.categoryId, categories.id))
    .leftJoin(subcategories, eq(stockItems.subcategoryId, subcategories.id))
    .leftJoin(suppliers, eq(stockItems.supplierId, suppliers.id))
    .where(eq(stockItems.legacyCode, code))
    .limit(1);
  if (!item) return null;

  // Independent of each other — all keyed only off item.id — so fetched
  // concurrently instead of six sequential round trips.
  const [variants, history, usedInMain, usedInSub, stockByBranch, activeLots] = await Promise.all([
    db
      .select({
        id: productSupplierPackaging.id,
        purchaseUnit: productSupplierPackaging.purchaseUnit,
        unitWeight: productSupplierPackaging.unitWeight,
        rate: productSupplierPackaging.rate,
        supplierName: suppliers.name,
        supplierItemName: productSupplierPackaging.supplierItemName,
        supplierItemCode: productSupplierPackaging.supplierItemCode,
        isPriority: productSupplierPackaging.isPriority,
      })
      .from(productSupplierPackaging)
      .innerJoin(suppliers, eq(productSupplierPackaging.supplierId, suppliers.id))
      .where(eq(productSupplierPackaging.stockItemId, item.id)),
    db
      .select()
      .from(priceHistory)
      .where(eq(priceHistory.stockItemId, item.id))
      .orderBy(desc(priceHistory.changedAt))
      .limit(20),
    db
      .select({ code: mainRecipes.legacyCode, name: mainRecipes.name })
      .from(recipeIngredients)
      .innerJoin(mainRecipes, eq(recipeIngredients.mainRecipeId, mainRecipes.id))
      .where(eq(recipeIngredients.stockItemId, item.id)),
    db
      .select({ code: subRecipes.legacyCode, name: subRecipes.name })
      .from(recipeIngredients)
      .innerJoin(subRecipes, eq(recipeIngredients.subRecipeId, subRecipes.id))
      .where(eq(recipeIngredients.stockItemId, item.id)),
    // Summed across every sector at that branch — a stock item can now have
    // a separate stock_balances row per cost center (Kitchen/Bar/etc), but
    // the product detail page shows one total per branch.
    db
      .select({ branchId: stockBalances.branchId, branchName: branches.name, qtyOnHand: sql<number>`sum(${stockBalances.qtyOnHand})::float8` })
      .from(stockBalances)
      .innerJoin(branches, eq(stockBalances.branchId, branches.id))
      .where(eq(stockBalances.stockItemId, item.id))
      .groupBy(stockBalances.branchId, branches.name),
    // The FIFO lot stack — oldest first, since that's consumption order and
    // also "what recipe costing is currently pricing this item at" (see
    // recordStockMovement's syncItemRateFromOldestLot). Only lots still
    // holding stock; fully depleted ones are history, not "active."
    db
      .select({
        id: stockLots.id,
        branchName: branches.name,
        sourceType: stockLots.sourceType,
        lotNo: stockLots.lotNo,
        ratePerKgL: stockLots.ratePerKgL,
        qtyRemaining: stockLots.qtyRemaining,
        receivedAt: stockLots.receivedAt,
      })
      .from(stockLots)
      .innerJoin(branches, eq(stockLots.branchId, branches.id))
      .where(and(eq(stockLots.stockItemId, item.id), sql`${stockLots.qtyRemaining} != 0`))
      .orderBy(stockLots.receivedAt),
  ]);

  return {
    item,
    variants,
    history,
    stockByBranch,
    activeLots,
    usedIn: [
      ...usedInMain.map((r) => ({ type: "main" as const, ...r })),
      ...usedInSub.map((r) => ({ type: "sub" as const, ...r })),
    ],
  };
}

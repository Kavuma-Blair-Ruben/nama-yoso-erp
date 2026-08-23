import "server-only";
import { db } from "@/server/db";
import { categories, subcategories, storageAreas, stockItems, unitsOfMeasure, taxRates, systemSettings } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { categorizeUnit } from "@/lib/unitMath";

export async function listCategoriesWithSubcategories() {
  // Both the outer table and stock_items have their own "id" column, so the
  // correlated reference must be written as literal qualified SQL text —
  // interpolating ${categories.id} renders as a bare "id", which Postgres
  // silently resolves to the LOCAL stock_items.id instead of erroring (see
  // the note in suppliers.ts for the join-based version of this same trap).
  const cats = await db
    .select({
      id: categories.id,
      name: categories.name,
      sortOrder: categories.sortOrder,
      itemCount: sql<number>`(select count(*) from stock_items where stock_items.category_id = categories.id)::int`,
    })
    .from(categories)
    .orderBy(categories.sortOrder);

  const subs = await db
    .select({
      id: subcategories.id,
      name: subcategories.name,
      categoryId: subcategories.categoryId,
      itemCount: sql<number>`(select count(*) from stock_items where stock_items.subcategory_id = subcategories.id)::int`,
    })
    .from(subcategories)
    .orderBy(subcategories.name);

  return cats.map((c) => ({ ...c, subcategories: subs.filter((s) => s.categoryId === c.id) }));
}

export async function listStorageAreas() {
  return db.select().from(storageAreas).orderBy(storageAreas.name);
}

// "Products (by type)" count, matching index.html's unitsInUseCount — every
// unit of the same weight/volume/count type shares the same count, since
// products aren't pinned to one specific unit row, just a type.
export async function listUnitsOfMeasure() {
  const [units, items] = await Promise.all([
    db.select().from(unitsOfMeasure).orderBy(unitsOfMeasure.type, unitsOfMeasure.factor),
    db.select({ issueUnit: stockItems.issueUnit }).from(stockItems),
  ]);
  const countByType = { weight: 0, volume: 0, count: 0 };
  for (const it of items) countByType[categorizeUnit(it.issueUnit)]++;
  return units.map((u) => ({ ...u, inUseCount: countByType[u.type as "weight" | "volume" | "count"] ?? 0 }));
}

export async function listTaxRates() {
  return db.select().from(taxRates).orderBy(taxRates.pct);
}

export async function getSystemSettings() {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.id, "default"));
  return row ?? { id: "default", costingMethod: "latest" as const, blindCounts: false };
}

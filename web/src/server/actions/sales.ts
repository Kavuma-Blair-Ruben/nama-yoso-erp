"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { recipeSales, mainRecipes, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { bestTextMatch } from "@/lib/textMatch";

export type SalesImportResult = { error?: string; imported?: number; matched?: number; unmatched?: number };

export type SalesImportRow = { saleDate: string; itemLabel: string; qty: number; revenue: number };

const BATCH_SIZE = 500;

export async function importRecipeSales(rows: SalesImportRow[]): Promise<SalesImportResult> {
  const session = await assertPermission("reports", "edit");
  const validRows = rows.filter((r) => r.saleDate && r.itemLabel && r.qty > 0);
  if (validRows.length === 0) return { error: "No valid rows found — expecting Date, Item, Qty, Revenue columns." };

  const recipes = await db.select({ id: mainRecipes.id, name: mainRecipes.name }).from(mainRecipes);

  let matched = 0;
  const insertRows = validRows.map((r) => {
    const match = bestTextMatch(r.itemLabel, recipes, (x) => x.name);
    if (match) matched++;
    return { saleDate: r.saleDate, mainRecipeId: match?.id, itemLabel: r.itemLabel, qty: r.qty, revenue: r.revenue, importedBy: session.profile.id };
  });

  for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
    await db.insert(recipeSales).values(insertRows.slice(i, i + BATCH_SIZE));
  }

  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: "Imported",
    entity: "Recipe Sales",
    entityLabel: `${insertRows.length} row(s)`,
    detail: `${matched} matched to a recipe, ${insertRows.length - matched} unmatched`,
  });

  revalidatePath("/reports");
  return { imported: insertRows.length, matched, unmatched: insertRows.length - matched };
}

export async function clearRecipeSales(): Promise<{ error?: string }> {
  const session = await assertPermission("reports", "edit");
  await db.delete(recipeSales);
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Recipe Sales", entityLabel: "All rows", detail: "Cleared for re-import" });
  revalidatePath("/reports");
  return {};
}

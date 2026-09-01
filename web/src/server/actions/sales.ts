"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { recipeSales, mainRecipes, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { bestTextMatch } from "@/lib/textMatch";

export type SalesImportResult = { error?: string; imported?: number; matched?: number; unmatched?: number };

// sku, when present, is tried against a recipe's own legacy_code before
// falling back to fuzzy name matching — a POS export's own SKU column often
// lines up directly with ours, which is far more reliable than matching on
// the display name alone. grossRevenue/discountAmount/voidAmount/voidQty
// are all optional — only set when the source file actually breaks sales
// down that far (see schema.ts comment on recipe_sales).
export type SalesImportRow = {
  saleDate: string;
  itemLabel: string;
  sku?: string;
  qty: number;
  revenue: number;
  grossRevenue?: number;
  discountAmount?: number;
  voidAmount?: number;
  voidQty?: number;
};

const BATCH_SIZE = 500;

// branchId applies to the whole file — a "branch sales CSV" from Foodics
// covers one branch's day, not a mix, so it's one param here rather than a
// per-row field. Optional (undefined = unassigned) for a source that
// genuinely can't tell branches apart, but every future upload should pass
// one now that branch-tagged uploads are the normal workflow.
export async function importRecipeSales(rows: SalesImportRow[], branchId?: string): Promise<SalesImportResult> {
  const session = await assertPermission("reports", "edit");
  // A row is worth keeping if it represents any real activity — a sale
  // (qty > 0) or a void (voidQty > 0) — not just a positive net qty, so a
  // fully-voided line still gets recorded instead of silently vanishing.
  const validRows = rows.filter((r) => r.saleDate && r.itemLabel && (r.qty > 0 || (r.voidQty ?? 0) > 0));
  if (validRows.length === 0) return { error: "No valid rows found — expecting Date, Item, Qty, Revenue columns." };

  const recipes = await db.select({ id: mainRecipes.id, legacyCode: mainRecipes.legacyCode, name: mainRecipes.name }).from(mainRecipes);
  const byCode = new Map(recipes.map((r) => [r.legacyCode, r]));

  let matched = 0;
  const insertRows = validRows.map((r) => {
    const match = (r.sku && byCode.get(r.sku)) || bestTextMatch(r.itemLabel, recipes, (x) => x.name);
    if (match) matched++;
    return {
      saleDate: r.saleDate,
      branchId,
      mainRecipeId: match?.id,
      itemLabel: r.itemLabel,
      qty: r.qty,
      revenue: r.revenue,
      grossRevenue: r.grossRevenue,
      discountAmount: r.discountAmount,
      voidAmount: r.voidAmount,
      voidQty: r.voidQty,
      importedBy: session.profile.id,
    };
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

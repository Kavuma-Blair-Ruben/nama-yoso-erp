"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { recipeSales, mainRecipes, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { bestTextMatch } from "@/lib/textMatch";
import { loadCostingGraph, recipeCurrentCost, flattenRecipeToStockLines } from "@/server/costing/recipeCost";
import { recordStockMovement } from "@/server/db/stockLedger";
import { getDefaultCostCenterId } from "@/server/db/costCenterDefaults";

export type SalesImportResult = { error?: string; imported?: number; matched?: number; unmatched?: number; stockDeducted?: number; stockSkipped?: number };

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

  // Deducts ingredient stock for every matched, actually-sold (qty > 0, not
  // a pure void) line — the same flatten-recipe-to-stock-lines logic the
  // live Foodics webhook uses for a real order, just run once per CSV row
  // instead of per webhook event. Needs a branch (to pick a sector) and a
  // matched recipe (to know what ingredients to deduct); rows missing
  // either are counted in stockSkipped rather than silently ignored.
  let stockDeducted = 0;
  let stockSkipped = 0;
  let costCenterId: string | undefined;
  if (branchId) {
    try {
      costCenterId = await getDefaultCostCenterId(db, branchId, "Kitchen");
    } catch {
      costCenterId = undefined;
    }
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
      await tx.insert(recipeSales).values(insertRows.slice(i, i + BATCH_SIZE));
    }

    if (!branchId || !costCenterId) {
      stockSkipped = insertRows.filter((r) => r.qty > 0).length;
      return;
    }

    const graph = await loadCostingGraph();
    for (const r of insertRows) {
      if (r.qty <= 0) continue; // a void-only row has nothing to deduct
      const recipeNode = r.mainRecipeId ? graph.mainRecipesById.get(r.mainRecipeId) : undefined;
      if (!recipeNode) {
        stockSkipped++;
        continue;
      }
      const cur = recipeCurrentCost(graph, recipeNode);
      const stockLines = flattenRecipeToStockLines(cur.lines, r.qty);
      for (const sl of stockLines) {
        await recordStockMovement(tx, {
          stockItemId: sl.stockItemId,
          branchId,
          costCenterId,
          qtyDelta: -sl.qty,
          unitLabel: sl.unitLabel,
          movementType: "POS_SALE",
          refType: "recipe_sales_import",
          actorId: session.profile.id,
          notes: `CSV sales import — ${r.itemLabel} x${r.qty} on ${r.saleDate}`,
        });
      }
      stockDeducted++;
    }
  });

  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: "Imported",
    entity: "Recipe Sales",
    entityLabel: `${insertRows.length} row(s)`,
    detail: `${matched} matched to a recipe, ${insertRows.length - matched} unmatched — stock deducted for ${stockDeducted} row(s), skipped for ${stockSkipped}${!branchId ? " (no branch selected)" : ""}`,
  });

  revalidatePath("/reports");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { imported: insertRows.length, matched, unmatched: insertRows.length - matched, stockDeducted, stockSkipped };
}

export async function clearRecipeSales(): Promise<{ error?: string }> {
  const session = await assertPermission("reports", "edit");
  await db.delete(recipeSales);
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Recipe Sales", entityLabel: "All rows", detail: "Cleared for re-import" });
  revalidatePath("/reports");
  return {};
}

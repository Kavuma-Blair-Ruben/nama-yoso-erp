import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductionBuilder } from "@/components/production/ProductionBuilder";
import { getProductionBatchForEdit, listEligibleSubRecipesWithIngredients, listAllStockBalances } from "@/server/db/queries/production";
import { listBranches } from "@/server/db/queries/purchaseOrders";

export default async function EditProductionDraftPage({ params }: PageProps<"/production/[id]/edit">) {
  await requireSection("subrecipes", "edit");
  const { id } = await params;
  const [data, subRecipes, branches, stockBalances] = await Promise.all([
    getProductionBatchForEdit(id),
    listEligibleSubRecipesWithIngredients(),
    listBranches(),
    listAllStockBalances(),
  ]);
  if (!data) notFound();
  const { batch, ingredients } = data;

  return (
    <>
      <PageHeader title={`Edit Ticket — ${batch.batchNo}`} subtitle="Stock hasn't been updated yet — safe to adjust." />
      <ProductionBuilder
        subRecipes={subRecipes}
        branches={branches}
        stockBalances={stockBalances}
        existingBatchId={batch.id}
        initialSubRecipeId={batch.subRecipeId}
        initialBranchId={batch.branchId}
        initialScaleMultiplier={batch.scaleMultiplier}
        initialYieldQty={batch.yieldQty}
        initialYieldUnit={batch.yieldUnit ?? undefined}
        initialProducedDate={batch.producedDate}
        initialExpiryDate={batch.expiryDate ?? undefined}
        initialNotes={batch.notes ?? undefined}
        initialIngredients={ingredients.map((i) => ({
          stockItemId: i.stockItemId,
          name: `${i.legacyCode} — ${i.name}`,
          qty: String(i.qty),
          unitLabel: i.unitLabel ?? "",
          rate: String(i.rateAtProduction ?? 0),
        }))}
      />
    </>
  );
}

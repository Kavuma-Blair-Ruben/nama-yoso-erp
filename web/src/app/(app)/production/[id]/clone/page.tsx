import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductionBuilder } from "@/components/production/ProductionBuilder";
import { getProductionBatchForClone, listEligibleSubRecipesWithIngredients, listAllStockBalances } from "@/server/db/queries/production";
import { listBranches } from "@/server/db/queries/purchaseOrders";

export default async function CloneProductionPage({ params }: PageProps<"/production/[id]/clone">) {
  await requireSection("subrecipes", "edit");
  const { id } = await params;
  const [batch, subRecipes, branches, stockBalances] = await Promise.all([
    getProductionBatchForClone(id),
    listEligibleSubRecipesWithIngredients(),
    listBranches(),
    listAllStockBalances(),
  ]);
  if (!batch) notFound();

  return (
    <>
      <PageHeader title={`Repeat — ${batch.batchNo}`} subtitle="Same sub-recipe and scale, dated today — ingredients recompute from current recipe costs." />
      <ProductionBuilder
        subRecipes={subRecipes}
        branches={branches}
        stockBalances={stockBalances}
        initialSubRecipeId={batch.subRecipeId}
        initialBranchId={batch.branchId}
        initialScaleMultiplier={batch.scaleMultiplier}
        initialNotes={batch.notes ?? undefined}
        initialStaffName={batch.staffName ?? undefined}
      />
    </>
  );
}

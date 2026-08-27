import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { allowedBranchCodes } from "@/server/auth/branchAccess";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductionBuilder } from "@/components/production/ProductionBuilder";
import { getProductionBatchForClone, listEligibleSubRecipesWithIngredients, listAllStockBalances } from "@/server/db/queries/production";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";

export default async function CloneProductionPage({ params }: PageProps<"/production/[id]/clone">) {
  const session = await requireSection("subrecipes", "edit");
  const { id } = await params;
  const [batch, subRecipes, branches, costCenters, stockBalances] = await Promise.all([
    getProductionBatchForClone(id),
    listEligibleSubRecipesWithIngredients(),
    listBranches(allowedBranchCodes(session)),
    listAllActiveCostCenters(),
    listAllStockBalances(),
  ]);
  if (!batch) notFound();

  return (
    <>
      <PageHeader title={`Repeat — ${batch.batchNo}`} subtitle="Same sub-recipe and scale, dated today — ingredients recompute from current recipe costs." backHref="/production" backLabel="Production" />
      <ProductionBuilder
        subRecipes={subRecipes}
        branches={branches}
        costCenters={costCenters}
        stockBalances={stockBalances}
        initialSubRecipeId={batch.subRecipeId}
        initialBranchId={batch.branchId}
        initialCostCenterId={batch.costCenterId ?? undefined}
        initialScaleMultiplier={batch.scaleMultiplier}
        initialNotes={batch.notes ?? undefined}
        initialStaffName={batch.staffName ?? undefined}
      />
    </>
  );
}

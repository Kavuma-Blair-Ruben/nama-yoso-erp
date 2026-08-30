import { requireSection } from "@/server/auth/permissions";
import { allowedBranchCodes } from "@/server/auth/branchAccess";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductionBuilder } from "@/components/production/ProductionBuilder";
import { listEligibleSubRecipesWithIngredients, listAllStockBalances } from "@/server/db/queries/production";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { withTimeout } from "@/lib/withTimeout";

export default async function NewProductionPage({ searchParams }: PageProps<"/production/new">) {
  const session = await requireSection("subrecipes", "edit");
  const sp = await searchParams;
  const [subRecipes, branches, costCenters, stockBalances] = await withTimeout(Promise.all([
    listEligibleSubRecipesWithIngredients(),
    listBranches(allowedBranchCodes(session)),
    listAllActiveCostCenters(),
    listAllStockBalances(),
  ]), 20000, "This is taking longer than expected — please try again in a moment.");

  // Prefilled when arriving from Auto Production's "Open Batch" link —
  // subRecipeId/scaleMultiplier are the two fields that actually matter,
  // ProductionBuilder derives yieldQty/ingredients from those reactively.
  const initialSubRecipeId = typeof sp.subRecipeId === "string" ? sp.subRecipeId : undefined;
  const initialBranchId = typeof sp.branchId === "string" ? sp.branchId : undefined;
  const initialCostCenterId = typeof sp.costCenterId === "string" ? sp.costCenterId : undefined;
  const initialScaleMultiplier = typeof sp.scaleMultiplier === "string" && Number(sp.scaleMultiplier) > 0 ? Number(sp.scaleMultiplier) : undefined;

  return (
    <>
      <PageHeader title="New Production Ticket" subtitle="Opens a production run for a stockable sub-recipe — stock only moves once you close it." backHref="/production" backLabel="Production" />
      {subRecipes.length === 0 ? (
        <div className="callout">
          No stockable sub-recipes are available to produce yet. Mark a sub-recipe as Stockable in Recipe Costing first.
        </div>
      ) : (
        <ProductionBuilder
          subRecipes={subRecipes}
          branches={branches}
          costCenters={costCenters}
          stockBalances={stockBalances}
          initialSubRecipeId={initialSubRecipeId}
          initialBranchId={initialBranchId}
          initialCostCenterId={initialCostCenterId}
          initialScaleMultiplier={initialScaleMultiplier}
        />
      )}
    </>
  );
}

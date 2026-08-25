import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductionBuilder } from "@/components/production/ProductionBuilder";
import { listEligibleSubRecipesWithIngredients, listAllStockBalances } from "@/server/db/queries/production";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";

export default async function NewProductionPage() {
  await requireSection("subrecipes", "edit");
  const [subRecipes, branches, costCenters, stockBalances] = await Promise.all([
    listEligibleSubRecipesWithIngredients(),
    listBranches(),
    listAllActiveCostCenters(),
    listAllStockBalances(),
  ]);

  return (
    <>
      <PageHeader title="New Production Ticket" subtitle="Opens a production run for a stockable sub-recipe — stock only moves once you close it." backHref="/production" backLabel="Production" />
      {subRecipes.length === 0 ? (
        <div className="callout">
          No stockable sub-recipes are available to produce yet. Mark a sub-recipe as Stockable in Recipe Costing first.
        </div>
      ) : (
        <ProductionBuilder subRecipes={subRecipes} branches={branches} costCenters={costCenters} stockBalances={stockBalances} />
      )}
    </>
  );
}

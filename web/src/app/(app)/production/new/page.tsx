import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductionBuilder } from "@/components/production/ProductionBuilder";
import { listEligibleSubRecipesWithIngredients, listAllStockBalances } from "@/server/db/queries/production";
import { listBranches } from "@/server/db/queries/purchaseOrders";

export default async function NewProductionPage() {
  await requireSection("subrecipes", "edit");
  const [subRecipes, branches, stockBalances] = await Promise.all([
    listEligibleSubRecipesWithIngredients(),
    listBranches(),
    listAllStockBalances(),
  ]);

  return (
    <>
      <PageHeader title="New Production Batch" subtitle="Produce a stockable sub-recipe — consumes ingredient stock, credits the finished item's stock." />
      {subRecipes.length === 0 ? (
        <div className="callout">
          No stockable sub-recipes are available to produce yet. Mark a sub-recipe as Stockable in Recipe Costing first.
        </div>
      ) : (
        <ProductionBuilder subRecipes={subRecipes} branches={branches} stockBalances={stockBalances} />
      )}
    </>
  );
}

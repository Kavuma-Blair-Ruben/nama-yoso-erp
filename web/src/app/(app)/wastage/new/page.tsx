import { requireSection } from "@/server/auth/permissions";
import { allowedBranchCodes } from "@/server/auth/branchAccess";
import { PageHeader } from "@/components/ui/PageHeader";
import { WastageBuilder } from "@/components/wastage/WastageBuilder";
import { listWastageReasons } from "@/server/db/queries/wastage";
import { listIngredientPickerItems, listMainRecipesForPicker } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";

export default async function NewWastagePage() {
  const session = await requireSection("wastage", "edit");
  const [items, mainRecipes, costCenters, branches, reasons] = await Promise.all([
    listIngredientPickerItems(),
    listMainRecipesForPicker(),
    listAllActiveCostCenters(),
    listBranches(allowedBranchCodes(session)),
    listWastageReasons(),
  ]);

  return (
    <>
      <PageHeader title="Log Wastage" subtitle="Open one log for the day/section, then add every item that was wasted." backHref="/wastage" backLabel="Wastage Tracking" />
      <WastageBuilder items={items} mainRecipes={mainRecipes} costCenters={costCenters} branches={branches} reasons={reasons.map((r) => r.name)} />
    </>
  );
}

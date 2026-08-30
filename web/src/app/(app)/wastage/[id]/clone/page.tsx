import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { allowedBranchCodes } from "@/server/auth/branchAccess";
import { PageHeader } from "@/components/ui/PageHeader";
import { WastageBuilder } from "@/components/wastage/WastageBuilder";
import { getWastageEventForClone, listWastageReasons } from "@/server/db/queries/wastage";
import { listIngredientPickerItems, listMainRecipesForPicker } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { withTimeout } from "@/lib/withTimeout";

export default async function CloneWastagePage({ params }: PageProps<"/wastage/[id]/clone">) {
  const session = await requireSection("wastage", "edit");
  const { id } = await params;
  const [data, items, mainRecipes, costCenters, branches, reasons] = await withTimeout(Promise.all([
    getWastageEventForClone(id),
    listIngredientPickerItems(),
    listMainRecipesForPicker(),
    listAllActiveCostCenters(),
    listBranches(allowedBranchCodes(session)),
    listWastageReasons(),
  ]), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { event, lines } = data;

  return (
    <>
      <PageHeader title={`Repeat — ${event.wastageNo}`} subtitle="Same items and reasons, dated today — review and adjust before logging." backHref="/wastage" backLabel="Wastage Tracking" />
      <WastageBuilder
        items={items}
        mainRecipes={mainRecipes}
        costCenters={costCenters}
        branches={branches}
        reasons={reasons.map((r) => r.name)}
        initialCostCenterId={event.costCenterId ?? undefined}
        initialBranchId={event.branchId}
        initialStaffName={event.staffName ?? undefined}
        initialLines={lines.map((l) => ({
          stockItemId: l.stockItemId,
          unitLabel: l.unitLabel ?? "",
          qty: String(l.qty),
          reason: l.reason,
          notes: l.notes ?? "",
          rate: l.rateAtWaste ?? 0,
          photoUrl: undefined,
        }))}
      />
    </>
  );
}

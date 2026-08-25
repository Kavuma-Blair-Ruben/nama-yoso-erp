import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { WastageBuilder } from "@/components/wastage/WastageBuilder";
import { getWastageEventForEdit, listWastageReasons } from "@/server/db/queries/wastage";
import { listIngredientPickerItems, listMainRecipesForPicker } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";

export default async function EditWastageDraftPage({ params }: PageProps<"/wastage/[id]/edit">) {
  await requireSection("wastage", "edit");
  const { id } = await params;
  const [data, items, mainRecipes, costCenters, branches, reasons] = await Promise.all([
    getWastageEventForEdit(id),
    listIngredientPickerItems(),
    listMainRecipesForPicker(),
    listAllActiveCostCenters(),
    listBranches(),
    listWastageReasons(),
  ]);
  if (!data) notFound();
  const { event, lines } = data;

  return (
    <>
      <PageHeader title={`Edit Draft — ${event.wastageNo}`} subtitle="Stock hasn't been updated yet — safe to adjust." backHref={`/wastage/${id}`} />
      <WastageBuilder
        items={items}
        mainRecipes={mainRecipes}
        costCenters={costCenters}
        branches={branches}
        reasons={reasons.map((r) => r.name)}
        existingEventId={event.id}
        initialEventDate={event.eventDate}
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
          photoUrl: l.photoUrl ?? undefined,
        }))}
      />
    </>
  );
}

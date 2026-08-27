import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { allowedBranchCodes } from "@/server/auth/branchAccess";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransferBuilder } from "@/components/transfers/TransferBuilder";
import { getTransferForEdit } from "@/server/db/queries/transfers";
import { listIngredientPickerItems } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";

export default async function EditTransferDraftPage({ params }: PageProps<"/transfers/[id]/edit">) {
  const session = await requireSection("transfers", "edit");
  const { id } = await params;
  const [data, items, branches, costCenters] = await Promise.all([getTransferForEdit(id), listIngredientPickerItems(), listBranches(allowedBranchCodes(session)), listAllActiveCostCenters()]);
  if (!data) notFound();
  const { transfer, lines } = data;

  return (
    <>
      <PageHeader title={`Edit Draft — ${transfer.transferNo}`} subtitle="Stock hasn't been updated yet — safe to adjust." backHref={`/transfers/${id}`} />
      <TransferBuilder
        items={items}
        branches={branches}
        costCenters={costCenters}
        existingTransferId={transfer.id}
        initialFromBranchId={transfer.fromBranchId}
        initialToBranchId={transfer.toBranchId}
        initialFromCostCenterId={transfer.fromCostCenterId ?? undefined}
        initialToCostCenterId={transfer.toCostCenterId ?? undefined}
        initialTransferDate={transfer.transferDate}
        initialStaffName={transfer.staffName ?? undefined}
        initialNotes={transfer.notes ?? undefined}
        initialLines={lines.map((l) => ({
          stockItemId: l.stockItemId,
          unitLabel: l.unitLabel ?? "",
          qty: String(l.qty),
          rate: String(l.rateAtTransfer ?? 0),
        }))}
      />
    </>
  );
}

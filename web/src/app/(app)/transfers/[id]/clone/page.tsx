import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransferBuilder } from "@/components/transfers/TransferBuilder";
import { getTransferForClone } from "@/server/db/queries/transfers";
import { listIngredientPickerItems } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";

export default async function CloneTransferPage({ params }: PageProps<"/transfers/[id]/clone">) {
  await requireSection("transfers", "edit");
  const { id } = await params;
  const [data, items, branches, costCenters] = await Promise.all([getTransferForClone(id), listIngredientPickerItems(), listBranches(), listAllActiveCostCenters()]);
  if (!data) notFound();
  const { transfer, lines } = data;

  return (
    <>
      <PageHeader title={`Repeat — ${transfer.transferNo}`} subtitle="Same route and items, dated today — review and adjust before transferring." backHref="/transfers" backLabel="Stock Transfers" />
      <TransferBuilder
        items={items}
        branches={branches}
        costCenters={costCenters}
        initialFromBranchId={transfer.fromBranchId}
        initialToBranchId={transfer.toBranchId}
        initialFromCostCenterId={transfer.fromCostCenterId ?? undefined}
        initialToCostCenterId={transfer.toCostCenterId ?? undefined}
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

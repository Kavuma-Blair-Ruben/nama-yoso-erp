import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransferBuilder } from "@/components/transfers/TransferBuilder";
import { getTransferForEdit } from "@/server/db/queries/transfers";
import { listIngredientPickerItems } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";

export default async function EditTransferDraftPage({ params }: PageProps<"/transfers/[id]/edit">) {
  await requireSection("transfers", "edit");
  const { id } = await params;
  const [data, items, branches] = await Promise.all([getTransferForEdit(id), listIngredientPickerItems(), listBranches()]);
  if (!data) notFound();
  const { transfer, lines } = data;

  return (
    <>
      <PageHeader title={`Edit Draft — ${transfer.transferNo}`} subtitle="Stock hasn't been updated yet — safe to adjust." />
      <TransferBuilder
        items={items}
        branches={branches}
        existingTransferId={transfer.id}
        initialFromBranchId={transfer.fromBranchId}
        initialToBranchId={transfer.toBranchId}
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

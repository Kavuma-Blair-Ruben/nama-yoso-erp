import { requireSection } from "@/server/auth/permissions";
import { allowedBranchCodes } from "@/server/auth/branchAccess";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransferBuilder } from "@/components/transfers/TransferBuilder";
import { listIngredientPickerItems } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";

export default async function NewTransferPage() {
  const session = await requireSection("transfers", "edit");
  const [items, branches, costCenters] = await Promise.all([listIngredientPickerItems(), listBranches(allowedBranchCodes(session)), listAllActiveCostCenters()]);

  return (
    <>
      <PageHeader title="New Stock Transfer" subtitle="Move stock between branches — updates both sides of the ledger." backHref="/transfers" backLabel="Stock Transfers" />
      <TransferBuilder items={items} branches={branches} costCenters={costCenters} />
    </>
  );
}

import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransferBuilder } from "@/components/transfers/TransferBuilder";
import { listIngredientPickerItems } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";

export default async function NewTransferPage() {
  await requireSection("transfers", "edit");
  const [items, branches] = await Promise.all([listIngredientPickerItems(), listBranches()]);

  return (
    <>
      <PageHeader title="New Stock Transfer" subtitle="Move stock between branches — updates both sides of the ledger." />
      <TransferBuilder items={items} branches={branches} />
    </>
  );
}

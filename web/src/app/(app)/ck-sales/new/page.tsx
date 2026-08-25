import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { DeliveryNoteBuilder } from "@/components/ckSales/DeliveryNoteBuilder";
import { getCustomersForPicker } from "@/server/db/queries/ckSales";
import { listIngredientPickerItems } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";

export default async function NewCkSalePage() {
  await requireSection("ckwarehouse", "edit");
  const [items, customers, branches] = await Promise.all([listIngredientPickerItems(), getCustomersForPicker(), listBranches()]);

  return (
    <>
      <PageHeader title="New Delivery Note / Invoice" subtitle="Sell to a branch or external customer — deducts stock immediately." backHref="/ck-sales" backLabel="CK Sales" />
      {customers.length === 0 ? (
        <div className="callout">No customers yet — add one in Customers first.</div>
      ) : (
        <DeliveryNoteBuilder items={items} customers={customers} branches={branches} />
      )}
    </>
  );
}

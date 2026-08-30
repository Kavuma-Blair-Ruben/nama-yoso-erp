import { requireSection } from "@/server/auth/permissions";
import { allowedBranchCodes } from "@/server/auth/branchAccess";
import { PageHeader } from "@/components/ui/PageHeader";
import { POBuilder } from "@/components/purchase-orders/POBuilder";
import { listPurchasableProductsForPicker, listBranches, listAllSuppliers } from "@/server/db/queries/purchaseOrders";
import { listAllStockBalances } from "@/server/db/queries/production";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { withTimeout } from "@/lib/withTimeout";

export default async function NewPurchaseOrderPage() {
  const session = await requireSection("orders", "edit");
  const [products, branches, costCenters, suppliers, stockBalances] = await withTimeout(Promise.all([
    listPurchasableProductsForPicker(),
    listBranches(allowedBranchCodes(session)),
    listAllActiveCostCenters(),
    listAllSuppliers(),
    listAllStockBalances(),
  ]), 20000, "This is taking longer than expected — please try again in a moment.");
  return (
    <>
      <PageHeader title="New Purchase Order" subtitle="Pick items from any category, from any supplier — grouped by designated supplier automatically." backHref="/purchase-orders" backLabel="Purchase Orders" />
      <POBuilder products={products} branches={branches} costCenters={costCenters} suppliers={suppliers} stockBalances={stockBalances} />
    </>
  );
}

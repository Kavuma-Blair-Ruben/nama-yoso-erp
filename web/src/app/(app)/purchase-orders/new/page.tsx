import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { POBuilder } from "@/components/purchase-orders/POBuilder";
import { listPurchasableProductsForPicker, listBranches, listAllSuppliers } from "@/server/db/queries/purchaseOrders";
import { listAllStockBalances } from "@/server/db/queries/production";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";

export default async function NewPurchaseOrderPage() {
  await requireSection("orders", "edit");
  const [products, branches, costCenters, suppliers, stockBalances] = await Promise.all([
    listPurchasableProductsForPicker(),
    listBranches(),
    listAllActiveCostCenters(),
    listAllSuppliers(),
    listAllStockBalances(),
  ]);
  return (
    <>
      <PageHeader title="New Purchase Order" subtitle="Pick items from any category, from any supplier — grouped by designated supplier automatically." backHref="/purchase-orders" backLabel="Purchase Orders" />
      <POBuilder products={products} branches={branches} costCenters={costCenters} suppliers={suppliers} stockBalances={stockBalances} />
    </>
  );
}

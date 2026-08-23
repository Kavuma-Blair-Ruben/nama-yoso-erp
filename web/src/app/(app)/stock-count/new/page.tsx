import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { StockCountBuilder } from "@/components/stockCount/StockCountBuilder";
import { listIngredientPickerItems } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllStockBalances } from "@/server/db/queries/production";
import { listCostCenters } from "@/server/db/queries/wastage";
import { listStockCountTemplatesWithItems } from "@/server/db/queries/stockCount";
import { getSystemSettings } from "@/server/db/queries/settings";

export default async function NewStockCountPage() {
  await requireSection("stockcount", "edit");
  const [items, branches, stockBalances, costCenters, templates, settings] = await Promise.all([
    listIngredientPickerItems(),
    listBranches(),
    listAllStockBalances(),
    listCostCenters(),
    listStockCountTemplatesWithItems(),
    getSystemSettings(),
  ]);

  return (
    <>
      <PageHeader title="New Stock Count" subtitle="Count what's physically on the shelf, compare to system stock." />
      <StockCountBuilder
        items={items}
        branches={branches}
        costCenters={costCenters.map((c) => c.name)}
        stockBalances={stockBalances}
        templates={templates}
        blindCounts={settings.blindCounts}
      />
    </>
  );
}

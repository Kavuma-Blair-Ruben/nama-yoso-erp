import { requireSection } from "@/server/auth/permissions";
import { allowedBranchCodes } from "@/server/auth/branchAccess";
import { PageHeader } from "@/components/ui/PageHeader";
import { StockCountBuilder } from "@/components/stockCount/StockCountBuilder";
import { listIngredientPickerItems } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listStockBalancesBySector } from "@/server/db/queries/production";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { listStockCountTemplatesWithItems } from "@/server/db/queries/stockCount";
import { getSystemSettings } from "@/server/db/queries/settings";
import { withTimeout } from "@/lib/withTimeout";

export default async function NewStockCountPage() {
  const session = await requireSection("stockcount", "edit");
  const [items, branches, stockBalances, costCenters, templates, settings] = await withTimeout(Promise.all([
    listIngredientPickerItems(),
    listBranches(allowedBranchCodes(session)),
    listStockBalancesBySector(),
    listAllActiveCostCenters(),
    listStockCountTemplatesWithItems(),
    getSystemSettings(),
  ]), 20000, "This is taking longer than expected — please try again in a moment.");

  return (
    <>
      <PageHeader title="New Stock Count" subtitle="Count what's physically on the shelf, compare to system stock." backHref="/stock-count" backLabel="Stock Count" />
      <StockCountBuilder
        items={items}
        branches={branches}
        costCenters={costCenters}
        stockBalances={stockBalances}
        templates={templates}
        blindCounts={settings.blindCounts}
      />
    </>
  );
}

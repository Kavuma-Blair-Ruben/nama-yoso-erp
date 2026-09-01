import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { allowedBranchCodes } from "@/server/auth/branchAccess";
import { PageHeader } from "@/components/ui/PageHeader";
import { StockCountBuilder } from "@/components/stockCount/StockCountBuilder";
import { getStockCountForEdit, listStockCountTemplatesWithItems } from "@/server/db/queries/stockCount";
import { listIngredientPickerItems } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listStockBalancesBySector } from "@/server/db/queries/production";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { getSystemSettings } from "@/server/db/queries/settings";
import { withTimeout } from "@/lib/withTimeout";

export default async function EditStockCountDraftPage({ params }: PageProps<"/stock-count/[id]/edit">) {
  const session = await requireSection("stockcount", "edit");
  const { id } = await params;
  const [data, items, branches, stockBalances, costCenters, templates, settings] = await withTimeout(Promise.all([
    getStockCountForEdit(id),
    listIngredientPickerItems(),
    listBranches(allowedBranchCodes(session)),
    listStockBalancesBySector(),
    listAllActiveCostCenters(),
    listStockCountTemplatesWithItems(),
    getSystemSettings(),
  ]), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { stockCount, lines } = data;

  return (
    <>
      <PageHeader title={`Edit Draft — ${stockCount.countNo}`} subtitle="Stock hasn't been adjusted yet — safe to adjust." backHref={`/stock-count/${id}`} />
      <StockCountBuilder
        items={items}
        branches={branches}
        costCenters={costCenters}
        stockBalances={stockBalances}
        templates={templates}
        blindCounts={settings.blindCounts}
        existingCountId={stockCount.id}
        initialBranchId={stockCount.branchId}
        initialCostCenterId={stockCount.costCenterId ?? undefined}
        initialCountDate={stockCount.countDate}
        initialLines={lines.map((l) => {
          const p = items.find((x) => x.id === l.stockItemId);
          return {
            stockItemId: l.stockItemId,
            legacyCode: l.legacyCode,
            name: `${l.legacyCode} — ${l.name}`,
            unitLabel: l.unitLabel ?? "",
            issueUnit: p?.issueUnit ?? null,
            unitWeight: p?.unitWeight ?? null,
            purchaseUnit: p?.purchaseUnit ?? null,
            systemQty: l.systemQty,
            countedQty: l.countedQty != null ? String(l.countedQty) : "",
            storageQty: l.storageQty != null ? String(l.storageQty) : "",
            ingredientQty: l.ingredientQty != null ? String(l.ingredientQty) : "",
            rate: l.rateAtCount ?? 0,
            countedByName: l.countedByName,
          };
        })}
      />
    </>
  );
}

import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { StockCountBuilder } from "@/components/stockCount/StockCountBuilder";
import { getStockCountForEdit, listStockCountTemplatesWithItems } from "@/server/db/queries/stockCount";
import { listIngredientPickerItems } from "@/server/db/queries/recipes";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listStockBalancesBySector } from "@/server/db/queries/production";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { getSystemSettings } from "@/server/db/queries/settings";

export default async function EditStockCountDraftPage({ params }: PageProps<"/stock-count/[id]/edit">) {
  await requireSection("stockcount", "edit");
  const { id } = await params;
  const [data, items, branches, stockBalances, costCenters, templates, settings] = await Promise.all([
    getStockCountForEdit(id),
    listIngredientPickerItems(),
    listBranches(),
    listStockBalancesBySector(),
    listAllActiveCostCenters(),
    listStockCountTemplatesWithItems(),
    getSystemSettings(),
  ]);
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
        initialLines={lines.map((l) => ({
          stockItemId: l.stockItemId,
          legacyCode: l.legacyCode,
          name: `${l.legacyCode} — ${l.name}`,
          unitLabel: l.unitLabel ?? "",
          systemQty: l.systemQty,
          countedQty: l.countedQty != null ? String(l.countedQty) : "",
          rate: l.rateAtCount ?? 0,
        }))}
      />
    </>
  );
}

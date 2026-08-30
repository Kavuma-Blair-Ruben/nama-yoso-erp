import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPredictiveOrderSuggestions } from "@/server/db/queries/forecasting";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { PredictiveOrdersClient } from "@/components/purchaseOrders/PredictiveOrdersClient";
import { withTimeout } from "@/lib/withTimeout";

export default async function PredictiveOrdersPage({ searchParams }: PageProps<"/predictive-orders">) {
  await requireSection("orders", "view");
  const sp = await searchParams;
  const branches = await withTimeout(listBranches(), 20000, "This is taking longer than expected — please try again in a moment.");
  const branchId = typeof sp.branch === "string" && branches.some((b) => b.id === sp.branch) ? sp.branch : (branches[0]?.id ?? "");
  const targetCoverDays = typeof sp.cover === "string" && Number(sp.cover) > 0 ? Number(sp.cover) : 14;

  const [{ rows, skippedNoDemandCount }, costCenters] = await withTimeout(
    Promise.all([
      branchId ? getPredictiveOrderSuggestions(branchId, { targetCoverDays }) : Promise.resolve({ rows: [], skippedNoDemandCount: 0 }),
      listAllActiveCostCenters(),
    ]),
    20000,
    "This is taking longer than expected — please try again in a moment."
  );

  return (
    <>
      <PageHeader
        title="Predictive Orders"
        subtitle="Suggested reorder quantities from real stock consumption, current stock, and supplier lead times — not a trained model, straightforward data-driven math."
      />
      <PredictiveOrdersClient
        rows={rows}
        skippedNoDemandCount={skippedNoDemandCount}
        branches={branches}
        costCenters={costCenters}
        selectedBranchId={branchId}
        targetCoverDays={targetCoverDays}
      />
    </>
  );
}

import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProductionBatchDetail } from "@/server/db/queries/production";
import { ProductionLabelSheet } from "@/components/production/ProductionLabelSheet";
import { withTimeout } from "@/lib/withTimeout";

export default async function ProductionLabelsPage({ params }: PageProps<"/production/[id]/labels">) {
  await requireSection("subrecipes", "view");
  const { id } = await params;
  const data = await withTimeout(getProductionBatchDetail(id), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { batch } = data;

  return (
    <>
      <PageHeader title={`Receipt of Production — ${batch.batchNo}`} subtitle={`${batch.subRecipeCode} — ${batch.subRecipeName}`} backHref={`/production/${id}`} />
      <ProductionLabelSheet
        batch={{
          id: batch.id,
          batchNo: batch.batchNo,
          lotNo: batch.lotNo,
          name: batch.subRecipeName,
          legacyCode: batch.subRecipeCode,
          scaleMultiplier: batch.scaleMultiplier,
          yieldQty: batch.yieldQty,
          yieldUnit: batch.yieldUnit,
          producedDate: batch.producedDate,
          expiryDate: batch.expiryDate,
          storageInstructions: batch.storageInstructions,
          branchName: batch.branchName,
          staffName: batch.staffName,
        }}
      />
    </>
  );
}

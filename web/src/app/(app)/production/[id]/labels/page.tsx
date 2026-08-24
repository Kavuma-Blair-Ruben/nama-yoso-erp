import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProductionBatchDetail } from "@/server/db/queries/production";
import { ProductionLabelSheet } from "@/components/production/ProductionLabelSheet";

export default async function ProductionLabelsPage({ params }: PageProps<"/production/[id]/labels">) {
  await requireSection("subrecipes", "view");
  const { id } = await params;
  const data = await getProductionBatchDetail(id);
  if (!data) notFound();
  const { batch } = data;

  return (
    <>
      <PageHeader title={`Receipt of Production — ${batch.batchNo}`} subtitle={`${batch.subRecipeCode} — ${batch.subRecipeName}`} />
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

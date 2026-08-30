import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLotDetail } from "@/server/db/queries/grn";
import { LotDetailCard } from "@/components/scanner/LotDetailCard";
import { withTimeout } from "@/lib/withTimeout";

export default async function LotDetailPage({ params }: PageProps<"/lots/[lotNo]">) {
  await requireSection("grn", "view");
  const { lotNo } = await params;
  const lot = await withTimeout(getLotDetail(decodeURIComponent(lotNo)), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!lot) notFound();

  return (
    <>
      <PageHeader title={lot.name} subtitle={`${lot.legacyCode} · Batch/Lot Traceability`} />
      <LotDetailCard lot={lot} />
    </>
  );
}

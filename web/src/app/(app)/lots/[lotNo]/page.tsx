import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLotDetail } from "@/server/db/queries/grn";
import { LotDetailCard } from "@/components/scanner/LotDetailCard";

export default async function LotDetailPage({ params }: PageProps<"/lots/[lotNo]">) {
  await requireSection("grn", "view");
  const { lotNo } = await params;
  const lot = await getLotDetail(decodeURIComponent(lotNo));
  if (!lot) notFound();

  return (
    <>
      <PageHeader title={lot.name} subtitle={`${lot.legacyCode} · Batch/Lot Traceability`} />
      <LotDetailCard lot={lot} />
    </>
  );
}

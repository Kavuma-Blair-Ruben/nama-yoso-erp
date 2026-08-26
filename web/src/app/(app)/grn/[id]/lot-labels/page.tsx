import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGrnLinesForLabels } from "@/server/db/queries/grn";
import { LotLabelSheet } from "@/components/grn/LotLabelSheet";

export default async function GrnLotLabelsPage({ params }: PageProps<"/grn/[id]/lot-labels">) {
  await requireSection("grn", "view");
  const { id } = await params;
  const data = await getGrnLinesForLabels(id);
  if (!data) notFound();
  const { grn, lines } = data;

  return (
    <>
      <PageHeader title={`Batch/Lot Labels — ${grn.grnNumber}`} subtitle={`${grn.supplier} · ${grn.receivedDate} · ${lines.length} line(s)`} backHref={`/grn/${id}`} />
      <LotLabelSheet lines={lines} grnId={id} />
    </>
  );
}

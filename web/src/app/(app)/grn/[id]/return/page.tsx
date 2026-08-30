import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGrnDetail, getGrnLinesForReturn } from "@/server/db/queries/grn";
import { SupplierReturnBuilder } from "@/components/grn/SupplierReturnBuilder";
import { withTimeout } from "@/lib/withTimeout";

export default async function NewSupplierReturnPage({ params }: PageProps<"/grn/[id]/return">) {
  await requireSection("grn", "edit");
  const { id } = await params;
  const [data, lines] = await withTimeout(Promise.all([getGrnDetail(id), getGrnLinesForReturn(id)]), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { grn } = data;
  if (grn.status !== "POSTED") notFound();

  return (
    <>
      <PageHeader title={`Return to Supplier — ${grn.grnNumber}`} subtitle="Select which lines are being physically returned, and how much." backHref={`/grn/${id}`} />
      <SupplierReturnBuilder
        grnId={grn.id}
        grnNumber={grn.grnNumber}
        lines={lines.map((l) => ({
          grnLineId: l.id,
          name: l.name,
          legacyCode: l.legacyCode,
          unitLabel: l.unitLabel,
          receivedQty: l.receivedQty,
          rate: l.rate,
          remaining: l.remaining,
        }))}
      />
    </>
  );
}

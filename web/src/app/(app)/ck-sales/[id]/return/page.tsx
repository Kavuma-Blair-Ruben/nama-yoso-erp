import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDeliveryNoteDetail } from "@/server/db/queries/ckSales";
import { ReturnBuilder } from "@/components/ckSales/ReturnBuilder";
import { withTimeout } from "@/lib/withTimeout";

export default async function NewReturnPage({ params }: PageProps<"/ck-sales/[id]/return">) {
  await requireSection("ckwarehouse", "edit");
  const { id } = await params;
  const data = await withTimeout(getDeliveryNoteDetail(id), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { dn, lines } = data;

  return (
    <>
      <PageHeader title={`Customer Return — ${dn.number}`} subtitle="Select which lines the customer is returning or rejecting." backHref={`/ck-sales/${id}`} />
      <ReturnBuilder
        deliveryNoteId={dn.id}
        dnNumber={dn.number}
        lines={lines.map((l) => ({ id: l.id, name: l.name, legacyCode: l.legacyCode, qty: l.qty, unitLabel: l.unitLabel, price: l.price, amount: l.amount, returnedQty: l.returnedQty }))}
      />
    </>
  );
}

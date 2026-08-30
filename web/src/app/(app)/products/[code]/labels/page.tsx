import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProductByCode } from "@/server/db/queries/products";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { LabelSheet } from "@/components/products/LabelSheet";
import { withTimeout } from "@/lib/withTimeout";

export default async function ProductLabelsPage({ params }: PageProps<"/products/[code]/labels">) {
  await requireSection("items", "view");
  const { code } = await params;
  const [data, branches] = await withTimeout(Promise.all([getProductByCode(code), listBranches()]), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { item } = data;

  return (
    <>
      <PageHeader title={`Barcode Labels — ${item.name}`} subtitle={`${item.legacyCode} · CODE128 barcode sheet, sized for standard label stock`} backHref={`/products/${code}`} />
      <LabelSheet product={{ id: item.id, legacyCode: item.legacyCode, name: item.name, purchaseRate: item.purchaseRate, purchaseUnit: item.purchaseUnit }} branches={branches} />
    </>
  );
}

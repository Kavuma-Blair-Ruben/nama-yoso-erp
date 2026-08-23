import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProductByCode } from "@/server/db/queries/products";
import { LabelSheet } from "@/components/products/LabelSheet";

export default async function ProductLabelsPage({ params }: PageProps<"/products/[code]/labels">) {
  await requireSection("items", "view");
  const { code } = await params;
  const data = await getProductByCode(code);
  if (!data) notFound();
  const { item } = data;

  return (
    <>
      <PageHeader title={`Barcode Labels — ${item.name}`} subtitle={`${item.legacyCode} · CODE128 barcode sheet, sized for standard label stock`} />
      <LabelSheet product={{ legacyCode: item.legacyCode, name: item.name, purchaseRate: item.purchaseRate, purchaseUnit: item.purchaseUnit }} />
    </>
  );
}

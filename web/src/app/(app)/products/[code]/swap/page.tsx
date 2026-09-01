import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProductByCode } from "@/server/db/queries/products";
import { listIngredientPickerItems } from "@/server/db/queries/recipes";
import { IngredientSwapBuilder } from "@/components/products/IngredientSwapBuilder";
import { withTimeout } from "@/lib/withTimeout";

export default async function IngredientSwapPage({ params }: PageProps<"/products/[code]/swap">) {
  await requireSection("items", "edit");
  const { code } = await params;
  const [data, items] = await withTimeout(
    Promise.all([getProductByCode(code), listIngredientPickerItems()]),
    20000,
    "This is taking longer than expected — please try again in a moment."
  );
  if (!data) notFound();
  const { item } = data;

  return (
    <>
      <PageHeader
        title={`Replace ${item.name} Everywhere`}
        subtitle="Swap this ingredient for an alternative across every recipe that uses it, with a cost-impact preview first."
        backHref={`/products/${item.legacyCode}`}
        backLabel={item.name}
      />
      <IngredientSwapBuilder fromItem={{ id: item.id, code: item.legacyCode, name: item.name }} items={items.filter((i) => i.id !== item.id)} />
    </>
  );
}

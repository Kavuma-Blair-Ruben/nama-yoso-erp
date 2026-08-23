import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewProductForm } from "@/components/products/NewProductForm";
import { listCategoriesForFilter, listSubcategoriesForFilter, listSuppliersForFilter } from "@/server/db/queries/products";

export default async function NewProductPage() {
  await requireSection("items", "edit");
  const [categories, subcategories, suppliers] = await Promise.all([
    listCategoriesForFilter(),
    listSubcategoriesForFilter(),
    listSuppliersForFilter(),
  ]);
  return (
    <>
      <PageHeader title="Add Product" subtitle="Add a new purchasable item to the product master. Its code continues the existing SKU sequence automatically." />
      <NewProductForm categories={categories.map((c) => c.name)} subcategories={subcategories.map((s) => s.name)} suppliers={suppliers.map((s) => s.name)} />
    </>
  );
}

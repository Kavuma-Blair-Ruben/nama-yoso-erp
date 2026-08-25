import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listMenuCategories } from "@/server/db/queries/menuCategories";
import { MenuCategorySettings } from "@/components/menu/MenuCategorySettings";

export default async function MenuCategoriesPage() {
  await requireSection("recipes", "view");
  const categories = await listMenuCategories();
  return (
    <>
      <PageHeader title="Menu Categories" subtitle="Manage the sections your menu is organized into." />
      <MenuCategorySettings categories={categories} />
    </>
  );
}

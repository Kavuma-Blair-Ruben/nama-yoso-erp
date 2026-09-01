import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listMenuCategories } from "@/server/db/queries/menuCategories";
import { MenuCategorySettings } from "@/components/menu/MenuCategorySettings";
import { withTimeout } from "@/lib/withTimeout";

export default async function MenuCategoriesPage() {
  await requireSection("recipes", "view");
  const categories = await withTimeout(listMenuCategories("main"), 20000, "This is taking longer than expected — please try again in a moment.");
  return (
    <>
      <PageHeader title="Menu Categories" subtitle="Manage the sections your menu is organized into." />
      <MenuCategorySettings categories={categories} scope="main" />
    </>
  );
}

import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listMenuCategories } from "@/server/db/queries/menuCategories";
import { MenuCategorySettings } from "@/components/menu/MenuCategorySettings";
import { withTimeout } from "@/lib/withTimeout";

export default async function SubRecipeCategoriesPage() {
  await requireSection("subrecipes", "view");
  const categories = await withTimeout(listMenuCategories("sub"), 20000, "This is taking longer than expected — please try again in a moment.");
  return (
    <>
      <PageHeader title="Sub-Recipe Categories" subtitle="Manage the production lines your sub-recipes are organized into." />
      <MenuCategorySettings categories={categories} scope="sub" />
    </>
  );
}

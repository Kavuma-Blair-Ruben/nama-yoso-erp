import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { RecipeBuilder } from "@/components/recipes/RecipeBuilder";
import { getRecipeForEdit, listRecipeIngredientPickerItems, type RecipeType } from "@/server/db/queries/recipes";
import { listActiveBranches } from "@/server/db/queries/branches";
import { listMenuCategories } from "@/server/db/queries/menuCategories";
import { withTimeout } from "@/lib/withTimeout";

export default async function EditRecipePage({ params }: PageProps<"/recipes/[type]/[code]/edit">) {
  const { type: typeParam, code } = await params;
  const type: RecipeType = typeParam === "sub" ? "sub" : "main";
  await requireSection(type === "main" ? "recipes" : "subrecipes", "edit");

  const [data, items, branchOptions, menuCategories] = await withTimeout(Promise.all([
    getRecipeForEdit(type, code),
    listRecipeIngredientPickerItems(type, code),
    listActiveBranches(),
    listMenuCategories(type),
  ]), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { recipe, ingredients, branchPrices } = data;

  return (
    <>
      <PageHeader title={`Edit: ${recipe.name}`} subtitle={`${recipe.legacyCode} · ${type === "main" ? "Main Recipe" : "Sub-Recipe"}`} backHref={`/recipes/${type}/${code}`} backLabel={recipe.name} />
      <RecipeBuilder
        type={type}
        code={code}
        items={items}
        branchOptions={branchOptions}
        menuCategories={menuCategories}
        initial={{
          name: recipe.name,
          secondaryName: recipe.secondaryName ?? null,
          section: recipe.section ?? "",
          yieldQty: recipe.yieldQty,
          yieldUnit: recipe.yieldUnit ?? "",
          cookBookText: recipe.cookBookText ?? "",
          sellingPrice: "sellingPrice" in recipe ? recipe.sellingPrice : null,
          targetFoodCostPct: "targetFoodCostPct" in recipe ? recipe.targetFoodCostPct : null,
          photoUrl: recipe.photoUrl,
          stockable: "stockable" in recipe ? recipe.stockable : true,
          shelfLifeDays: "shelfLifeDays" in recipe ? recipe.shelfLifeDays : null,
          storageInstructions: "storageInstructions" in recipe ? recipe.storageInstructions : null,
          isModifier: "isModifier" in recipe ? recipe.isModifier : false,
          isCombo: "isCombo" in recipe ? recipe.isCombo : false,
          costCategory: ("costCategory" in recipe ? recipe.costCategory : "food") as "food" | "beverage",
          branches: recipe.branches,
          branchPrices,
          lines: ingredients.map((i) => ({ stockItemId: i.stockItemId, ingredientMainRecipeId: i.ingredientMainRecipeId, unitLabel: i.unitLabel ?? "", qty: i.qty, wastagePct: i.wastagePct })),
        }}
      />
    </>
  );
}

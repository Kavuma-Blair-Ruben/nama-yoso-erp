import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { RecipeBuilder } from "@/components/recipes/RecipeBuilder";
import { getRecipeForEdit, listRecipeIngredientPickerItems, type RecipeType } from "@/server/db/queries/recipes";

export default async function EditRecipePage({ params }: PageProps<"/recipes/[type]/[code]/edit">) {
  const { type: typeParam, code } = await params;
  const type: RecipeType = typeParam === "sub" ? "sub" : "main";
  await requireSection(type === "main" ? "recipes" : "subrecipes", "edit");

  const [data, items] = await Promise.all([getRecipeForEdit(type, code), listRecipeIngredientPickerItems(type, code)]);
  if (!data) notFound();
  const { recipe, ingredients } = data;

  return (
    <>
      <PageHeader title={`Edit: ${recipe.name}`} subtitle={`${recipe.legacyCode} · ${type === "main" ? "Main Recipe" : "Sub-Recipe"}`} />
      <RecipeBuilder
        type={type}
        code={code}
        items={items}
        initial={{
          name: recipe.name,
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
          branches: recipe.branches,
          lines: ingredients.map((i) => ({ stockItemId: i.stockItemId, ingredientMainRecipeId: i.ingredientMainRecipeId, unitLabel: i.unitLabel ?? "", qty: i.qty, wastagePct: i.wastagePct })),
        }}
      />
    </>
  );
}

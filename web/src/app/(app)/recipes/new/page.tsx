import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { RecipeBuilder } from "@/components/recipes/RecipeBuilder";
import { getRecipeForEdit, listRecipeIngredientPickerItems, type RecipeType } from "@/server/db/queries/recipes";
import { listActiveBranches } from "@/server/db/queries/branches";

export default async function NewRecipePage({ searchParams }: PageProps<"/recipes/new">) {
  const sp = await searchParams;
  const type: RecipeType = sp.type === "sub" ? "sub" : "main";
  await requireSection(type === "main" ? "recipes" : "subrecipes", "edit");
  const cloneFrom = typeof sp.cloneFrom === "string" ? sp.cloneFrom : null;

  const [items, cloneData, branchOptions] = await Promise.all([
    listRecipeIngredientPickerItems(type),
    cloneFrom ? getRecipeForEdit(type, cloneFrom) : null,
    listActiveBranches(),
  ]);

  const initial = cloneData
    ? {
        name: cloneData.recipe.name + " (Copy)",
        section: cloneData.recipe.section ?? "",
        yieldQty: cloneData.recipe.yieldQty,
        yieldUnit: cloneData.recipe.yieldUnit ?? "",
        cookBookText: cloneData.recipe.cookBookText ?? "",
        sellingPrice: "sellingPrice" in cloneData.recipe ? cloneData.recipe.sellingPrice : null,
        targetFoodCostPct: "targetFoodCostPct" in cloneData.recipe ? cloneData.recipe.targetFoodCostPct : null,
        photoUrl: null, // a clone doesn't inherit the source's photo
        stockable: "stockable" in cloneData.recipe ? cloneData.recipe.stockable : true,
        shelfLifeDays: "shelfLifeDays" in cloneData.recipe ? cloneData.recipe.shelfLifeDays : null,
        storageInstructions: "storageInstructions" in cloneData.recipe ? cloneData.recipe.storageInstructions : null,
        branches: cloneData.recipe.branches,
        branchPrices: cloneData.branchPrices,
        lines: cloneData.ingredients.map((i) => ({ stockItemId: i.stockItemId, ingredientMainRecipeId: i.ingredientMainRecipeId, unitLabel: i.unitLabel ?? "", qty: i.qty, wastagePct: i.wastagePct })),
      }
    : undefined;

  return (
    <>
      <PageHeader
        title={cloneData ? `Clone: ${cloneData.recipe.name}` : type === "main" ? "New Main Recipe" : "New Sub-Recipe"}
        subtitle="Its code continues the existing recipe SKU sequence automatically."
      />
      <RecipeBuilder type={type} items={items} branchOptions={branchOptions} initial={initial} />
    </>
  );
}

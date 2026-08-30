import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { RecipeBuilder } from "@/components/recipes/RecipeBuilder";
import { getRecipeForEdit, listRecipeIngredientPickerItems, type RecipeType } from "@/server/db/queries/recipes";
import { listActiveBranches } from "@/server/db/queries/branches";
import { listMenuCategories } from "@/server/db/queries/menuCategories";
import { withTimeout } from "@/lib/withTimeout";

export default async function NewRecipePage({ searchParams }: PageProps<"/recipes/new">) {
  const sp = await searchParams;
  const type: RecipeType = sp.type === "sub" ? "sub" : "main";
  await requireSection(type === "main" ? "recipes" : "subrecipes", "edit");
  const cloneFrom = typeof sp.cloneFrom === "string" ? sp.cloneFrom : null;
  const kind = sp.kind === "modifier" || sp.kind === "combo" ? sp.kind : undefined;

  const [items, cloneData, branchOptions, menuCategories] = await withTimeout(Promise.all([
    listRecipeIngredientPickerItems(type),
    cloneFrom ? getRecipeForEdit(type, cloneFrom) : null,
    listActiveBranches(),
    listMenuCategories(),
  ]), 20000, "This is taking longer than expected — please try again in a moment.");

  const initial = cloneData
    ? {
        name: cloneData.recipe.name + " (Copy)",
        secondaryName: cloneData.recipe.secondaryName ?? null,
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
        isModifier: "isModifier" in cloneData.recipe ? cloneData.recipe.isModifier : false,
        isCombo: "isCombo" in cloneData.recipe ? cloneData.recipe.isCombo : false,
        costCategory: ("costCategory" in cloneData.recipe ? cloneData.recipe.costCategory : "food") as "food" | "beverage",
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
        backHref={`/recipes?tab=${type}`}
        backLabel="Recipe Costing"
      />
      <RecipeBuilder type={type} items={items} branchOptions={branchOptions} menuCategories={menuCategories} initial={initial} defaultKind={kind} />
    </>
  );
}

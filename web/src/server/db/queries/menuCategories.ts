import "server-only";
import { db } from "@/server/db";
import { menuCategories } from "@/server/db/schema";
import { sql, eq } from "drizzle-orm";

// recipeCount counts against mainRecipes/subRecipes.section by NAME, not a
// join — section is deliberately free text, not an FK to this table (see
// schema.ts comment on menuCategories), so "how many recipes use this
// category" has to match on the name itself.
export async function listMenuCategories(scope?: "main" | "sub") {
  return db
    .select({
      id: menuCategories.id,
      name: menuCategories.name,
      sortOrder: menuCategories.sortOrder,
      scope: menuCategories.scope,
      recipeCount: sql<number>`(
        (select count(*) from main_recipes where main_recipes.section = menu_categories.name) +
        (select count(*) from sub_recipes where sub_recipes.section = menu_categories.name)
      )::int`,
    })
    .from(menuCategories)
    .where(scope ? eq(menuCategories.scope, scope) : undefined)
    .orderBy(menuCategories.sortOrder, menuCategories.name);
}

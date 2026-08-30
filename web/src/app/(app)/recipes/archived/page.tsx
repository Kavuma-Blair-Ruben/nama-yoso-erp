import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listArchivedRecipes } from "@/server/db/queries/recipes";
import { RestoreRecipeButton } from "@/components/recipes/RestoreRecipeButton";
import { withTimeout } from "@/lib/withTimeout";

// The recycle bin for archiveRecipe — deleting a recipe only ever sets a
// flag (see the comment on archiveRecipe itself), so anything that shows up
// here still has every bit of its data intact and can be brought back
// exactly as it was.
export default async function ArchivedRecipesPage() {
  const session = await requireSection("recipes", "view");
  const canViewMain = hasAccess(session, "recipes", "view");
  const canViewSub = hasAccess(session, "subrecipes", "view");

  const all = await withTimeout(listArchivedRecipes(), 20000, "This is taking longer than expected — please try again in a moment.");
  const rows = all.filter((r) => (r.type === "main" ? canViewMain : canViewSub));

  return (
    <>
      <PageHeader
        title="Deleted Recipes"
        subtitle="Recipes you've removed — restore any of them back into Recipe Costing and the Menu panel."
        backHref="/recipes"
        backLabel="Recipe Costing"
      />
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Section</th>
                <th>Deleted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => {
                  const canEdit = hasAccess(session, r.type === "main" ? "recipes" : "subrecipes", "edit");
                  return (
                    <tr key={`${r.type}-${r.code}`}>
                      <td className="mono-r" style={{ textAlign: "left" }}>{r.code}</td>
                      <td>{r.name}</td>
                      <td>{r.type === "main" ? "Main Recipe" : "Sub-Recipe"}</td>
                      <td>{r.section ?? "-"}</td>
                      <td>{r.updatedAt.toISOString().slice(0, 10)}</td>
                      <td className="right">{canEdit && <RestoreRecipeButton type={r.type} code={r.code} />}</td>
                    </tr>
                  );
                })
              ) : (
                <tr className="empty-row">
                  <td colSpan={6}>No deleted recipes — anything you delete from Recipe Costing will show up here.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

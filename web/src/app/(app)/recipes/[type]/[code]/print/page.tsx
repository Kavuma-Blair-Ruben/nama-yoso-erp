import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { getRecipeDetail, type RecipeType } from "@/server/db/queries/recipes";
import { displayYield, ledgerDisplayUnit } from "@/lib/unitMath";
import { fmt, money } from "@/lib/format";
import { Logo } from "@/components/ui/Logo";
import { PrintButton } from "@/components/ui/PrintButton";

export default async function RecipePrintPage({ params }: PageProps<"/recipes/[type]/[code]/print">) {
  await requireSection("recipes", "view");
  const { type: typeParam, code } = await params;
  const type: RecipeType = typeParam === "sub" ? "sub" : "main";
  const data = await getRecipeDetail(type, code);
  if (!data) notFound();
  const { recipe, cur } = data;
  const dy = displayYield(recipe.yieldQty, recipe.yieldUnit);
  const cookBookText = "cookBookText" in recipe ? recipe.cookBookText : null;
  const photoUrl = "photoUrl" in recipe ? recipe.photoUrl : null;
  const sellingPrice = "sellingPrice" in recipe ? recipe.sellingPrice : null;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }} className="no-print">
        <PrintButton label="Print Cook Book" />
      </div>

      <div className="print-doc" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 36, boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 16, marginBottom: 20 }}>
          <Logo height={48} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "#666" }}>{type === "main" ? "Main Recipe" : "Sub-Recipe"}</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{recipe.legacyCode}</div>
          </div>
        </div>

        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>{recipe.name}</h1>
        <div style={{ fontSize: 12.5, color: "#666", marginBottom: 20 }}>
          {recipe.section ? recipe.section + " · " : ""}
          Yield: {type === "main" ? "1 portion" : `${fmt(dy.qty, 3)} ${dy.unit}`}
        </div>

        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={recipe.name} style={{ maxWidth: 320, borderRadius: 8, marginBottom: 20, display: "block" }} />
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 20 }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid #111" }}>
              <th style={{ textAlign: "left", padding: "6px 4px" }}>Ingredient</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Qty</th>
              <th style={{ textAlign: "left", padding: "6px 4px" }}>Unit</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {cur.lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #e5e5e5" }}>
                <td style={{ padding: "6px 4px" }}>{l.ing.name}</td>
                <td style={{ textAlign: "right", padding: "6px 4px" }}>{fmt(l.ing.qty, 3)}</td>
                <td style={{ padding: "6px 4px" }}>
                  {ledgerDisplayUnit({ isSub: !!l.result.sub, ingredientUnitLabel: l.ing.unitLabel, productIssueUnit: l.ing.productIssueUnit, subYieldUnit: l.result.sub?.yieldUnit })}
                </td>
                <td style={{ textAlign: "right", padding: "6px 4px" }}>{money(l.result.cost, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "1.5px solid #111", fontWeight: 700 }}>
              <td style={{ padding: "6px 4px" }} colSpan={3}>Total Cost</td>
              <td style={{ textAlign: "right", padding: "6px 4px" }}>{money(cur.total, 2)}</td>
            </tr>
            {sellingPrice != null && (
              <tr>
                <td style={{ padding: "6px 4px" }} colSpan={3}>Selling Price</td>
                <td style={{ textAlign: "right", padding: "6px 4px" }}>{money(sellingPrice, 2)}</td>
              </tr>
            )}
          </tfoot>
        </table>

        {cookBookText && (
          <>
            <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", borderBottom: "1px solid #ddd", paddingBottom: 6, marginBottom: 10 }}>Method</h3>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.7 }}>{cookBookText}</div>
          </>
        )}
      </div>
    </div>
  );
}

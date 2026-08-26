import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { getRecipeDetail, type RecipeType } from "@/server/db/queries/recipes";
import { displayYield, ledgerDisplayUnit, gramsDisplay } from "@/lib/unitMath";
import { fmt, money } from "@/lib/format";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { PrintButton } from "@/components/ui/PrintButton";

const ACCENT = "#0a5a96";

// Cook book method text is free-form ("1. Toast the bread.\n2. Spread..."
// or just plain lines) — split it into real steps so it reads as a
// numbered list instead of one dense paragraph, without requiring authors
// to have typed it in any particular format.
function splitSteps(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

export default async function RecipePrintPage({ params }: PageProps<"/recipes/[type]/[code]/print">) {
  await requireSection("recipes", "view");
  const { type: typeParam, code } = await params;
  const type: RecipeType = typeParam === "sub" ? "sub" : "main";
  const data = await getRecipeDetail(type, code);
  if (!data) notFound();
  const { recipe, cur, branchPrices } = data;
  const dy = displayYield(recipe.yieldQty, recipe.yieldUnit);
  const cookBookText = "cookBookText" in recipe ? recipe.cookBookText : null;
  const photoUrl = "photoUrl" in recipe ? recipe.photoUrl : null;
  const sellingPrice = "sellingPrice" in recipe ? recipe.sellingPrice : null;
  const steps = cookBookText ? splitSteps(cookBookText) : [];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }} className="no-print">
        <Link href={`/recipes/${type}/${code}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--ink-soft)" }}>
          ← Back to Recipe
        </Link>
        <PrintButton label="Print Cook Book" />
      </div>

      <div className="print-doc" style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
        {/* Header band */}
        <div style={{ background: ACCENT, color: "#fff", padding: "18px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Logo height={40} white />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.85 }}>Cook Book · {type === "main" ? "Main Recipe" : "Sub-Recipe"}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{recipe.legacyCode}</div>
          </div>
        </div>

        <div style={{ padding: "28px 32px 36px" }}>
          {/* Title row */}
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 24 }}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={recipe.name} style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 10, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 140, height: 140, borderRadius: 10, background: "#f4f4f4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 36, opacity: 0.25 }}>🍽</span>
              </div>
            )}
            <div style={{ flex: 1, paddingTop: 4 }}>
              <h1 style={{ fontSize: 28, margin: "0 0 8px", lineHeight: 1.15 }}>{recipe.name}</h1>
              {recipe.secondaryName && <div style={{ fontSize: 15, color: "#666", margin: "-4px 0 8px" }}>{recipe.secondaryName}</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {recipe.section && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT, background: "#eaf2f9", padding: "3px 10px", borderRadius: 20 }}>{recipe.section}</span>
                )}
                <span style={{ fontSize: 12, color: "#666" }}>Yield: {type === "main" ? "1 portion" : `${fmt(dy.qty, 3)} ${dy.unit}`}</span>
              </div>
            </div>
          </div>

          {/* Two-column body: ingredients | method */}
          <div style={{ display: "flex", gap: 32 }}>
            <div style={{ width: 300, flexShrink: 0 }}>
              <h3 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: ACCENT, borderBottom: `2px solid ${ACCENT}`, paddingBottom: 6, marginBottom: 10 }}>Ingredients</h3>
              <div>
                {cur.lines.map((l, i) => {
                  const canonicalUnit = ledgerDisplayUnit({ isSub: !!l.result.sub, ingredientUnitLabel: l.ing.unitLabel, productIssueUnit: l.ing.productIssueUnit, subYieldUnit: l.result.sub?.yieldUnit });
                  const display = gramsDisplay(l.ing.qty, canonicalUnit);
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 0", borderBottom: "1px solid #f0f0f0", fontSize: 12.5 }}>
                      <span>{l.ing.name}</span>
                      <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                        {fmt(display.qty, display.unit === "G" || display.unit === "ML" ? 0 : 3)} {display.unit}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 16, background: "#f7f9fb", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700 }}>
                  <span>Total Cost</span>
                  <span>{money(cur.total, 2)}</span>
                </div>
                {cur.packagingCost > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", marginTop: 3 }}>
                    <span>incl. packaging</span>
                    <span>{money(cur.packagingCost, 2)}</span>
                  </div>
                )}
                {sellingPrice != null && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginTop: 6, paddingTop: 6, borderTop: "1px solid #e5e5e5" }}>
                    <span>Selling Price{branchPrices.length > 0 ? " (Default)" : ""}</span>
                    <span style={{ fontWeight: 700 }}>{money(sellingPrice, 2)}</span>
                  </div>
                )}
                {branchPrices.map((bp) => (
                  <div key={bp.branchId} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#666", marginTop: 3 }}>
                    <span>{bp.branchName}</span>
                    <span>{money(bp.sellingPrice, 2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: ACCENT, borderBottom: `2px solid ${ACCENT}`, paddingBottom: 6, marginBottom: 14 }}>Method</h3>
              {steps.length ? (
                <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {steps.map((step, i) => (
                    <li key={i} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                      <span
                        style={{
                          flexShrink: 0,
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: ACCENT,
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 13.5, lineHeight: 1.6, paddingTop: 2 }}>{step}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div style={{ fontSize: 12.5, color: "#999", fontStyle: "italic" }}>No method written up yet for this recipe.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

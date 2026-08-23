import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getRecipeDetail, type RecipeType } from "@/server/db/queries/recipes";
import { LedgerRow } from "@/components/recipes/LedgerRow";
import { displayYield, normalizeToKgLtr } from "@/lib/unitMath";
import { fmt, money, pct } from "@/lib/format";

export default async function RecipeDetailPage({ params }: PageProps<"/recipes/[type]/[code]">) {
  const session = await requireSection("recipes", "view");
  const { type: typeParam, code } = await params;
  const type: RecipeType = typeParam === "sub" ? "sub" : "main";
  const data = await getRecipeDetail(type, code);
  if (!data) notFound();
  const { recipe, cur, orig, variancePct } = data;
  const canEdit = hasAccess(session, type === "main" ? "recipes" : "subrecipes", "edit");
  const unreliableYield = "unreliableYield" in cur ? cur.unreliableYield : false;
  const uniqueMissing = [...new Map(cur.missing.map((m) => [m.code + m.name, m])).values()];
  const dy = displayYield(recipe.yieldQty, recipe.yieldUnit);
  const perKg = type === "sub" && !unreliableYield ? normalizeToKgLtr(cur.perUnit, recipe.yieldUnit) : null;
  const sellingPrice = "sellingPrice" in recipe ? recipe.sellingPrice : null;
  const targetFoodCostPct = "targetFoodCostPct" in recipe ? recipe.targetFoodCostPct : null;
  const actualFoodCostPct = sellingPrice ? (cur.perUnit / sellingPrice) * 100 : null;
  const cookBookText = "cookBookText" in recipe ? recipe.cookBookText : null;
  const photoUrl = "photoUrl" in recipe ? recipe.photoUrl : null;
  const stockable = "stockable" in recipe ? recipe.stockable : null;
  const shelfLifeDays = "shelfLifeDays" in recipe ? recipe.shelfLifeDays : null;
  const storageInstructions = "storageInstructions" in recipe ? recipe.storageInstructions : null;
  const recipeBranches = "branches" in recipe ? recipe.branches : [];

  return (
    <>
      <PageHeader
        title={recipe.name}
        subtitle={`${recipe.legacyCode} · ${type === "main" ? "Main Recipe" : "Sub-Recipe"}${recipe.section ? " · " + recipe.section : ""}`}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href={`/recipes/${type}/${code}/print`} className="btn ghost">Print / Cook Book</Link>
            {canEdit && <Link href={`/recipes/new?type=${type}&cloneFrom=${code}`} className="btn ghost">Clone</Link>}
            {canEdit && <Link href={`/recipes/${type}/${code}/edit`} className="btn accent">Edit Recipe</Link>}
          </div>
        }
      />

      {type === "sub" && (
        <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`tag ${stockable ? "good" : "neutral"}`}>{stockable ? "Stockable" : "Non-Stockable"}</span>
          {stockable ? (
            <>
              {shelfLifeDays != null && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Shelf life: <b>{shelfLifeDays} day{shelfLifeDays === 1 ? "" : "s"}</b></span>}
              {storageInstructions && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Storage: <b>{storageInstructions}</b></span>}
              <Link href="/production/new" style={{ fontSize: 12 }}>Produce a batch →</Link>
            </>
          ) : (
            <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>Ingredients deplete directly wherever it&apos;s used, no production event needed.</span>
          )}
        </div>
      )}

      {unreliableYield && (
        <div className="warn-box" style={{ marginBottom: 16 }}>
          <b>Yield data unreliable in source data</b> — this recipe&apos;s recorded yield is a fraction of a piece,
          which isn&apos;t a real portion count. Cost below is shown per prep (yield treated as 1) instead.
        </div>
      )}

      <div className="grid-2">
        <div>
          <div className="ledger" style={{ marginBottom: 16 }}>
            <div className="ledger-head">
              <div>
                <div className="name">{recipe.name}</div>
                <div className="code">{recipe.legacyCode}</div>
              </div>
              <div className="yield">
                {type === "main" ? "Portion" : unreliableYield ? "Yield" : "Final Yield"}
                <br />
                <b>{type === "main" ? "1 dish" : unreliableYield ? "1 prep" : `${fmt(dy.qty, 3)} ${dy.unit}`}</b>
              </div>
            </div>
            <div className="ledger-row head">
              <div>Ingredient</div>
              <div>Qty</div>
              <div>Unit</div>
              <div>Rate</div>
              <div>Cost</div>
            </div>
            {cur.lines.map((l, i) => (
              <LedgerRow key={i} ing={l.ing} result={l.result} depth={0} />
            ))}
            <div className="ledger-total">
              <div>Total Cost</div>
              <div></div>
              <div></div>
              <div></div>
              <div>{money(cur.total, 2)}</div>
            </div>
          </div>

          {uniqueMissing.length > 0 && (
            <div className="warn-box">
              <b>{uniqueMissing.length} ingredient(s) not linked to a live master price</b> — using the original
              build-time cost as fallback: {uniqueMissing.map((m) => m.name).join(", ")}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Cost Summary</h3></div>
          <div className="panel-body">
            <div className="field-row"><span className="k">Assigned branches</span><span className="v">{recipeBranches.length ? recipeBranches.join(", ") : "All"}</span></div>
            <div className="field-row"><span className="k">Cost per Batch</span><span className="v tabular">{money(cur.total, 2)}</span></div>
            <div className="field-row"><span className="k">Cost per {type === "main" ? "portion" : recipe.yieldUnit ?? "unit"}</span><span className="v tabular">{money(cur.perUnit, 3)}</span></div>
            {perKg != null && (
              <div className="field-row"><span className="k"><b>Cost per KG / LTR</b></span><span className="v tabular"><b>{money(perKg, 2)}</b></span></div>
            )}
            <div className="field-row"><span className="k">Original build-time cost</span><span className="v tabular">{money(orig.perUnit, 3)}</span></div>
            <div className="field-row">
              <span className="k">Variance vs. original</span>
              <span className="v">
                <span className={`tag ${variancePct >= 0 ? "bad" : "good"}`} style={{ fontSize: 11.5 }}>{pct(variancePct, 2)}</span>
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", margin: "-4px 0 6px" }}>
              Variance is the gap between what this recipe cost when it was first entered and what it costs today,
              purely because ingredient prices in Product Master have moved since then.
            </div>
          </div>
        </div>
      </div>

      {type === "main" && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head"><h3>Pricing &amp; Food Cost Analysis</h3></div>
          <div className="panel-body">
            <div className="field-row"><span className="k">Selling price</span><span className="v tabular">{sellingPrice != null ? money(sellingPrice, 2) : "Not set"}</span></div>
            <div className="field-row"><span className="k">Food cost</span><span className="v tabular">{actualFoodCostPct != null ? fmt(actualFoodCostPct, 1) + "%" : "—"}</span></div>
            {targetFoodCostPct != null && (
              <div className="field-row">
                <span className="k">Target food cost</span>
                <span className="v">
                  {fmt(targetFoodCostPct, 1)}%
                  {actualFoodCostPct != null && (
                    <span className={`tag ${actualFoodCostPct > targetFoodCostPct ? "bad" : "good"}`} style={{ marginLeft: 8, fontSize: 11.5 }}>
                      {actualFoodCostPct > targetFoodCostPct ? "Above target" : "Within target"}
                    </span>
                  )}
                </span>
              </div>
            )}
            <div className="field-row"><span className="k">Gross profit / dish</span><span className="v tabular">{sellingPrice != null ? money(sellingPrice - cur.perUnit, 2) : "—"}</span></div>
            {sellingPrice == null && canEdit && (
              <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 4 }}>
                No selling price set yet — <Link href={`/recipes/${type}/${code}/edit`}>add one</Link> to see food cost analysis.
              </div>
            )}
          </div>
        </div>
      )}

      {(cookBookText || photoUrl) && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head"><h3>Cook Book</h3></div>
          <div className="panel-body">
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={recipe.name} style={{ maxWidth: 320, borderRadius: 8, marginBottom: 12, display: "block" }} />
            )}
            {cookBookText && <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6 }}>{cookBookText}</div>}
          </div>
        </div>
      )}
    </>
  );
}

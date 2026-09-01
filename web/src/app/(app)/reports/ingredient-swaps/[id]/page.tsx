import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getIngredientSwapEventDetail } from "@/server/db/queries/reports";
import { fmt, money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

export default async function IngredientSwapDetailPage({ params }: PageProps<"/reports/ingredient-swaps/[id]">) {
  await requireSection("reports", "view");
  const { id } = await params;
  const data = await withTimeout(getIngredientSwapEventDetail(id), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { event, lines } = data;

  return (
    <>
      <PageHeader
        title={`${event.fromName} → ${event.toName}`}
        subtitle={`${event.createdAt.toISOString().slice(0, 10)}${event.createdByName ? " · " + event.createdByName : ""}`}
        backHref="/reports?tab=ingredientswaps"
        backLabel="Ingredient Swaps"
      />

      <div className="field-row"><span className="k">Replaced</span><span className="v"><Link href={`/products/${event.fromCode}`}>{event.fromName}</Link> ({event.fromCode})</span></div>
      <div className="field-row"><span className="k">With</span><span className="v"><Link href={`/products/${event.toCode}`}>{event.toName}</Link> ({event.toCode})</span></div>
      {event.reason && <div className="field-row"><span className="k">Reason</span><span className="v">{event.reason}</span></div>}
      <div className="field-row"><span className="k">Ingredient lines repointed</span><span className="v">{event.affectedLineCount}</span></div>
      <div className="field-row">
        <span className="k"><b>Total Cost Impact</b></span>
        <span className="v">
          <span className={`tag ${event.totalCostImpact > 0 ? "bad" : event.totalCostImpact < 0 ? "good" : "neutral"}`}>
            {event.totalCostImpact >= 0 ? "+" : ""}
            {money(event.totalCostImpact, 2)}
          </span>
        </span>
      </div>

      <div className="section-title" style={{ marginTop: 16 }}>Affected Recipes</div>
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Recipe</th><th className="right">Cost Before</th><th className="right">Cost After</th><th className="right">Δ</th></tr></thead>
            <tbody>
              {lines.length ? (
                lines.map((l) => {
                  const impact = l.costAfter - l.costBefore;
                  return (
                    <tr key={l.id}>
                      <td><Link href={`/recipes/${l.recipeType}/${l.recipeCode}`}>{l.recipeName}</Link> <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>({l.recipeCode})</span></td>
                      <td className="mono-r">{money(l.costBefore, 2)}</td>
                      <td className="mono-r">{money(l.costAfter, 2)}</td>
                      <td className="mono-r" style={{ color: impact === 0 ? undefined : impact > 0 ? "var(--bad)" : "var(--good)" }}>
                        {impact >= 0 ? "+" : ""}
                        {fmt(impact, 2)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr className="empty-row"><td colSpan={4}>No recipes were affected by this swap.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

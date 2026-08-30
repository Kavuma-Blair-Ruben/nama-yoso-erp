import Link from "next/link";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAutoProductionSuggestions } from "@/server/db/queries/forecasting";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { fmt } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";
import { withTimeout } from "@/lib/withTimeout";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default async function AutoProductionPage({ searchParams }: PageProps<"/production/suggestions">) {
  await requireSection("subrecipes", "edit");
  const sp = await searchParams;
  const branches = await withTimeout(listBranches(), 20000, "This is taking longer than expected — please try again in a moment.");
  const branchId = typeof sp.branch === "string" && branches.some((b) => b.id === sp.branch) ? sp.branch : (branches[0]?.id ?? "");
  const targetCoverDays = typeof sp.cover === "string" && Number(sp.cover) > 0 ? Number(sp.cover) : 14;
  const costCenters = await withTimeout(listAllActiveCostCenters(), 20000, "This is taking longer than expected — please try again in a moment.");
  const costCentersForBranch = costCenters.filter((c) => c.branchId === branchId);
  const kitchenCostCenterId = costCentersForBranch.find((c) => c.name === "Kitchen")?.id ?? costCentersForBranch[0]?.id;

  const { rows, skippedNoDemandCount } = branchId
    ? await withTimeout(getAutoProductionSuggestions(branchId, { targetCoverDays }), 20000, "This is taking longer than expected — please try again in a moment.")
    : { rows: [], skippedNoDemandCount: 0 };
  const lowCount = rows.filter((r) => r.status === "low").length;

  return (
    <>
      <PageHeader
        title="Auto Production"
        subtitle="Sub-recipes projected to run low, from real consumption — not a trained model, straightforward data-driven math, same as Predictive Orders but for what you make instead of what you buy."
        backHref="/production"
        backLabel="Production"
      />

      <form className="filterbar" method="get">
        <select name="branch" defaultValue={branchId}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-soft)" }}>
          Cover <input type="number" name="cover" min={1} defaultValue={targetCoverDays} style={{ width: 64 }} />
          days
        </label>
        <button className="btn ghost" type="submit">Apply</button>
      </form>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-icon">🍳</div>
          <div className="n" style={{ color: lowCount ? "var(--bad)" : "inherit" }}>{lowCount}</div>
          <div className="l">Sub-Recipes Low</div>
          <div className="d">of {rows.length} with recent demand</div>
        </div>
      </div>

      {skippedNoDemandCount > 0 && (
        <div className="callout">
          {skippedNoDemandCount} stockable sub-recipe(s) have no recent consumption recorded for this branch — not enough
          history yet to suggest a batch size, so they're left out rather than guessed.
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>Suggested Production</h3>
          <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>Ranked by lowest stock coverage first</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Sub-Recipe</th>
                <th className="right">Daily Use</th>
                <th className="right">Current Stock</th>
                <th className="right">4-wk Avg</th>
                <th className="right">Coverage</th>
                <th>Last Produced</th>
                <th className="right">Suggested Batch</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.subRecipeId}>
                    <td>
                      <Link href={`/recipes/sub/${r.legacyCode}`}>{r.legacyCode} — {r.name}</Link>
                      <span className={`tag ${r.status === "low" ? "bad" : "good"}`} style={{ marginLeft: 6 }}>
                        {r.status === "low" ? "Low stock" : "On track"}
                      </span>
                    </td>
                    <td className="mono-r">{fmt(r.dailyDemand, 2)} {canonicalUnitLabel(r.yieldUnit)}</td>
                    <td className="mono-r">{fmt(r.currentStock, 2)} {canonicalUnitLabel(r.yieldUnit)}</td>
                    <td className="mono-r">{fmt(r.fourWeekAvgDaily, 2)}</td>
                    <td className="mono-r" style={{ color: r.coverageDays != null && r.coverageDays < 1 ? "var(--bad)" : "inherit" }}>
                      {r.coverageDays != null ? `${fmt(r.coverageDays, 1)}d` : "—"}
                    </td>
                    <td>{r.lastProducedDate ?? "Never"}</td>
                    <td className="mono-r">{fmt(round2(r.suggestedScaleMultiplier), 2)}× batch</td>
                    <td className="right">
                      <Link
                        href={`/production/new?subRecipeId=${r.subRecipeId}&branchId=${branchId}&scaleMultiplier=${round2(r.suggestedScaleMultiplier)}${kitchenCostCenterId ? `&costCenterId=${kitchenCostCenterId}` : ""}`}
                        className="btn ghost"
                      >
                        Open Batch
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row">
                  <td colSpan={8}>No sub-recipes need production right now for this branch.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

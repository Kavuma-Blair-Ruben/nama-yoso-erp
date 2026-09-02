import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listStockCounts } from "@/server/db/queries/stockCount";
import { money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";
import { DateRangeFields } from "@/components/ui/DateRangeFields";

export default async function StockCountPage({ searchParams }: PageProps<"/stock-count">) {
  const session = await requireSection("stockcount", "view");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const activeType = sp.type === "spotcheck" ? "SPOT_CHECK" : "FULL";
  const rows = await withTimeout(
    listStockCounts({ status, from: from || undefined, to: to || undefined, countType: activeType }),
    20000,
    "This is taking longer than expected — please try again in a moment."
  );
  const canEdit = hasAccess(session, "stockcount", "edit");
  const draftCount = rows.filter((c) => c.status === "DRAFT").length;
  const isSpotCheck = activeType === "SPOT_CHECK";

  function tabHref(type: "full" | "spotcheck") {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (type === "spotcheck") params.set("type", "spotcheck");
    const qs = params.toString();
    return `/stock-count${qs ? `?${qs}` : ""}`;
  }

  return (
    <>
      <PageHeader
        title={isSpotCheck ? "Spot Checks" : "Stock Count"}
        subtitle={
          isSpotCheck
            ? "Quick review counts — records variance for review, never adjusts system stock."
            : "Physical counts vs. system stock — posts variances as real ledger adjustments."
        }
        action={
          canEdit ? (
            <Link href={isSpotCheck ? "/stock-count/new?type=spotcheck" : "/stock-count/new"} className="btn accent">
              + New {isSpotCheck ? "Spot Check" : "Stock Count"}
            </Link>
          ) : undefined
        }
      />

      <div className="pill-tabs" style={{ marginBottom: 14 }}>
        <Link href={tabHref("full")} className={`btn ${isSpotCheck ? "ghost" : ""}`} style={{ borderRadius: 20 }}>
          Full Counts
        </Link>
        <Link href={tabHref("spotcheck")} className={`btn ${isSpotCheck ? "" : "ghost"}`} style={{ borderRadius: 20 }}>
          Spot Checks
        </Link>
      </div>

      {draftCount > 0 && (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          {draftCount} {isSpotCheck ? "spot check(s)" : "count(s)"} saved as draft — {isSpotCheck ? "not yet posted" : "stock hasn't been adjusted for these yet"}. Open one to post it.
        </div>
      )}
      {isSpotCheck && (
        <div className="callout">A spot check records variance for review exactly like a full count, but posting one never adjusts system stock — use it to sanity-check a few items without committing an adjustment.</div>
      )}

      <form className="filterbar" method="get">
        <input type="hidden" name="type" value={isSpotCheck ? "spotcheck" : ""} />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="POSTED">Posted</option>
        </select>
        <DateRangeFields from={from} to={to} />
        <button className="btn ghost" type="submit">Filter</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} shown</span>
      </form>

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Count Number</th>
                <th>Cost Center</th>
                <th>Branch</th>
                <th>Date</th>
                <th className="right">Items</th>
                <th className="right">Total Variance Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((c) => (
                  <tr key={c.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}><Link href={`/stock-count/${c.id}`}>{c.countNo}</Link></td>
                    <td>{c.costCenter ?? "-"}</td>
                    <td>{c.branchName ?? "-"}</td>
                    <td>{c.countDate}</td>
                    <td className="mono-r">{c.lineCount}</td>
                    <td className="mono-r">
                      <span className={`tag ${Math.abs(c.totalVarianceValue) < 0.01 ? "neutral" : c.totalVarianceValue >= 0 ? "good" : "bad"}`}>{money(c.totalVarianceValue, 2)}</span>
                    </td>
                    <td><span className={`status-badge ${c.status === "DRAFT" ? "status-draft" : "status-received"}`}>{c.status}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={7}>{isSpotCheck ? "No spot checks recorded yet." : "No stock counts recorded yet."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

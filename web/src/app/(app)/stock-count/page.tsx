import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listStockCounts } from "@/server/db/queries/stockCount";
import { money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

export default async function StockCountPage({ searchParams }: PageProps<"/stock-count">) {
  const session = await requireSection("stockcount", "view");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const rows = await withTimeout(listStockCounts({ status }), 20000, "This is taking longer than expected — please try again in a moment.");
  const canEdit = hasAccess(session, "stockcount", "edit");
  const draftCount = rows.filter((c) => c.status === "DRAFT").length;

  return (
    <>
      <PageHeader
        title="Stock Count"
        subtitle="Physical counts vs. system stock — posts variances as real ledger adjustments."
        action={canEdit ? <Link href="/stock-count/new" className="btn accent">+ New Stock Count</Link> : undefined}
      />
      {draftCount > 0 && (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          {draftCount} count(s) saved as draft — stock hasn&apos;t been adjusted for these yet. Open one to post it.
        </div>
      )}

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
                <tr className="empty-row"><td colSpan={7}>No stock counts recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

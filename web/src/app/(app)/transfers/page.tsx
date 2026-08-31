import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listTransfers } from "@/server/db/queries/transfers";
import { money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";
import { DateRangeFields } from "@/components/ui/DateRangeFields";

const STATUS_BADGE_CLASS: Record<string, string> = { DRAFT: "status-draft", IN_TRANSIT: "status-ordered", POSTED: "status-received" };

export default async function TransfersPage({ searchParams }: PageProps<"/transfers">) {
  const session = await requireSection("transfers", "view");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const rows = await withTimeout(listTransfers({ status, from: from || undefined, to: to || undefined }), 20000, "This is taking longer than expected — please try again in a moment.");
  const canEdit = hasAccess(session, "transfers", "edit");
  const draftCount = rows.filter((t) => t.status === "DRAFT").length;
  const inTransitCount = rows.filter((t) => t.status === "IN_TRANSIT").length;

  return (
    <>
      <PageHeader
        title="Stock Transfers"
        subtitle="Inter-branch stock movement between NAMAYOSO MIRDIFF and NAMAYOSO MARSA — deducts and credits the real stock ledger."
        action={canEdit ? <Link href="/transfers/new" className="btn accent">+ New Transfer</Link> : undefined}
      />
      {draftCount > 0 && (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          {draftCount} transfer(s) saved as draft — stock hasn&apos;t moved for these yet. Open one to send it.
        </div>
      )}
      {inTransitCount > 0 && (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          {inTransitCount} transfer(s) sent and awaiting receipt — stock has left the source branch but isn&apos;t credited to the destination until confirmed.
        </div>
      )}

      <form className="filterbar" method="get">
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="IN_TRANSIT">In Transit</option>
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
                <th>Transfer No.</th>
                <th>From</th>
                <th>To</th>
                <th>Date</th>
                <th>Staff</th>
                <th className="right">Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((t) => (
                  <tr key={t.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}><Link href={`/transfers/${t.id}`}>{t.transferNo}</Link></td>
                    <td>{t.fromBranchName}</td>
                    <td>{t.toBranchName}</td>
                    <td>{t.transferDate}</td>
                    <td>{t.staffName ?? "-"}</td>
                    <td className="mono-r">{money(t.totalCost, 2)}</td>
                    <td><span className={`status-badge ${STATUS_BADGE_CLASS[t.status] ?? "status-draft"}`}>{t.status.replace("_", " ")}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={7}>No transfers logged yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

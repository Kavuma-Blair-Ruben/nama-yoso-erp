import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listMaterialRequests, MR_STATUSES } from "@/server/db/queries/materialRequests";
import { withTimeout } from "@/lib/withTimeout";
import { DateRangeFields } from "@/components/ui/DateRangeFields";

const STATUS_CLASS: Record<string, string> = {
  "PENDING APPROVAL": "status-ordered",
  APPROVED: "status-approved",
  REJECTED: "status-cancelled",
  FULFILLED: "status-received",
};

export default async function MaterialRequestsPage({ searchParams }: PageProps<"/material-requests">) {
  const session = await requireSection("orders", "view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const rows = await withTimeout(
    listMaterialRequests({ q, status, from: from || undefined, to: to || undefined }),
    20000,
    "This is taking longer than expected — please try again in a moment."
  );
  const canEdit = hasAccess(session, "orders", "edit");
  const pendingCount = rows.filter((r) => r.status === "PENDING APPROVAL").length;

  return (
    <>
      <PageHeader
        title="Material Requests"
        subtitle="Internal stock requests between branches and the central warehouse — raised, approved, fulfilled."
        action={canEdit ? <Link href="/material-requests/new" className="btn accent">+ New Material Request</Link> : undefined}
      />
      {pendingCount > 0 && <div className="callout" style={{ borderColor: "var(--accent)" }}>{pendingCount} request(s) waiting on approval.</div>}
      <form className="filterbar" method="get">
        <input type="text" name="q" placeholder="Search MR number or location..." defaultValue={q ?? ""} />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          {MR_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <DateRangeFields from={from} to={to} />
        <button className="btn ghost" type="submit">Search</button>
      </form>
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>MR Number</th>
                <th>From</th>
                <th>To</th>
                <th>Required</th>
                <th className="right">Items</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}><Link href={`/material-requests/${r.id}`}>{r.mrNumber}</Link></td>
                    <td>{r.fromLocation}</td>
                    <td>{r.toLocation}</td>
                    <td>{r.requiredDate}</td>
                    <td className="mono-r">{r.lineCount}</td>
                    <td><span className={`status-badge ${STATUS_CLASS[r.status] ?? "status-draft"}`}>{r.status}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No material requests yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

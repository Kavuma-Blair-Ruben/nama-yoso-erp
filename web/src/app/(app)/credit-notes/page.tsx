import Link from "next/link";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listAllCreditNotes } from "@/server/db/queries/grn";
import { money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";
import { DateRangeFields } from "@/components/ui/DateRangeFields";

function statusTagClass(status: string) {
  if (status === "ISSUED") return "good";
  if (status === "REJECTED") return "bad";
  return "neutral";
}

export default async function CreditNotesPage({ searchParams }: PageProps<"/credit-notes">) {
  await requireSection("grn", "view");
  const sp = await searchParams;
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const notes = await withTimeout(
    listAllCreditNotes({ from: from || undefined, to: to || undefined }),
    20000,
    "This is taking longer than expected — please try again in a moment."
  );

  return (
    <>
      <PageHeader title="Credit Notes" subtitle="Credit and return requests raised against posted GRNs — open the GRN to act on one." />
      <form className="filterbar" method="get">
        <DateRangeFields from={from} to={to} />
        <button className="btn ghost" type="submit">Filter</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{notes.length} shown</span>
      </form>
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Credit Note</th>
                <th>GRN</th>
                <th>Supplier</th>
                <th>Reason</th>
                <th className="right">Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {notes.length ? (
                notes.map((n) => (
                  <tr key={n.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}>{n.creditNoteNumber}</td>
                    <td><Link href={`/grn/${n.grnId}`}>{n.grnNumber}</Link></td>
                    <td>{n.supplierName}</td>
                    <td style={{ maxWidth: 280 }}>{n.reason}</td>
                    <td className="mono-r">{money(n.amount, 2)}</td>
                    <td><span className={`tag ${statusTagClass(n.status)}`}>{n.status}</span></td>
                    <td>{n.createdAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={7}>No credit or return requests yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

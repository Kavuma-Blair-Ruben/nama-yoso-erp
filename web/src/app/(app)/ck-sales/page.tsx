import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listDeliveryNotes, listCustomerReturns } from "@/server/db/queries/ckSales";
import { money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

export default async function CkSalesPage() {
  const session = await requireSection("ckwarehouse", "view");
  const [notes, returns] = await withTimeout(Promise.all([listDeliveryNotes(), listCustomerReturns()]), 20000, "This is taking longer than expected — please try again in a moment.");
  const canEdit = hasAccess(session, "ckwarehouse", "edit");

  return (
    <>
      <PageHeader
        title="CK Sales & Delivery Notes"
        subtitle="Sell from Central Kitchen or Warehouse — cost-based or margin-based — to branches or external customers."
        action={canEdit ? <Link href="/ck-sales/new" className="btn accent">+ New Delivery Note / Invoice</Link> : undefined}
      />
      <div className="filterbar">
        <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{notes.length} document(s) · {returns.length} return(s)</span>
      </div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h3>Delivery Notes &amp; Invoices</h3></div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Number</th><th>Type</th><th>Customer</th><th>Branch</th><th>Date</th><th className="right">Total</th></tr></thead>
            <tbody>
              {notes.length ? (
                notes.map((d) => (
                  <tr key={d.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}><Link href={`/ck-sales/${d.id}`}>{d.number}</Link></td>
                    <td><span className="tag neutral">{d.docType === "PRO" ? "Pro Forma/Invoice" : "Delivery Note"}</span></td>
                    <td>{d.customerName}</td>
                    <td>{d.branchName}</td>
                    <td>{d.deliveryDate}</td>
                    <td className="mono-r">{money(d.total, 2)}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No delivery notes or invoices created yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h3>Customer Returns</h3></div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Number</th><th>Against</th><th>Date</th><th>Reason</th><th className="right">Value</th></tr></thead>
            <tbody>
              {returns.length ? (
                returns.map((r) => (
                  <tr key={r.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}>{r.number}</td>
                    <td><Link href={`/ck-sales/${r.deliveryNoteId}`}>{r.dnNumber}</Link></td>
                    <td>{r.createdAt.toISOString().slice(0, 10)}</td>
                    <td>{r.reason ?? "-"}</td>
                    <td className="mono-r">{money(r.value, 2)}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={5}>No customer returns yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

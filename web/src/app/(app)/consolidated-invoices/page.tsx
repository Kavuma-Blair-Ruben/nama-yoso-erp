import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listConsolidatedInvoices } from "@/server/db/queries/grn";
import { money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

export default async function ConsolidatedInvoicesPage() {
  const session = await requireSection("grn", "view");
  const canEdit = hasAccess(session, "grn", "edit");
  const invoices = await withTimeout(listConsolidatedInvoices(), 20000, "This is taking longer than expected — please try again in a moment.");

  return (
    <>
      <PageHeader
        title="Consolidated Invoices"
        subtitle="Combine several GRNs for the same supplier into one billed invoice."
        action={canEdit ? <Link href="/consolidated-invoices/new" className="btn accent">+ New Consolidated Invoice</Link> : undefined}
      />
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Consolidated #</th>
                <th>Supplier</th>
                <th className="right">GRNs Combined</th>
                <th className="right">Total Value</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length ? (
                invoices.map((c) => (
                  <tr key={c.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}><Link href={`/consolidated-invoices/${c.id}`}>{c.number}</Link></td>
                    <td>{c.supplierName}</td>
                    <td className="mono-r">{c.grnCount}</td>
                    <td className="mono-r">{money(c.total, 2)}</td>
                    <td>{c.invoiceDate}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={5}>No consolidated invoices created yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

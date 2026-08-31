import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listConsolidatedInvoices } from "@/server/db/queries/grn";
import { money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";
import { DateRangeFields } from "@/components/ui/DateRangeFields";

export default async function ConsolidatedInvoicesPage({ searchParams }: PageProps<"/consolidated-invoices">) {
  const session = await requireSection("grn", "view");
  const canEdit = hasAccess(session, "grn", "edit");
  const sp = await searchParams;
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const invoices = await withTimeout(
    listConsolidatedInvoices({ from: from || undefined, to: to || undefined }),
    20000,
    "This is taking longer than expected — please try again in a moment."
  );

  return (
    <>
      <PageHeader
        title="Consolidated Invoices"
        subtitle="Combine several GRNs for the same supplier into one billed invoice."
        action={canEdit ? <Link href="/consolidated-invoices/new" className="btn accent">+ New Consolidated Invoice</Link> : undefined}
      />
      <form className="filterbar" method="get">
        <DateRangeFields from={from} to={to} />
        <button className="btn ghost" type="submit">Filter</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{invoices.length} shown</span>
      </form>
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

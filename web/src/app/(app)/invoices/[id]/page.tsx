import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getInvoiceDetail } from "@/server/db/queries/invoices";
import { fmt, money } from "@/lib/format";

export default async function InvoiceDetailPage({ params }: PageProps<"/invoices/[id]">) {
  await requireSection("suppliers", "view");
  const { id } = await params;
  const data = await getInvoiceDetail(id);
  if (!data) notFound();
  const { invoice, lines } = data;

  return (
    <>
      <PageHeader
        title={invoice.invoiceNumber ?? "(no invoice number)"}
        subtitle={`${invoice.supplier ?? "Unknown supplier"} · ${invoice.invoiceDate ?? "-"}`}
        action={invoice.supplierId ? <Link href={`/suppliers/${invoice.supplierId}`} className="btn ghost">View Supplier</Link> : undefined}
      />

      <div style={{ marginBottom: 14 }}>
        <span className={`tag ${invoice.status === "OUTSTANDING" ? "bad" : invoice.status === "PAID" ? "good" : "neutral"}`}>{invoice.status ?? "-"}</span>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h3>Invoice Summary</h3></div>
        <div className="panel-body">
          <div className="field-row"><span className="k">Net Amount</span><span className="v tabular">{fmt(invoice.net)}</span></div>
          <div className="field-row"><span className="k">VAT</span><span className="v tabular">{fmt(invoice.vat)}</span></div>
          <div className="field-row"><span className="k"><b>Total</b></span><span className="v tabular">{money(invoice.total)}</span></div>
          {invoice.terms && <div className="field-row"><span className="k">Payment terms</span><span className="v">{invoice.terms}</span></div>}
          {invoice.weekLabel && <div className="field-row"><span className="k">Week</span><span className="v">{invoice.weekLabel}</span></div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Line Items ({lines.length})</h3></div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th className="right">Qty</th>
                <th>Unit</th>
                <th className="right">Rate</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.length ? (
                lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.itemLabel ?? "-"}</td>
                    <td>{l.category ?? "-"}</td>
                    <td className="mono-r">{fmt(l.qty, 2)}</td>
                    <td>{l.unitLabel ?? "-"}</td>
                    <td className="mono-r">{fmt(l.rate, 2)}</td>
                    <td className="mono-r">{fmt(l.amount, 2)}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No line-item detail linked to this invoice.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

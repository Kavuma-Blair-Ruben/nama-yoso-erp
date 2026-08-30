import Link from "next/link";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listInvoices } from "@/server/db/queries/invoices";
import { fmt, money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  await requireSection("suppliers", "view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const status = typeof sp.status === "string" ? sp.status : undefined;

  const invoices = await withTimeout(listInvoices({ q, status }), 20000, "This is taking longer than expected — please try again in a moment.");
  const totalOutstanding = invoices.filter((i) => i.status === "OUTSTANDING").reduce((s, i) => s + (i.total ?? 0), 0);

  return (
    <>
      <PageHeader title="Invoices" subtitle="Every invoice on file — imported historical records plus posted GRNs that carry a real invoice or delivery note." />

      <form className="filterbar" method="get">
        <input type="text" name="q" placeholder="Search invoice number or supplier..." defaultValue={q ?? ""} />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="OUTSTANDING">Outstanding</option>
          <option value="PAID">Paid</option>
          <option value="OTHER">Other</option>
        </select>
        <button className="btn ghost" type="submit">Filter</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>
          {invoices.length} shown{status === "OUTSTANDING" ? ` · ${money(totalOutstanding, 0)} outstanding` : ""}
        </span>
      </form>

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice #</th>
                <th>Supplier</th>
                <th className="right">Net</th>
                <th className="right">VAT</th>
                <th className="right">Total</th>
                <th>Status</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length ? (
                invoices.map((i) => {
                  const href = i.source === "grn" ? `/grn/${i.id}` : `/invoices/${i.id}`;
                  return (
                    <tr key={`${i.source}-${i.id}`}>
                      <td>{i.invoiceDate ?? "-"}</td>
                      <td className="mono-r" style={{ textAlign: "left" }}>
                        <Link href={href}>{i.invoiceNumber ?? "(no number)"}</Link>
                      </td>
                      <td><Link href={href}>{i.supplier ?? "-"}</Link></td>
                      <td className="mono-r">{fmt(i.net)}</td>
                      <td className="mono-r">{fmt(i.vat)}</td>
                      <td className="mono-r">{fmt(i.total)}</td>
                      <td><span className={`tag ${i.status === "OUTSTANDING" ? "bad" : i.status === "PAID" ? "good" : "neutral"}`}>{i.status ?? "-"}</span></td>
                      <td><span className="tag neutral">{i.source === "grn" ? "GRN" : "Historical"}</span></td>
                    </tr>
                  );
                })
              ) : (
                <tr className="empty-row"><td colSpan={8}>No invoices match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

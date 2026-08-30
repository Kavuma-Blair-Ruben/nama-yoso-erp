import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getConsolidatedInvoiceDetail } from "@/server/db/queries/grn";
import { fmt, money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

export default async function ConsolidatedInvoiceDetailPage({ params }: PageProps<"/consolidated-invoices/[id]">) {
  await requireSection("grn", "view");
  const { id } = await params;
  const data = await withTimeout(getConsolidatedInvoiceDetail(id), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { ci, grns } = data;

  return (
    <>
      <PageHeader title={ci.number} subtitle={`${ci.supplierName} · ${ci.invoiceDate}`} backHref="/consolidated-invoices" backLabel="Consolidated Invoices" />
      <div className="section-title">GRNs Combined ({grns.length})</div>
      {grns.map((g) => (
        <div className="field-row" key={g.grnId}>
          <span className="k"><Link href={`/grn/${g.grnId}`}>{g.grnNumber}</Link> · {g.receivedDate}</span>
          <span className="v tabular">{fmt(g.total, 2)}</span>
        </div>
      ))}
      <div className="section-title">Value</div>
      <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Consolidated Total</b></span><span className="v">{money(ci.total, 2)}</span></div>
      {ci.createdByName && <div className="field-row"><span className="k">Created by</span><span className="v">{ci.createdByName} · {ci.createdAt.toISOString().slice(0, 10)}</span></div>}
    </>
  );
}

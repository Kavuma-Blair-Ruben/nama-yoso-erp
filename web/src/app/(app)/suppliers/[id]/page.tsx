import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSupplierDetail, listSupplierProducts } from "@/server/db/queries/suppliers";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { fmt, money, pct } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

export default async function SupplierDetailPage({ params }: PageProps<"/suppliers/[id]">) {
  const session = await requireSection("suppliers", "view");
  const { id } = await params;
  const [data, products] = await withTimeout(Promise.all([getSupplierDetail(id), listSupplierProducts(id)]), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { supplier, invoiceCount, totalSpend, outstanding, invoices, topItems, recentGrns } = data;
  const canEdit = hasAccess(session, "suppliers", "edit");
  const flaggedProducts = products.filter((p) => p.flagged);

  return (
    <>
      <PageHeader title={supplier.name} subtitle={`${invoiceCount} invoice(s) on file`} backHref="/suppliers" backLabel="Suppliers" />
      <div className="grid-2">
        <div>
          {canEdit ? (
            <SupplierForm supplier={supplier} />
          ) : (
            <div className="panel">
              <div className="panel-head"><h3>Contact</h3></div>
              <div className="panel-body">
                <div className="field-row"><span className="k">TRN</span><span className="v">{supplier.trn ?? "-"}</span></div>
                <div className="field-row"><span className="k">Contact person</span><span className="v">{supplier.contactName ?? "-"}</span></div>
                <div className="field-row"><span className="k">Phone</span><span className="v">{supplier.phone ?? "-"}</span></div>
                <div className="field-row"><span className="k">Email</span><span className="v">{supplier.email ?? "-"}</span></div>
                <div className="field-row"><span className="k">Payment terms</span><span className="v">{supplier.paymentTerms ?? "-"}</span></div>
                <div className="field-row"><span className="k">Lead time</span><span className="v">{supplier.leadTimeDays != null ? supplier.leadTimeDays + " days" : "-"}</span></div>
              </div>
            </div>
          )}

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-head"><h3>Top Items Supplied</h3></div>
            <div className="panel-body">
              {topItems.length ? (
                topItems.map((it) => (
                  <div className="usedin-item" key={it.item ?? "unknown"}>
                    <span className="name">{it.item ?? "(unlabeled)"}</span>
                    <span className="code">{money(it.spend, 0)}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>No historical purchase data for this supplier yet.</div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head"><h3>Spend Summary</h3></div>
            <div className="panel-body">
              <div className="field-row"><span className="k">Total spend</span><span className="v">{money(totalSpend, 0)}</span></div>
              <div className="field-row"><span className="k">Outstanding balance</span><span className="v" style={{ color: outstanding > 0 ? "var(--bad)" : "inherit" }}>{money(outstanding, 0)}</span></div>
              <div className="field-row"><span className="k">Avg. invoice value</span><span className="v">{money(invoiceCount ? totalSpend / invoiceCount : 0, 2)}</span></div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head"><h3>Recent GRNs</h3></div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="data">
                <tbody>
                  {recentGrns.length ? (
                    recentGrns.map((g) => (
                      <tr key={g.id}>
                        <td>{g.grnNumber}</td>
                        <td>{g.receivedDate}</td>
                        <td><span className={`tag ${g.status === "POSTED" ? "good" : "neutral"}`}>{g.status}</span></td>
                      </tr>
                    ))
                  ) : (
                    <tr className="empty-row"><td colSpan={3}>No GRNs received from this supplier yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Invoice History ({invoices.length})</h3></div>
            <div className="table-wrap" style={{ maxHeight: 320 }}>
              <table className="data">
                <thead><tr><th>Date</th><th>Invoice</th><th className="right">Total</th><th>Status</th></tr></thead>
                <tbody>
                  {invoices.length ? (
                    invoices.map((i) => (
                      <tr key={i.id}>
                        <td><Link href={`/invoices/${i.id}`}>{i.invoiceDate}</Link></td>
                        <td className="mono-r" style={{ textAlign: "left" }}><Link href={`/invoices/${i.id}`}>{i.invoiceNumber}</Link></td>
                        <td className="mono-r">{fmt(i.total)}</td>
                        <td><span className={`tag ${i.status === "OUTSTANDING" ? "bad" : i.status === "PAID" ? "good" : "neutral"}`}>{i.status ?? "-"}</span></td>
                      </tr>
                    ))
                  ) : (
                    <tr className="empty-row"><td colSpan={4}>No historical invoice data for this supplier yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {flaggedProducts.length > 0 && (
        <div className="callout" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad)", marginTop: 16 }}>
          <b>{flaggedProducts.length} product(s) from {supplier.name} moved {"≥"}{10}% since their last price change</b> — review and
          contact the supplier if this wasn&apos;t expected: {flaggedProducts.map((p) => p.name).join(", ")}.
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><h3>Attached Products &amp; Price History ({products.length})</h3></div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Product</th>
                <th className="right">Current Rate</th>
                <th className="right">Last Change</th>
                <th className="right">Change %</th>
                <th>Last Changed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.length ? (
                products.map((p) => (
                  <tr key={p.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}>
                      <Link href={`/products/${p.legacyCode}`}>{p.legacyCode}</Link>
                    </td>
                    <td><Link href={`/products/${p.legacyCode}`}>{p.name}</Link></td>
                    <td className="mono-r">{money(p.purchaseRate, 2)}</td>
                    <td className="mono-r">{p.lastOldRate != null ? `${fmt(p.lastOldRate, 2)} → ${fmt(p.lastNewRate, 2)}` : "—"}</td>
                    <td className="right">{p.changePct != null ? <span className={`tag ${Math.abs(p.changePct) >= 10 ? "bad" : "neutral"}`}>{pct(p.changePct, 1)}</span> : "—"}</td>
                    <td>{p.lastChangedAt ? p.lastChangedAt.slice(0, 10) : "—"}</td>
                    <td className="right">{p.flagged && <span className="tag bad">⚠ Contact Supplier</span>}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={7}>No products currently linked to this supplier.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

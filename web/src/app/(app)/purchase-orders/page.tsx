import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listPurchaseOrders } from "@/server/db/queries/purchaseOrders";
import { fmt, money } from "@/lib/format";

const STATUSES = ["DRAFT", "APPROVED", "ORDERED", "PARTIALLY RECEIVED", "FULLY RECEIVED", "CANCELLED"];
const STATUS_CLASS: Record<string, string> = {
  DRAFT: "status-draft",
  APPROVED: "status-approved",
  ORDERED: "status-ordered",
  "PARTIALLY RECEIVED": "status-partial",
  "FULLY RECEIVED": "status-received",
  CANCELLED: "status-cancelled",
};

export default async function PurchaseOrdersPage({ searchParams }: PageProps<"/purchase-orders">) {
  const session = await requireSection("orders", "view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const warning = typeof sp.warning === "string" ? sp.warning : undefined;
  const rows = await listPurchaseOrders({ q, status });
  const canEdit = hasAccess(session, "orders", "edit");

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Create, approve and track purchase orders against your product master."
        action={canEdit ? <Link href="/purchase-orders/new" className="btn accent">+ New Purchase Order (LPO)</Link> : undefined}
      />
      {warning && (
        <div className="callout" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad)", marginBottom: 14 }}>
          ⚠ Order created — but a policy limit was flagged: {warning}
        </div>
      )}
      <form className="filterbar" method="get">
        <input type="text" name="q" placeholder="Search PO number or supplier..." defaultValue={q ?? ""} />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn ghost" type="submit">Filter</button>
      </form>
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>LPO Number</th>
                <th>Supplier</th>
                <th>Date</th>
                <th className="right">Net</th>
                <th className="right">VAT</th>
                <th className="right">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((po) => (
                  <tr key={po.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}>
                      <Link href={`/purchase-orders/${po.id}`}>{po.poNumber}</Link>
                    </td>
                    <td>{po.supplier}</td>
                    <td>{po.createdDate}</td>
                    <td className="mono-r">{fmt(po.net, 2)}</td>
                    <td className="mono-r">{fmt(po.vat, 2)}</td>
                    <td className="mono-r">{money(po.total, 2)}</td>
                    <td><span className={`status-badge ${STATUS_CLASS[po.status] ?? "status-draft"}`}>{po.status}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={7}>No purchase orders yet. Create one to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

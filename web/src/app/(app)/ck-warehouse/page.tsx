import Link from "next/link";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCkWarehouseData } from "@/server/db/queries/ckWarehouse";
import { fmt, money } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";
import { withTimeout } from "@/lib/withTimeout";

export default async function CkWarehousePage({ searchParams }: PageProps<"/ck-warehouse">) {
  await requireSection("ckwarehouse", "view");
  const sp = await searchParams;
  const dest = typeof sp.dest === "string" ? sp.dest : undefined;
  const data = await withTimeout(getCkWarehouseData(dest), 20000, "This is taking longer than expected — please try again in a moment.");

  return (
    <>
      <PageHeader title="Incoming Orders / Itemised View" subtitle="What every branch is ordering, aggregated by item and by destination." />
      <div className="callout">Aggregates every open Purchase Order by where it&apos;s being delivered — Central Warehouse, Kitchen, Bar, or a branch directly — so you can see total demand per item before it&apos;s split across suppliers.</div>
      <div className="kpi-grid">
        <div className="kpi"><div className="n">{data.activeCount}</div><div className="l">Incoming Orders (active)</div><div className="d">Excludes cancelled</div></div>
        <div className="kpi"><div className="n">{money(data.totalValue, 0)}</div><div className="l">Total Value (filtered)</div><div className="d">{data.filteredOrders.length} order(s)</div></div>
        {data.destinations.slice(0, 2).map(([d, count]) => (
          <div className="kpi" key={d}><div className="n">{count}</div><div className="l">Orders to {d}</div></div>
        ))}
      </div>

      <form className="filterbar" method="get">
        <select name="dest" defaultValue={dest ?? ""}>
          <option value="">All destinations</option>
          {data.destinations.map(([d]) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <button className="btn ghost" type="submit">Apply</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{data.itemRows.length} unique items across {data.filteredOrders.length} order(s)</span>
      </form>

      <div className="panel">
        <div className="panel-head"><h3>Itemised View</h3></div>
        <div className="table-wrap" style={{ maxHeight: 460 }}>
          <table className="data">
            <thead><tr><th>Item</th><th className="right">Total Qty Ordered</th><th className="right">Total Value</th><th className="right">Across # LPOs</th><th className="right">Stock on Hand</th></tr></thead>
            <tbody>
              {data.itemRows.length ? (
                data.itemRows.map((x) => (
                  <tr key={x.stockItemId}>
                    <td><Link href={`/products/${x.legacyCode}`}>{x.name}</Link></td>
                    <td className="mono-r">{fmt(x.totalQty, 2)} {x.unitLabel ?? ""}</td>
                    <td className="mono-r">{money(x.totalValue, 2)}</td>
                    <td className="mono-r">{x.poCount}</td>
                    <td className="mono-r">{x.stockOnHand != null ? `${fmt(x.stockOnHand, 2)} ${canonicalUnitLabel(x.issueUnit)}` : "—"}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={5}>No active orders for this destination.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head"><h3>Incoming Orders</h3></div>
        <div className="table-wrap" style={{ maxHeight: 400 }}>
          <table className="data">
            <thead><tr><th>LPO Number</th><th>Supplier</th><th>Deliver To</th><th>Status</th><th className="right">Total</th></tr></thead>
            <tbody>
              {data.filteredOrders.length ? (
                data.filteredOrders.map((po) => (
                  <tr key={po.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}><Link href={`/purchase-orders/${po.id}`}>{po.poNumber}</Link></td>
                    <td>{po.supplier}</td>
                    <td>{po.deliverTo ?? "-"}</td>
                    <td><span className="status-badge status-ordered">{po.status}</span></td>
                    <td className="mono-r">{money(po.total, 2)}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={5}>No incoming orders.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

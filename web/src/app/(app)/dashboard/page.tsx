import Link from "next/link";
import { requireAuth } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDashboardData } from "@/server/db/queries/dashboard";
import { fmt, money, pct } from "@/lib/format";
import { CategoryBarChart } from "@/components/dashboard/CategoryBarChart";
import { TopCostBarChart } from "@/components/dashboard/TopCostBarChart";

export default async function DashboardPage() {
  await requireAuth(); // dashboard itself has no section gate, matching index.html
  const d = await getDashboardData();

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live overview of your product master, recipe costing and data health." />

      <div className="kpi-grid">
        <Link href="/products" className="kpi">
          <div className="n">{fmt(d.activeSkuCount, 0)}</div>
          <div className="l">Active SKUs</div>
          <div className="d">
            {fmt(d.categoryCount, 0)} categories · {fmt(d.supplierCount, 0)} suppliers
          </div>
        </Link>
        <Link href="/recipes" className="kpi">
          <div className="n">{fmt(d.mainRecipeCount, 0)}</div>
          <div className="l">Main Recipes</div>
          <div className="d">{fmt(d.mainSectionCount, 0)} menu sections</div>
        </Link>
        <Link href="/recipes" className="kpi">
          <div className="n">{fmt(d.subRecipeCount, 0)}</div>
          <div className="l">Sub-Recipes</div>
          <div className="d">{fmt(d.subSectionCount, 0)} production sections</div>
        </Link>
        <Link href="/invoices" className="kpi">
          <div className="n">{money(d.totalPurchaseSpend, 0)}</div>
          <div className="l">Total Purchases</div>
          <div className="d">{fmt(d.invoiceCount, 0)} invoices logged</div>
        </Link>
        <Link href="/invoices?status=OUTSTANDING" className="kpi">
          <div className="n" style={{ color: d.totalOutstanding > 0 ? "var(--bad)" : "inherit" }}>
            {money(d.totalOutstanding, 0)}
          </div>
          <div className="l">Outstanding Payables</div>
          <div className="d">Across {fmt(d.outstandingSupplierCount, 0)} suppliers</div>
        </Link>
        <Link href="/products" className="kpi">
          <div className="n">{fmt(d.missingIngredientCount, 0)}</div>
          <div className="l">Ingredients w/o master price</div>
          <div className="d">{d.missingIngredientCount ? "Flagged in recipe ledgers" : "Master data fully linked"}</div>
        </Link>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>Inventory by Category</h3>
            <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{fmt(d.activeSkuCount, 0)} SKUs</span>
          </div>
          <div className="panel-body chart-card">
            <CategoryBarChart data={d.categoryBreakdown} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Highest Food Cost — Main Recipes</h3>
          </div>
          <div className="panel-body chart-card">
            {d.topCost.length ? (
              <TopCostBarChart data={d.topCost.map((r) => ({ code: r.code, name: r.name, perUnit: r.perUnit }))} />
            ) : (
              <div className="callout">No recipe costing data yet.</div>
            )}
          </div>
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>Accounts Payable Snapshot</h3>
            <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>{fmt(d.outstandingBySupplier.length, 0)} shown</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="data">
              <tbody>
                {d.outstandingBySupplier.length ? (
                  d.outstandingBySupplier.map((s) => (
                    <tr key={s.name}>
                      <td>{s.supplierId ? <Link href={`/suppliers/${s.supplierId}`}>{s.name}</Link> : s.name}</td>
                      <td className="right mono-r">
                        <span className="tag bad">{fmt(s.outstanding, 0)}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="empty-row">
                    <td colSpan={2}>No outstanding payables.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Recipes Most Impacted by Price Changes</h3>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="data">
              <tbody>
                {d.topVariance.length ? (
                  d.topVariance.map((r) => (
                    <tr key={r.code}>
                      <td><Link href={`/recipes/main/${r.code}`}>{r.name}</Link></td>
                      <td className="right">
                        <span className={`tag ${r.variancePct >= 0 ? "bad" : "good"}`}>{pct(r.variancePct)}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="empty-row">
                    <td colSpan={2}>No price changes recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

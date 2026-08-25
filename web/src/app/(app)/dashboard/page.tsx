import Link from "next/link";
import { requireAuth, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDashboardData } from "@/server/db/queries/dashboard";
import { getPurchasingStats, getCostCenterStats, listCostAdjustmentEvents } from "@/server/db/queries/reports";
import { listSuppliers } from "@/server/db/queries/suppliers";
import { getMenuEngineeringData } from "@/server/db/queries/sales";
import { loadCostingGraph } from "@/server/costing/recipeCost";
import { fmt, money, pct } from "@/lib/format";
import { CategoryBarChart } from "@/components/dashboard/CategoryBarChart";
import { TopCostBarChart } from "@/components/dashboard/TopCostBarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { MenuEngineeringScatter } from "@/components/charts/MenuEngineeringScatter";

type Tab = "overview" | "purchasing" | "suppliers" | "cost" | "menuengineering" | "costcenter";
const ANALYTICS_TABS: { id: Tab; label: string }[] = [
  { id: "purchasing", label: "Purchasing Dashboard" },
  { id: "suppliers", label: "Supplier Dashboard" },
  { id: "cost", label: "Cost Dashboard" },
  { id: "menuengineering", label: "Menu Engineering" },
  { id: "costcenter", label: "Cost by Sector (Live)" },
];

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const session = await requireAuth(); // dashboard itself has no section gate, matching index.html
  const canSeeAnalytics = hasAccess(session, "reports", "view");
  const sp = await searchParams;
  const tab: Tab = typeof sp.tab === "string" ? (sp.tab as Tab) : "overview";

  const tabs: { id: Tab; label: string }[] = [{ id: "overview", label: "Overview" }, ...(canSeeAnalytics ? ANALYTICS_TABS : [])];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live overview of your product master, recipe costing and data health." />

      {tabs.length > 1 && (
        <div className="pill-tabs">
          {tabs.map((t) => (
            <Link key={t.id} href={`/dashboard?tab=${t.id}`} className={`btn ${tab === t.id ? "" : "ghost"}`} style={{ borderRadius: 20 }}>
              {t.label}
            </Link>
          ))}
        </div>
      )}

      {tab === "overview" && <OverviewTab />}
      {canSeeAnalytics && tab === "purchasing" && <PurchasingTab />}
      {canSeeAnalytics && tab === "suppliers" && <SupplierDashboardTab />}
      {canSeeAnalytics && tab === "cost" && <CostDashboardTab />}
      {canSeeAnalytics && tab === "menuengineering" && <MenuEngineeringTab />}
      {canSeeAnalytics && tab === "costcenter" && <CostCenterTab />}
    </>
  );
}

async function OverviewTab() {
  const d = await getDashboardData();

  return (
    <>
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

async function PurchasingTab() {
  const stats = await getPurchasingStats();
  const agingColor: Record<string, string> = { "0-14": "var(--chart-1)", "15-30": "var(--chart-1)", "31-60": "var(--chart-5)", "61-90": "var(--bad)", "90+": "var(--bad)" };

  return (
    <>
      <div className="kpi-grid">
        <Link href="/invoices" className="kpi"><div className="n">{money(stats.totalSpend, 0)}</div><div className="l">Total Purchases</div><div className="d">{stats.invoiceCount} invoices</div></Link>
        <Link href="/invoices?status=OUTSTANDING" className="kpi"><div className="n" style={{ color: "var(--bad)" }}>{money(stats.outstanding, 0)}</div><div className="l">Outstanding Payables</div><div className="d">{stats.outstandingCount} unpaid invoices</div></Link>
        <Link href="/invoices" className="kpi"><div className="n">{money(stats.cashSpend, 0)}</div><div className="l">Cash / Paid</div><div className="d">{fmt(stats.totalSpend ? (stats.cashSpend / stats.totalSpend) * 100 : 0, 0)}% of spend</div></Link>
        <Link href="/invoices" className="kpi"><div className="n">{money(stats.creditSpend, 0)}</div><div className="l">Credit Purchases</div><div className="d">{fmt(stats.totalSpend ? (stats.creditSpend / stats.totalSpend) * 100 : 0, 0)}% of spend</div></Link>
      </div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Accounts Payable Aging</h3></div>
          <div className="panel-body chart-card">
            <HorizontalBarChart
              data={Object.entries(stats.buckets).map(([label, value]) => ({ label: `${label} days`, value, color: agingColor[label], href: "/invoices?status=OUTSTANDING" }))}
              format="money0"
              height={180}
            />
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 8 }}>Aging is calculated from invoice date to today, based on the historical expense register.</div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Top Purchased Items by Spend</h3></div>
          <div className="panel-body chart-card">
            <HorizontalBarChart data={stats.topItems.map((item) => ({ label: item.label, value: item.value, href: item.code ? `/products/${item.code}` : `/products?q=${encodeURIComponent(item.label)}` }))} format="money0" color="var(--chart-2)" />
          </div>
        </div>
      </div>
      <div style={{ height: 16 }} />
      <div className="panel">
        <div className="panel-head"><h3>Weekly Purchase Trend</h3></div>
        <div className="panel-body chart-card">
          <TrendLineChart data={stats.weeks.map(([label, value]) => ({ label, value }))} format="money0" href="/invoices" />
        </div>
      </div>
    </>
  );
}

async function SupplierDashboardTab() {
  const suppliers = await listSuppliers();
  const bySpend = [...suppliers].sort((a, b) => b.totalSpend - a.totalSpend).filter((s) => s.totalSpend > 0);
  const totalSpend = bySpend.reduce((s, x) => s + x.totalSpend, 0);
  const top5 = bySpend.slice(0, 5);
  const top5Spend = top5.reduce((s, x) => s + x.totalSpend, 0);
  const flaggedSuppliers = suppliers.filter((s) => s.qualityPct != null && s.qualityPct < 90);
  const suppliersWithLeadTime = suppliers.filter((s) => s.avgLeadTimeDays != null);
  const avgLeadTime = suppliersWithLeadTime.length ? suppliersWithLeadTime.reduce((s, x) => s + (x.avgLeadTimeDays ?? 0), 0) / suppliersWithLeadTime.length : null;

  return (
    <>
      <div className="kpi-grid">
        <Link href="/suppliers" className="kpi"><div className="n">{suppliers.length}</div><div className="l">Active Suppliers</div><div className="d">{bySpend.length} with purchase history</div></Link>
        <Link href="/suppliers" className="kpi"><div className="n">{money(totalSpend, 0)}</div><div className="l">Total Spend</div><div className="d">All-time, historical + live</div></Link>
        <Link href="/suppliers" className="kpi"><div className="n">{totalSpend ? fmt((top5Spend / totalSpend) * 100, 0) : 0}%</div><div className="l">Spend in Top 5 Suppliers</div><div className="d">Concentration risk</div></Link>
        <Link href="/suppliers" className="kpi"><div className="n" style={{ color: flaggedSuppliers.length ? "var(--bad)" : "inherit" }}>{flaggedSuppliers.length}</div><div className="l">Below 90% Quality</div><div className="d">{avgLeadTime != null ? `${fmt(avgLeadTime, 1)}d avg lead time` : "No lead-time data yet"}</div></Link>
      </div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Top 5 Suppliers by Spend</h3></div>
          <div className="panel-body chart-card">
            {top5.length ? (
              <DonutChart
                data={[...top5.map((s) => ({ label: s.name, value: s.totalSpend, href: `/suppliers/${s.id}` })), ...(totalSpend - top5Spend > 0.01 ? [{ label: "All others", value: totalSpend - top5Spend, color: "var(--line)" }] : [])]}
                format="money0"
                centerLabel="total spend"
              />
            ) : (
              <div style={{ color: "var(--ink-faint)", fontSize: 12.5 }}>No purchase history yet.</div>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Top Suppliers by Spend</h3></div>
          <div className="panel-body chart-card">
            {bySpend.length ? (
              <HorizontalBarChart data={bySpend.slice(0, 8).map((s) => ({ label: s.name, value: s.totalSpend, href: `/suppliers/${s.id}` }))} format="money0" color="var(--chart-1)" />
            ) : (
              <div style={{ color: "var(--ink-faint)", fontSize: 12.5 }}>No purchase history yet.</div>
            )}
          </div>
        </div>
      </div>
      <div style={{ height: 16 }} />
      <div className="panel">
        <div className="panel-head"><h3>Supplier Quality &amp; Delivery</h3></div>
        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table className="data">
            <thead><tr><th>Supplier</th><th className="right">Total Spend</th><th className="right">Outstanding</th><th className="right">Deliveries</th><th className="right">Quality</th><th className="right">Avg Lead Time</th></tr></thead>
            <tbody>
              {suppliers.length ? (
                [...suppliers].sort((a, b) => b.totalSpend - a.totalSpend).map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/suppliers/${s.id}`}>{s.name}</Link></td>
                    <td className="mono-r">{money(s.totalSpend, 0)}</td>
                    <td className="mono-r" style={{ color: s.outstanding > 0 ? "var(--bad)" : "inherit" }}>{money(s.outstanding, 0)}</td>
                    <td className="mono-r">{s.deliveryCount}</td>
                    <td className="right">{s.qualityPct != null ? <span className={`tag ${s.qualityPct < 90 ? "bad" : "good"}`}>{fmt(s.qualityPct, 0)}%</span> : "-"}</td>
                    <td className="mono-r">{s.avgLeadTimeDays != null ? `${fmt(s.avgLeadTimeDays, 1)}d` : "-"}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No suppliers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function CostDashboardTab() {
  const graph = await loadCostingGraph();
  const [d, adjustments] = await Promise.all([getDashboardData(graph), listCostAdjustmentEvents({}, graph)]);
  const totalDrift = adjustments.reduce((s, e) => s + e.affected.reduce((s2, a) => s2 + a.impact, 0), 0);
  const increases = adjustments.filter((e) => e.pctChange > 0).length;
  const decreases = adjustments.filter((e) => e.pctChange < 0).length;

  // Cumulative cost-impact trend across all recipes, oldest to newest —
  // "actual" cost drift over time driven by real ingredient price changes.
  const byDate = new Map<string, number>();
  for (const e of [...adjustments].sort((a, b) => a.date.localeCompare(b.date))) {
    const dayImpact = e.affected.reduce((s, a) => s + a.impact, 0);
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + dayImpact);
  }
  let cumulative = 0;
  const trend = [...byDate.entries()].map(([label, v]) => {
    cumulative += v;
    return { label, value: cumulative };
  });

  const compareRows = d.topVariance.map((r) => ({ ...r }));

  return (
    <>
      <div className="callout">
        <b>Actual vs. Theoretical:</b> &quot;Theoretical&quot; is each recipe&apos;s cost when it was first built; &quot;Actual&quot; is what it costs today
        against live ingredient prices. Without sales data imported yet, this compares recipe-card cost drift rather than realized food-cost % —
        the closest actual-vs-theoretical view available until POS sales import lands.
      </div>
      <div className="kpi-grid">
        <Link href="/recipes" className="kpi"><div className="n">{d.topCost.length ? d.mainRecipeCount : 0}</div><div className="l">Main Recipes Costed</div><div className="d">{d.missingIngredientCount} ingredient(s) missing a live price</div></Link>
        <Link href="/reports?tab=costadjustments" className="kpi"><div className="n" style={{ color: totalDrift >= 0 ? "var(--bad)" : "var(--good)" }}>{money(totalDrift, 0)}</div><div className="l">Net Cost Drift</div><div className="d">{totalDrift >= 0 ? "Costing more than build-time" : "Costing less than build-time"}</div></Link>
        <Link href="/reports?tab=costadjustments" className="kpi"><div className="n" style={{ color: "var(--bad)" }}>{increases}</div><div className="l">Price Increases</div><div className="d">of {adjustments.length} recorded changes</div></Link>
        <Link href="/reports?tab=costadjustments" className="kpi"><div className="n" style={{ color: "var(--good)" }}>{decreases}</div><div className="l">Price Decreases</div><div className="d">of {adjustments.length} recorded changes</div></Link>
      </div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Recipes Most Impacted by Price Changes</h3></div>
          <div className="panel-body chart-card">
            {compareRows.length ? (
              <HorizontalBarChart
                data={compareRows.map((r) => ({ label: r.name, value: r.variancePct, color: r.variancePct >= 0 ? "var(--bad)" : "var(--good)", href: `/recipes/main/${r.code}` }))}
                format="percent"
              />
            ) : (
              <div style={{ color: "var(--ink-faint)", fontSize: 12.5 }}>No recipe cost variance yet.</div>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Cumulative Cost Drift Over Time</h3></div>
          <div className="panel-body chart-card">
            {trend.length ? (
              <TrendLineChart data={trend} format="money0" color={totalDrift >= 0 ? "var(--bad)" : "var(--good)"} href="/reports?tab=costadjustments" />
            ) : (
              <div style={{ color: "var(--ink-faint)", fontSize: 12.5 }}>No price history recorded yet.</div>
            )}
          </div>
        </div>
      </div>
      <div style={{ height: 16 }} />
      <div className="panel">
        <div className="panel-head"><h3>Highest Food Cost — Main Recipes (Actual, Live)</h3></div>
        <div className="panel-body chart-card">
          {d.topCost.length ? (
            <HorizontalBarChart data={d.topCost.map((r) => ({ label: r.name, value: r.perUnit, href: `/recipes/main/${r.code}` }))} format="money2" color="var(--chart-4)" />
          ) : (
            <div style={{ color: "var(--ink-faint)", fontSize: 12.5 }}>No recipe costing data yet.</div>
          )}
        </div>
      </div>
    </>
  );
}

async function MenuEngineeringTab() {
  const { items, avgQty, avgMargin } = await getMenuEngineeringData();
  const byClass = { Star: 0, "Plow-Horse": 0, Puzzle: 0, Dog: 0 } as Record<string, number>;
  for (const it of items) byClass[it.classification]++;

  return (
    <>
      <div className="callout">
        <b>Stars</b> (top-right): popular and profitable — protect these. <b>Plow-Horses</b> (bottom-right): popular but thin margin — consider a price nudge.{" "}
        <b>Puzzles</b> (top-left): profitable but rarely ordered — promote or reposition on the menu. <b>Dogs</b> (bottom-left): neither — candidates to cut or rework.
      </div>
      {items.length === 0 ? (
        <div className="callout">No matched recipe sales yet — import sales data on the Recipe Sales report first.</div>
      ) : (
        <>
          <div className="kpi-grid">
            <Link href="/recipes" className="kpi"><div className="n" style={{ color: "var(--good)" }}>{byClass.Star}</div><div className="l">Stars</div></Link>
            <Link href="/recipes" className="kpi"><div className="n" style={{ color: "var(--chart-5)" }}>{byClass["Plow-Horse"]}</div><div className="l">Plow-Horses</div></Link>
            <Link href="/recipes" className="kpi"><div className="n" style={{ color: "var(--chart-4)" }}>{byClass.Puzzle}</div><div className="l">Puzzles</div></Link>
            <Link href="/recipes" className="kpi"><div className="n" style={{ color: "var(--bad)" }}>{byClass.Dog}</div><div className="l">Dogs</div></Link>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Menu Engineering — Popularity vs. Profitability</h3></div>
            <div className="panel-body chart-card">
              <MenuEngineeringScatter items={items} avgQty={avgQty} avgMargin={avgMargin} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

async function CostCenterTab() {
  const rows = await getCostCenterStats();
  const totalGrnSpend = rows.reduce((s, r) => s + r.grnSpend, 0);
  const totalWastage = rows.reduce((s, r) => s + r.wastageCost, 0);
  const byBranch = new Map<string, typeof rows>();
  for (const r of rows) byBranch.set(r.branchName, [...(byBranch.get(r.branchName) ?? []), r]);

  return (
    <>
      <div className="callout">
        <b>What this shows:</b> real GRN receipts and wastage posted against each branch&apos;s sectors — a Kitchen sector&apos;s
        spend reads as your food cost, a Bar sector&apos;s as your beverage cost. Unlike &quot;Cost by Brand &amp; Section&quot;,
        this is live and grows as you post GRNs/wastage with a sector selected, not a snapshot of historical import data.
      </div>
      <div className="kpi-grid">
        <Link href="/grn" className="kpi"><div className="n">{money(totalGrnSpend, 0)}</div><div className="l">Total Received (all sectors)</div></Link>
        <Link href="/wastage" className="kpi"><div className="n" style={{ color: totalWastage > 0 ? "var(--bad)" : "inherit" }}>{money(totalWastage, 0)}</div><div className="l">Total Wastage (all sectors)</div></Link>
        <Link href="/wastage" className="kpi"><div className="n">{totalGrnSpend ? fmt((totalWastage / totalGrnSpend) * 100, 1) : "0.0"}%</div><div className="l">Wastage as % of Spend</div></Link>
      </div>
      {[...byBranch.entries()].map(([branchName, sectors]) => (
        <div className="panel" key={branchName} style={{ marginBottom: 16 }}>
          <div className="panel-head"><h3>{branchName}</h3></div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Sector</th><th className="right">Received (GRN)</th><th className="right">Wastage</th><th className="right">Wastage %</th></tr></thead>
              <tbody>
                {sectors.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="mono-r"><Link href={`/grn?costCenterId=${s.id}`}>{money(s.grnSpend, 2)}</Link></td>
                    <td className="mono-r" style={{ color: s.wastageCost > 0 ? "var(--bad)" : "inherit" }}><Link href={`/wastage?costCenterId=${s.id}`}>{money(s.wastageCost, 2)}</Link></td>
                    <td className="right">
                      {s.grnSpend > 0 ? <span className={`tag ${s.wastagePct > 5 ? "bad" : "good"}`}>{fmt(s.wastagePct, 1)}%</span> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

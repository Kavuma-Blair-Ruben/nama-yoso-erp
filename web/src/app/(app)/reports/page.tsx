import Link from "next/link";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  listSlowMovingItems,
  listPriceChangeEvents,
  listCostAdjustmentEvents,
  getSectionStats,
  getCostCenterStats,
  getPurchasingStats,
  getStockPageRows,
} from "@/server/db/queries/reports";
import { listSuppliers } from "@/server/db/queries/suppliers";
import { getDashboardData } from "@/server/db/queries/dashboard";
import { getRecipeSalesReport, getMenuEngineeringData } from "@/server/db/queries/sales";
import { getPosIntegration, listPosBranchMappings, listPosItemMappings, listPosWebhookEvents } from "@/server/db/queries/pos";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { listMainRecipesForPicker } from "@/server/db/queries/recipes";
import { fmt, money, pct } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";
import { DonutChart } from "@/components/charts/DonutChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { MenuEngineeringScatter } from "@/components/charts/MenuEngineeringScatter";
import { PosIntegrationPanel } from "@/components/reports/PosIntegrationPanel";
import { FoodicsWebhookPanel } from "@/components/reports/FoodicsWebhookPanel";
import { RecipeSalesImport } from "@/components/reports/RecipeSalesImport";

type Tab = "purchasing" | "suppliers" | "cost" | "sales" | "menuengineering" | "slowmoving" | "pricechange" | "costadjustments" | "sections" | "costcenter" | "stock";
const TABS: { id: Tab; label: string }[] = [
  { id: "purchasing", label: "Purchasing Dashboard" },
  { id: "suppliers", label: "Supplier Dashboard" },
  { id: "cost", label: "Cost Dashboard" },
  { id: "sales", label: "Recipe Sales" },
  { id: "menuengineering", label: "Menu Engineering" },
  { id: "stock", label: "Stock Page" },
  { id: "slowmoving", label: "Slow Moving Items" },
  { id: "pricechange", label: "Item Price Change" },
  { id: "costadjustments", label: "Cost Adjustments" },
  { id: "sections", label: "Cost by Brand & Section" },
  { id: "costcenter", label: "Cost by Sector (Live)" },
];

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireSection("reports", "view");
  const sp = await searchParams;
  const tab: Tab = (typeof sp.tab === "string" ? (sp.tab as Tab) : "purchasing");

  return (
    <>
      <PageHeader title="Reports" subtitle="Purchasing, stock, and cost analytics across your live and historical data." />
      <div className="pill-tabs">
        {TABS.map((t) => (
          <Link key={t.id} href={`/reports?tab=${t.id}`} className={`btn ${tab === t.id ? "" : "ghost"}`} style={{ borderRadius: 20 }}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "purchasing" && <PurchasingTab />}
      {tab === "suppliers" && <SupplierDashboardTab />}
      {tab === "cost" && <CostDashboardTab />}
      {tab === "sales" && <RecipeSalesTab />}
      {tab === "menuengineering" && <MenuEngineeringTab />}
      {tab === "stock" && <StockTab />}
      {tab === "slowmoving" && <SlowMovingTab minDays={typeof sp.minDays === "string" ? Number(sp.minDays) : 0} />}
      {tab === "pricechange" && <PriceChangeTab />}
      {tab === "costadjustments" && <CostAdjustmentsTab q={typeof sp.q === "string" ? sp.q : undefined} />}
      {tab === "sections" && <SectionsTab sector={typeof sp.sector === "string" ? sp.sector : undefined} />}
      {tab === "costcenter" && <CostCenterTab />}
    </>
  );
}

async function PurchasingTab() {
  const stats = await getPurchasingStats();
  const agingColor: Record<string, string> = { "0-14": "var(--chart-1)", "15-30": "var(--chart-1)", "31-60": "var(--chart-5)", "61-90": "var(--bad)", "90+": "var(--bad)" };

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi"><div className="n">{money(stats.totalSpend, 0)}</div><div className="l">Total Purchases</div><div className="d">{stats.invoiceCount} invoices</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--bad)" }}>{money(stats.outstanding, 0)}</div><div className="l">Outstanding Payables</div><div className="d">{stats.outstandingCount} unpaid invoices</div></div>
        <div className="kpi"><div className="n">{money(stats.cashSpend, 0)}</div><div className="l">Cash / Paid</div><div className="d">{fmt(stats.totalSpend ? (stats.cashSpend / stats.totalSpend) * 100 : 0, 0)}% of spend</div></div>
        <div className="kpi"><div className="n">{money(stats.creditSpend, 0)}</div><div className="l">Credit Purchases</div><div className="d">{fmt(stats.totalSpend ? (stats.creditSpend / stats.totalSpend) * 100 : 0, 0)}% of spend</div></div>
      </div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Accounts Payable Aging</h3></div>
          <div className="panel-body chart-card">
            <HorizontalBarChart
              data={Object.entries(stats.buckets).map(([label, value]) => ({ label: `${label} days`, value, color: agingColor[label] }))}
              format="money0"
              height={180}
            />
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 8 }}>Aging is calculated from invoice date to today, based on the historical expense register.</div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Top Purchased Items by Spend</h3></div>
          <div className="panel-body chart-card">
            <HorizontalBarChart data={stats.topItems.map(([label, value]) => ({ label, value }))} format="money0" color="var(--chart-2)" />
          </div>
        </div>
      </div>
      <div style={{ height: 16 }} />
      <div className="panel">
        <div className="panel-head"><h3>Weekly Purchase Trend</h3></div>
        <div className="panel-body chart-card">
          <TrendLineChart data={stats.weeks.map(([label, value]) => ({ label, value }))} format="money0" />
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
        <div className="kpi"><div className="n">{suppliers.length}</div><div className="l">Active Suppliers</div><div className="d">{bySpend.length} with purchase history</div></div>
        <div className="kpi"><div className="n">{money(totalSpend, 0)}</div><div className="l">Total Spend</div><div className="d">All-time, historical + live</div></div>
        <div className="kpi"><div className="n">{totalSpend ? fmt((top5Spend / totalSpend) * 100, 0) : 0}%</div><div className="l">Spend in Top 5 Suppliers</div><div className="d">Concentration risk</div></div>
        <div className="kpi"><div className="n" style={{ color: flaggedSuppliers.length ? "var(--bad)" : "inherit" }}>{flaggedSuppliers.length}</div><div className="l">Below 90% Quality</div><div className="d">{avgLeadTime != null ? `${fmt(avgLeadTime, 1)}d avg lead time` : "No lead-time data yet"}</div></div>
      </div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Top 5 Suppliers by Spend</h3></div>
          <div className="panel-body chart-card">
            {top5.length ? (
              <DonutChart
                data={[...top5.map((s) => ({ label: s.name, value: s.totalSpend })), ...(totalSpend - top5Spend > 0.01 ? [{ label: "All others", value: totalSpend - top5Spend, color: "var(--line)" }] : [])]}
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
              <HorizontalBarChart data={bySpend.slice(0, 8).map((s) => ({ label: s.name, value: s.totalSpend }))} format="money0" color="var(--chart-1)" />
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
  const [d, adjustments] = await Promise.all([getDashboardData(), listCostAdjustmentEvents({})]);
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
        <div className="kpi"><div className="n">{d.topCost.length ? d.mainRecipeCount : 0}</div><div className="l">Main Recipes Costed</div><div className="d">{d.missingIngredientCount} ingredient(s) missing a live price</div></div>
        <div className="kpi"><div className="n" style={{ color: totalDrift >= 0 ? "var(--bad)" : "var(--good)" }}>{money(totalDrift, 0)}</div><div className="l">Net Cost Drift</div><div className="d">{totalDrift >= 0 ? "Costing more than build-time" : "Costing less than build-time"}</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--bad)" }}>{increases}</div><div className="l">Price Increases</div><div className="d">of {adjustments.length} recorded changes</div></div>
        <div className="kpi"><div className="n" style={{ color: "var(--good)" }}>{decreases}</div><div className="l">Price Decreases</div><div className="d">of {adjustments.length} recorded changes</div></div>
      </div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Recipes Most Impacted by Price Changes</h3></div>
          <div className="panel-body chart-card">
            {compareRows.length ? (
              <HorizontalBarChart
                data={compareRows.map((r) => ({ label: r.name, value: r.variancePct, color: r.variancePct >= 0 ? "var(--bad)" : "var(--good)" }))}
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
              <TrendLineChart data={trend} format="money0" color={totalDrift >= 0 ? "var(--bad)" : "var(--good)"} />
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
            <HorizontalBarChart data={d.topCost.map((r) => ({ label: r.name, value: r.perUnit }))} format="money2" color="var(--chart-4)" />
          ) : (
            <div style={{ color: "var(--ink-faint)", fontSize: 12.5 }}>No recipe costing data yet.</div>
          )}
        </div>
      </div>
    </>
  );
}

async function RecipeSalesTab() {
  const [report, foodicsIntegration, branches, costCenters, recipes, branchMappings, itemMappings, recentEvents] = await Promise.all([
    getRecipeSalesReport(),
    getPosIntegration("foodics"),
    listBranches(),
    listAllActiveCostCenters(),
    listMainRecipesForPicker(),
    listPosBranchMappings("foodics"),
    listPosItemMappings("foodics"),
    listPosWebhookEvents("foodics"),
  ]);

  return (
    <>
      <PosIntegrationPanel
        hasToken={!!foodicsIntegration?.apiToken}
        lastSyncAt={foodicsIntegration?.lastSyncAt ? foodicsIntegration.lastSyncAt.toISOString().slice(0, 16).replace("T", " ") : null}
        lastSyncStatus={foodicsIntegration?.lastSyncStatus ?? null}
      />
      <FoodicsWebhookPanel
        hasToken={!!foodicsIntegration?.apiToken}
        webhookConfigured={!!foodicsIntegration?.webhookSecret}
        branches={branches}
        costCenters={costCenters}
        recipes={recipes}
        branchMappings={branchMappings}
        itemMappings={itemMappings}
        recentEvents={recentEvents}
      />
      <RecipeSalesImport hasData={report.hasData} unmatchedCount={report.unmatchedCount} />
      {!report.hasData ? (
        <div className="callout">No sales data imported yet — upload a POS export above to see this report.</div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi"><div className="n">{money(report.totalRevenue, 0)}</div><div className="l">Total Revenue</div><div className="d">{fmt(report.totalQty, 0)} items sold</div></div>
            <div className="kpi"><div className="n">{money(report.totalCost, 0)}</div><div className="l">Total Food Cost</div><div className="d">{report.totalRevenue ? fmt((report.totalCost / report.totalRevenue) * 100, 1) : "—"}% of revenue</div></div>
            <div className="kpi"><div className="n" style={{ color: report.totalProfit >= 0 ? "var(--good)" : "var(--bad)" }}>{money(report.totalProfit, 0)}</div><div className="l">Gross Profit</div><div className="d">Across matched recipes</div></div>
            <div className="kpi"><div className="n" style={{ color: report.unmatchedCount ? "var(--bad)" : "inherit" }}>{report.unmatchedCount}</div><div className="l">Unmatched Item Labels</div><div className="d">Not linked to a recipe</div></div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Top Sellers by Revenue</h3></div>
            <div className="panel-body chart-card">
              <HorizontalBarChart data={report.rows.slice(0, 10).map((r) => ({ label: r.name, value: r.revenue }))} format="money0" color="var(--chart-1)" />
            </div>
          </div>
          <div style={{ height: 16 }} />
          <div className="panel">
            <div className="panel-head"><h3>Recipe Sales Report</h3></div>
            <div className="table-wrap" style={{ maxHeight: 520 }}>
              <table className="data">
                <thead><tr><th>Recipe</th><th className="right">Qty Sold</th><th className="right">Avg Price</th><th className="right">Revenue</th><th className="right">Food Cost</th><th className="right">Food Cost %</th><th className="right">Gross Profit</th></tr></thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.code ? <Link href={`/recipes/main/${r.code}`}>{r.name}</Link> : <span>{r.name} <span className="tag bad" style={{ marginLeft: 4 }}>unmatched</span></span>}</td>
                      <td className="mono-r">{fmt(r.qty, 0)}</td>
                      <td className="mono-r">{money(r.avgPrice, 2)}</td>
                      <td className="mono-r">{money(r.revenue, 0)}</td>
                      <td className="mono-r">{r.totalCost != null ? money(r.totalCost, 0) : "—"}</td>
                      <td className="right">{r.foodCostPct != null ? <span className={`tag ${r.foodCostPct > 35 ? "bad" : "good"}`}>{fmt(r.foodCostPct, 1)}%</span> : "—"}</td>
                      <td className="mono-r" style={{ color: r.grossProfit != null && r.grossProfit < 0 ? "var(--bad)" : "inherit" }}>{r.grossProfit != null ? money(r.grossProfit, 0) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
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
        <div className="callout">No matched recipe sales yet — import sales data on the Recipe Sales tab first.</div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi"><div className="n" style={{ color: "var(--good)" }}>{byClass.Star}</div><div className="l">Stars</div></div>
            <div className="kpi"><div className="n" style={{ color: "var(--chart-5)" }}>{byClass["Plow-Horse"]}</div><div className="l">Plow-Horses</div></div>
            <div className="kpi"><div className="n" style={{ color: "var(--chart-4)" }}>{byClass.Puzzle}</div><div className="l">Puzzles</div></div>
            <div className="kpi"><div className="n" style={{ color: "var(--bad)" }}>{byClass.Dog}</div><div className="l">Dogs</div></div>
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

async function StockTab() {
  const rows = await getStockPageRows();
  const negCount = rows.filter((r) => r.onHand < 0).length;
  const belowMinCount = rows.filter((r) => r.flag === "BELOW MIN").length;
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const flagged = rows.filter((r) => r.flag).sort((a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1));

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi"><div className="n">{money(totalValue, 0)}</div><div className="l">Total Stock Value</div></div>
        <div className="kpi"><div className="n" style={{ color: negCount ? "var(--bad)" : "inherit" }}>{negCount}</div><div className="l">Negative Stock Items</div></div>
        <div className="kpi"><div className="n" style={{ color: belowMinCount ? "var(--bad)" : "inherit" }}>{belowMinCount}</div><div className="l">Below Minimum</div></div>
      </div>
      <div className="callout">{flagged.length} item(s) flagged below — everything else is carrying non-negative stock at or above its minimum level.</div>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="data">
            <thead><tr><th>Item</th><th>Category</th><th className="right">Stock on Hand</th><th className="right">Min Level</th><th className="right">Value</th><th></th></tr></thead>
            <tbody>
              {flagged.length ? (
                flagged.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/products/${r.legacyCode}`}>{r.name}</Link></td>
                    <td>{r.categoryName ?? "-"}</td>
                    <td className="mono-r" style={{ color: r.onHand < 0 ? "var(--bad)" : "inherit" }}>{fmt(r.onHand, 2)} {canonicalUnitLabel(r.issueUnit)}</td>
                    <td className="mono-r">{r.minLevel != null ? fmt(r.minLevel, 2) : "-"}</td>
                    <td className="mono-r">{money(r.value, 2)}</td>
                    <td className="right">{r.flag && <span className="tag bad">{r.flag}</span>}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No items are negative or below their minimum level.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function SlowMovingTab({ minDays }: { minDays: number }) {
  const rows = await listSlowMovingItems(minDays);
  const totalTiedUp = rows.reduce((s, r) => s + r.stockValue, 0);

  return (
    <>
      <div className="callout">Items carrying stock value with the longest gap since their last purchase — capital sitting on the shelf rather than turning over.</div>
      <div className="kpi-grid">
        <div className="kpi"><div className="n">{rows.length}</div><div className="l">Slow Moving Items</div></div>
        <div className="kpi"><div className="n">{money(totalTiedUp, 0)}</div><div className="l">Stock Value Tied Up</div></div>
      </div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="slowmoving" />
        <select name="minDays" defaultValue={String(minDays)}>
          <option value="0">All items with stock</option>
          <option value="30">30+ days since purchase</option>
          <option value="60">60+ days since purchase</option>
          <option value="90">90+ days since purchase</option>
        </select>
        <button className="btn ghost" type="submit">Apply</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} item(s)</span>
      </form>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 520 }}>
          <table className="data">
            <thead><tr><th>Item</th><th>Category</th><th className="right">Stock on Hand</th><th className="right">Stock Value</th><th>Last Purchased</th><th className="right">Days Since</th></tr></thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/products/${r.legacyCode}`}>{r.name}</Link></td>
                    <td>{r.categoryName ?? "-"}</td>
                    <td className="mono-r">{fmt(r.qty, 2)} {canonicalUnitLabel(r.issueUnit)}</td>
                    <td className="mono-r">{money(r.stockValue, 2)}</td>
                    <td>{r.last ?? "Never"}</td>
                    <td className="right">{r.daysSince != null ? <span className={`tag ${r.daysSince > 60 ? "bad" : "neutral"}`}>{r.daysSince}d</span> : <span className="tag bad">No purchase history</span>}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No slow-moving items match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function PriceChangeTab() {
  const rows = await listPriceChangeEvents();
  const totalImpact = rows.reduce((s, e) => s + e.varianceValue, 0);
  const increases = rows.filter((e) => e.variancePct > 0).length;

  return (
    <>
      <div className="callout">Every GRN line where what you were actually invoiced didn&apos;t match what the LPO said, across every supplier and outlet in one place.</div>
      <div className="kpi-grid">
        <div className="kpi"><div className="n">{rows.length}</div><div className="l">Total Discrepancies</div><div className="d">All-time</div></div>
        <div className="kpi"><div className="n" style={{ color: totalImpact >= 0 ? "var(--bad)" : "var(--good)" }}>{money(totalImpact, 0)}</div><div className="l">Net Cost Impact</div><div className="d">{totalImpact >= 0 ? "Cost you" : "Saved you"}</div></div>
        <div className="kpi"><div className="n">{increases}</div><div className="l">Price Increases</div><div className="d">of {rows.length} discrepancies</div></div>
      </div>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 500 }}>
          <table className="data">
            <thead><tr><th>Date</th><th>GRN #</th><th>Supplier</th><th>Item</th><th className="right">Ordered Rate</th><th className="right">Received Rate</th><th className="right">Variance %</th><th className="right">Cost Impact</th></tr></thead>
            <tbody>
              {rows.length ? (
                rows.map((e, i) => (
                  <tr key={i}>
                    <td>{e.receivedDate}</td>
                    <td className="mono-r" style={{ textAlign: "left" }}><Link href={`/grn/${e.grnId}`}>{e.grnNumber}</Link></td>
                    <td>{e.supplier}</td>
                    <td><Link href={`/products/${e.legacyCode}`}>{e.name}</Link></td>
                    <td className="mono-r">{fmt(e.orderedRate, 2)}</td>
                    <td className="mono-r">{fmt(e.receivedRate, 2)}</td>
                    <td className="right"><span className={`tag ${e.variancePct >= 0 ? "bad" : "good"}`}>{pct(e.variancePct)}</span></td>
                    <td className="mono-r">{money(e.varianceValue, 2)}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={8}>No price discrepancies found — every posted GRN matched its LPO rate exactly.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function CostAdjustmentsTab({ q }: { q?: string }) {
  const rows = await listCostAdjustmentEvents({ q });

  return (
    <>
      <div className="callout">Every ingredient price change, and which recipes it moved the cost of — e.g. &quot;recipe cost went up 2% because chicken breast rose 20%.&quot;</div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="costadjustments" />
        <input type="text" name="q" placeholder="Search ingredient..." defaultValue={q ?? ""} />
        <button className="btn ghost" type="submit">Search</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} price change event(s)</span>
      </form>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="data">
            <thead><tr><th>Date</th><th>Ingredient</th><th className="right">Old Rate</th><th className="right">New Rate</th><th className="right">Change</th><th>Affected Recipes</th></tr></thead>
            <tbody>
              {rows.length ? (
                rows.map((e, i) => (
                  <tr key={i}>
                    <td>{e.date}</td>
                    <td><Link href={`/products/${e.code}`}>{e.name}</Link></td>
                    <td className="mono-r">{fmt(e.oldRate, 2)}</td>
                    <td className="mono-r">{fmt(e.newRate, 2)}</td>
                    <td className="right"><span className={`tag ${e.pctChange >= 0 ? "bad" : "good"}`}>{pct(e.pctChange)}</span></td>
                    <td>
                      {e.affected.length ? (
                        <>
                          {e.affected.slice(0, 4).map((a, j) => (
                            <span key={j} className={`tag ${a.impact >= 0 ? "bad" : "good"}`} style={{ margin: "1px 3px 1px 0" }} title={`${a.name}: ${money(a.impact, 2)} (${fmt(a.impactPct, 1)}% of its total cost)`}>
                              {a.name.length > 18 ? a.name.slice(0, 18) + "…" : a.name} {a.impact >= 0 ? "+" : ""}{money(a.impact, 2)}
                            </span>
                          ))}
                          {e.affected.length > 4 && <span className="tag neutral">+{e.affected.length - 4} more</span>}
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>Not used in any recipe</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No price changes recorded yet — this fills in as you update prices in Product Master.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function SectionsTab({ sector }: { sector?: string }) {
  const sections = await getSectionStats();
  const totalSpend = sections.reduce((s, x) => s + x.spend, 0);
  const selected = sector ? sections.find((s) => s.sector === sector) : null;

  return (
    <>
      <div className="callout">
        <b>What this shows:</b> purchase spend split by operational sector, exactly as recorded on each historical purchase line.{" "}
        <b>What it can&apos;t show yet:</b> a true food-cost % per brand, since sales aren&apos;t logged per-sector in the imported data.
      </div>
      <div className="pill-tabs">
        <Link href="/reports?tab=sections" className={`btn ${!sector ? "" : "ghost"}`} style={{ borderRadius: 20 }}>All Sectors</Link>
        {sections.map((s) => (
          <Link key={s.sector} href={`/reports?tab=sections&sector=${encodeURIComponent(s.sector)}`} className={`btn ${sector === s.sector ? "" : "ghost"}`} style={{ borderRadius: 20 }}>
            {s.sector}
          </Link>
        ))}
      </div>
      <div className="kpi-grid">
        <div className="kpi"><div className="n">{money(totalSpend, 0)}</div><div className="l">Total Purchase Spend</div><div className="d">Across {sections.length} sectors</div></div>
      </div>
      {!selected ? (
        <div className="panel">
          <div className="panel-head"><h3>Spend by Sector</h3></div>
          <div className="panel-body chart-card">
            <DonutChart data={[...sections].sort((a, b) => b.spend - a.spend).map((s) => ({ label: s.sector, value: s.spend }))} format="money0" centerLabel="total spend" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid-2">
            <div className="panel">
              <div className="panel-head"><h3>{selected.sector} — Spend by Category</h3></div>
              <div className="panel-body chart-card">
                {selected.categories.length ? (
                  <HorizontalBarChart data={selected.categories.map(([label, value]) => ({ label, value }))} format="money0" color="var(--chart-3)" />
                ) : (
                  <div style={{ color: "var(--ink-faint)", fontSize: 12.5, padding: "6px 0" }}>No purchase lines recorded for this sector.</div>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><h3>{selected.sector} — Top Items by Spend</h3></div>
              <div className="panel-body" style={{ padding: 0 }}>
                {selected.items.length ? (
                  <table className="data"><tbody>
                    {selected.items.map(([item, v]) => (
                      <tr key={item}><td>{item}</td><td className="mono-r right">{fmt(v, 0)}</td></tr>
                    ))}
                  </tbody></table>
                ) : (
                  <div style={{ color: "var(--ink-faint)", fontSize: 12.5, padding: 20 }}>No items recorded.</div>
                )}
              </div>
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
        <div className="kpi"><div className="n">{money(totalGrnSpend, 0)}</div><div className="l">Total Received (all sectors)</div></div>
        <div className="kpi"><div className="n" style={{ color: totalWastage > 0 ? "var(--bad)" : "inherit" }}>{money(totalWastage, 0)}</div><div className="l">Total Wastage (all sectors)</div></div>
        <div className="kpi"><div className="n">{totalGrnSpend ? fmt((totalWastage / totalGrnSpend) * 100, 1) : "0.0"}%</div><div className="l">Wastage as % of Spend</div></div>
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
                    <td className="mono-r">{money(s.grnSpend, 2)}</td>
                    <td className="mono-r" style={{ color: s.wastageCost > 0 ? "var(--bad)" : "inherit" }}>{money(s.wastageCost, 2)}</td>
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

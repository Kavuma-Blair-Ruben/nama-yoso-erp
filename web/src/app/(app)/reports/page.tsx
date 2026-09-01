import Link from "next/link";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  listSlowMovingItems,
  listPriceChangeEvents,
  listCostAdjustmentEvents,
  listIngredientSwapEvents,
  getSectionStats,
  getStockPageRows,
  getVarianceAnalysis,
} from "@/server/db/queries/reports";
import { getRecipeSalesReport } from "@/server/db/queries/sales";
import { getPosIntegration, listPosBranchMappings, listPosItemMappings, listPosWebhookEvents } from "@/server/db/queries/pos";
import { listBranches, listPurchaseOrders } from "@/server/db/queries/purchaseOrders";
import { listGrns, listAllSupplierReturns } from "@/server/db/queries/grn";
import { listWastageEvents } from "@/server/db/queries/wastage";
import { listTransfers } from "@/server/db/queries/transfers";
import { listStockCounts } from "@/server/db/queries/stockCount";
import { listProductionBatches } from "@/server/db/queries/production";
import { listInvoices } from "@/server/db/queries/invoices";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { listMainRecipesForPicker } from "@/server/db/queries/recipes";
import { fmt, money, pct, todayStr } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";
import { DonutChart } from "@/components/charts/DonutChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { PosIntegrationPanel } from "@/components/reports/PosIntegrationPanel";
import { FoodicsWebhookPanel } from "@/components/reports/FoodicsWebhookPanel";
import { RecipeSalesImport } from "@/components/reports/RecipeSalesImport";
import { ReportExportBar } from "@/components/reports/ReportExportBar";
import { DateRangeBar } from "@/components/dashboard/DateRangeBar";
import { withTimeout } from "@/lib/withTimeout";

// Every tab function below wraps its data fetch in withTimeout, not
// statement_timeout — confirmed unreliable through Supabase's pooler.
// Same multi-tab shape as dashboard/page.tsx, which hung indefinitely
// without this. Throws into (app)/error.tsx on timeout.
const TIMEOUT_MS = 20000;
const TIMEOUT_MSG = "This is taking longer than expected — please try again in a moment.";

type Tab =
  | "sales" | "slowmoving" | "pricechange" | "costadjustments" | "ingredientswaps" | "sections" | "stock" | "varianceanalysis"
  | "purchaseorders" | "grns" | "supplierreturns" | "invoices" | "wastage" | "transfers" | "stockcounts" | "production";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireSection("reports", "view");
  const sp = await searchParams;
  const tab: Tab = (typeof sp.tab === "string" ? (sp.tab as Tab) : "sales");
  // Shared default window for every tab below that accepts from/to —
  // last 30 days, same default the Dashboard's date-filtered tabs use.
  // Tabs pass `undefined` through instead when a real from/to isn't given,
  // so a tab whose underlying query has no date column (Stock Page) or is
  // a frozen historical snapshot (Cost by Brand & Section) simply ignores it.
  const to = typeof sp.to === "string" ? sp.to : todayStr();
  const from = typeof sp.from === "string" ? sp.from : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Reports" subtitle="Printable and exportable reports across your live and historical data." />
      <ReportExportBar tab={tab} sp={sp} />

      {tab === "sales" && <RecipeSalesTab from={from} to={to} view={typeof sp.view === "string" ? sp.view : undefined} />}
      {tab === "stock" && <StockTab q={typeof sp.q === "string" ? sp.q : undefined} view={typeof sp.view === "string" ? (sp.view as StockView) : undefined} />}
      {tab === "varianceanalysis" && (
        <VarianceAnalysisTab
          from={typeof sp.from === "string" ? sp.from : undefined}
          to={typeof sp.to === "string" ? sp.to : undefined}
          branchId={typeof sp.branchId === "string" ? sp.branchId : undefined}
          costCenterId={typeof sp.costCenterId === "string" ? sp.costCenterId : undefined}
          excludeNonCogs={sp.excludeNonCogs === "1"}
        />
      )}
      {tab === "slowmoving" && <SlowMovingTab minDays={typeof sp.minDays === "string" ? Number(sp.minDays) : 0} />}
      {tab === "pricechange" && <PriceChangeTab from={from} to={to} view={typeof sp.view === "string" ? sp.view : undefined} />}
      {tab === "costadjustments" && <CostAdjustmentsTab q={typeof sp.q === "string" ? sp.q : undefined} view={typeof sp.view === "string" ? sp.view : undefined} from={from} to={to} />}
      {tab === "ingredientswaps" && <IngredientSwapsTab from={from} to={to} />}
      {tab === "sections" && <SectionsTab sector={typeof sp.sector === "string" ? sp.sector : undefined} />}
      {tab === "purchaseorders" && <PurchaseOrdersTab q={typeof sp.q === "string" ? sp.q : undefined} status={typeof sp.status === "string" ? sp.status : undefined} from={from} to={to} />}
      {tab === "grns" && <GrnsTab q={typeof sp.q === "string" ? sp.q : undefined} status={typeof sp.status === "string" ? sp.status : undefined} from={from} to={to} />}
      {tab === "supplierreturns" && <SupplierReturnsTab from={from} to={to} />}
      {tab === "invoices" && <InvoicesReportTab q={typeof sp.q === "string" ? sp.q : undefined} status={typeof sp.status === "string" ? sp.status : undefined} from={from} to={to} />}
      {tab === "wastage" && <WastageReportTab status={typeof sp.status === "string" ? sp.status : undefined} from={from} to={to} />}
      {tab === "transfers" && <TransfersReportTab status={typeof sp.status === "string" ? sp.status : undefined} from={from} to={to} />}
      {tab === "stockcounts" && <StockCountsTab status={typeof sp.status === "string" ? sp.status : undefined} from={from} to={to} />}
      {tab === "production" && <ProductionReportTab status={typeof sp.status === "string" ? sp.status : undefined} from={from} to={to} />}
    </>
  );
}

async function RecipeSalesTab({ from, to, view }: { from: string; to: string; view?: string }) {
  const [report, foodicsIntegration, branches, costCenters, recipes, branchMappings, itemMappings, recentEvents] = await withTimeout(
    Promise.all([
      getRecipeSalesReport({ from, to }),
      getPosIntegration("foodics"),
      listBranches(),
      listAllActiveCostCenters(),
      listMainRecipesForPicker(),
      listPosBranchMappings("foodics"),
      listPosItemMappings("foodics"),
      listPosWebhookEvents("foodics"),
    ]),
    TIMEOUT_MS,
    TIMEOUT_MSG
  );

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
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="sales" />
        <div className="daterange">📅<input type="date" name="from" defaultValue={from} /><span>–</span><input type="date" name="to" defaultValue={to} /></div>
        <button className="btn ghost" type="submit">Apply</button>
      </form>
      {!report.hasData ? (
        <div className="callout">No sales data imported yet — upload a POS export above to see this report.</div>
      ) : (
        <>
          {(() => {
            const activeView = view === "unmatched" ? "unmatched" : "all";
            const displayRows = activeView === "unmatched" ? report.rows.filter((r) => !r.code) : report.rows;
            function kpiHref(v: string) {
              const params = new URLSearchParams({ tab: "sales" });
              if (v) params.set("view", v);
              params.set("from", from);
              params.set("to", to);
              return `/reports?${params.toString()}`;
            }
            return (
              <>
                <div className="kpi-grid">
                  <div className="kpi"><div className="n">{money(report.totalRevenue, 0)}</div><div className="l">Total Revenue</div><div className="d">{fmt(report.totalQty, 0)} items sold</div></div>
                  <div className="kpi"><div className="n">{money(report.totalCost, 0)}</div><div className="l">Total Food Cost</div><div className="d">{report.totalRevenue ? fmt((report.totalCost / report.totalRevenue) * 100, 1) : "—"}% of revenue</div></div>
                  <div className="kpi"><div className="n" style={{ color: report.totalProfit >= 0 ? "var(--good)" : "var(--bad)" }}>{money(report.totalProfit, 0)}</div><div className="l">Gross Profit</div><div className="d">Across matched recipes</div></div>
                  <Link href={kpiHref("unmatched")} className={`kpi${activeView === "unmatched" ? " accent-bad" : ""}`}>
                    <div className="n" style={{ color: report.unmatchedCount ? "var(--bad)" : "inherit" }}>{report.unmatchedCount}</div>
                    <div className="l">Unmatched Item Labels</div>
                    <div className="d">Not linked to a recipe</div>
                  </Link>
                </div>
                {activeView === "unmatched" && (
                  <div className="filterbar">
                    <Link href={kpiHref("")} className="btn ghost">← Back to all recipes</Link>
                  </div>
                )}
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
                        {displayRows.map((r, i) => (
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
            );
          })()}
        </>
      )}
    </>
  );
}

type StockView = "all" | "flagged" | "negative" | "notlinked" | "abovepar" | "belowmin";

async function StockTab({ q, view }: { q?: string; view?: StockView }) {
  const rows = await withTimeout(getStockPageRows(), TIMEOUT_MS, TIMEOUT_MSG);
  const negCount = rows.filter((r) => r.onHand < 0).length;
  const belowMinCount = rows.filter((r) => r.flag === "BELOW MIN").length;
  const abovePar = rows.filter((r) => r.abovePar).length;
  const notLinkedCount = rows.filter((r) => !r.linkedToRecipe).length;
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const flaggedCount = rows.filter((r) => r.flag).length;
  const activeView: StockView = view ?? "all";

  let filtered = rows;
  if (activeView === "flagged") filtered = filtered.filter((r) => r.flag);
  else if (activeView === "negative") filtered = filtered.filter((r) => r.onHand < 0);
  else if (activeView === "notlinked") filtered = filtered.filter((r) => !r.linkedToRecipe);
  else if (activeView === "abovepar") filtered = filtered.filter((r) => r.abovePar);
  else if (activeView === "belowmin") filtered = filtered.filter((r) => r.flag === "BELOW MIN");
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter((r) => r.name.toLowerCase().includes(needle) || r.legacyCode.toLowerCase().includes(needle));
  }
  filtered = [...filtered].sort((a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1) || a.name.localeCompare(b.name));

  function kpiHref(v: StockView) {
    const params = new URLSearchParams({ tab: "stock", view: v });
    if (q) params.set("q", q);
    return `/reports?${params.toString()}`;
  }

  return (
    <>
      <div className="kpi-grid">
        <Link href={kpiHref("all")} className={`kpi${activeView === "all" ? " accent-neutral" : ""}`}>
          <div className="kpi-icon">📦</div>
          <div className="n">{money(totalValue, 0)}</div>
          <div className="l">Stock on Hand</div>
          <div className="d">{rows.length} item(s) — click to view all</div>
        </Link>
        <Link href={kpiHref("notlinked")} className={`kpi${activeView === "notlinked" ? " accent-bad" : ""}`}>
          <div className="kpi-icon">🔗</div>
          <div className="n" style={{ color: notLinkedCount ? "var(--bad)" : "inherit" }}>{notLinkedCount}</div>
          <div className="l">Not Linked to Recipe</div>
          <div className="d">Needs mapping</div>
        </Link>
        <Link href={kpiHref("negative")} className={`kpi${activeView === "negative" ? " accent-bad" : ""}`}>
          <div className="kpi-icon">⊖</div>
          <div className="n" style={{ color: negCount ? "var(--bad)" : "inherit" }}>{negCount}</div>
          <div className="l">Negative Stock</div>
          <div className="d">Count required</div>
        </Link>
        <Link href={kpiHref("abovepar")} className={`kpi${activeView === "abovepar" ? " accent-neutral" : ""}`}>
          <div className="kpi-icon">📈</div>
          <div className="n">{abovePar}</div>
          <div className="l">Above Par</div>
          <div className="d">Overstocked items</div>
        </Link>
        <Link href={kpiHref("belowmin")} className={`kpi${activeView === "belowmin" ? " accent-bad" : ""}`}>
          <div className="kpi-icon">📉</div>
          <div className="n" style={{ color: belowMinCount ? "var(--bad)" : "inherit" }}>{belowMinCount}</div>
          <div className="l">Below Minimum</div>
          <div className="d">Reorder now</div>
        </Link>
      </div>

      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="stock" />
        <input type="hidden" name="view" value={activeView} />
        <input type="text" name="q" placeholder="Search item name or code…" defaultValue={q ?? ""} />
        <button className="btn ghost" type="submit">Search</button>
        {(activeView !== "all" || q) && <Link href="/reports?tab=stock" className="btn ghost">Clear filters</Link>}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{filtered.length} of {rows.length} shown</span>
      </form>

      {flaggedCount > 0 && activeView === "all" && (
        <div className="callout">{flaggedCount} item(s) flagged below — click a stat card above to filter down to just those.</div>
      )}
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="data" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "25%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Code</th>
                <th>Item</th>
                <th className="right">Cost</th>
                <th>Storage Unit</th>
                <th className="right">On Hand</th>
                <th className="right">Stock Value</th>
                <th className="right">Last Count</th>
                <th style={{ whiteSpace: "nowrap" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((r) => {
                  const unit = canonicalUnitLabel(r.issueUnit);
                  const statusMeta =
                    r.status === "OUT_OF_STOCK"
                      ? { color: "var(--ink-faint)", label: "Out of Stock" }
                      : r.status === "LOW_STOCK"
                        ? { color: "var(--bad)", label: "Low Stock" }
                        : { color: "var(--good)", label: "In Stock" };
                  return (
                    <tr key={r.id}>
                      <td className="mono-r" style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                        <Link href={`/products/${r.legacyCode}`} prefetch={false}>{r.legacyCode}</Link>
                      </td>
                      <td>
                        <Link href={`/products/${r.legacyCode}`} prefetch={false}>{r.name}</Link>
                        <div style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>{r.categoryName ?? "-"}</div>
                      </td>
                      <td className="mono-r">
                        {r.sourceType === "purchased" && r.purchaseRate != null
                          ? `${fmt(r.purchaseRate, 2)} / ${r.purchaseUnit ?? unit}`
                          : r.ratePerKgL != null
                            ? `${fmt(r.ratePerKgL, 2)} / ${unit}`
                            : "-"}
                      </td>
                      <td>{r.sourceType === "purchased" ? (r.purchaseUnit ?? unit) : unit}</td>
                      <td className="mono-r" style={{ color: r.onHand < 0 ? "var(--bad)" : "inherit" }}>{fmt(r.onHand, 2)}</td>
                      <td className="mono-r">{money(r.value, 2)}</td>
                      <td className="mono-r">{r.lastCountQty != null ? fmt(r.lastCountQty, 2) : "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: statusMeta.color, whiteSpace: "nowrap" }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusMeta.color, flex: "none" }} />
                          {statusMeta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr className="empty-row"><td colSpan={8}>No items match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function VarianceAnalysisTab({ from, to, branchId, costCenterId, excludeNonCogs }: { from?: string; to?: string; branchId?: string; costCenterId?: string; excludeNonCogs?: boolean }) {
  const effTo = to || todayStr();
  const effFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [data, branches, costCenters] = await withTimeout(
    Promise.all([
      getVarianceAnalysis({ from: effFrom, to: effTo, branchId, costCenterId, excludeNonCogs }),
      listBranches(),
      listAllActiveCostCenters(),
    ]),
    TIMEOUT_MS,
    TIMEOUT_MSG
  );
  const maxNeg = Math.max(1, ...data.negativeItems.map((i) => Math.abs(i.varianceValue)));
  const maxPos = Math.max(1, ...data.positiveItems.map((i) => i.varianceValue));

  return (
    <>
      <div className="callout">
        <b>What this shows:</b> theoretical stock (the running ledger, driven by GRN receipts, production, wastage and sales) vs. what was
        physically counted, rolled up per item across every posted stock count in this date range. A negative variance means an item came up
        short of what the system expected; positive means more was on the shelf than expected.
      </div>
      <form className="filterbar" method="get" style={{ alignItems: "center" }}>
        <input type="hidden" name="tab" value="varianceanalysis" />
        <div className="daterange">
          📅
          <input type="date" name="from" defaultValue={effFrom} />
          <span>–</span>
          <input type="date" name="to" defaultValue={effTo} />
        </div>
        <select name="branchId" defaultValue={branchId ?? ""}>
          <option value="">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select name="costCenterId" defaultValue={costCenterId ?? ""}>
          <option value="">All cost centers</option>
          {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-soft)" }}>
          <input type="checkbox" name="excludeNonCogs" value="1" defaultChecked={excludeNonCogs} /> Exclude non-COGS items
        </label>
        <button className="btn ghost" type="submit">Apply</button>
      </form>

      <div className="kpi-grid">
        <div className="kpi accent-bad">
          <div className="kpi-icon">➖</div>
          <div className="n" style={{ color: "var(--bad)" }}>{money(data.negativeVarianceValue, 2)}</div>
          <div className="l">Negative Variance</div>
          <div className="d">{data.negativeItemCount} item(s) short</div>
        </div>
        <div className="kpi accent-good">
          <div className="kpi-icon">➕</div>
          <div className="n" style={{ color: "var(--good)" }}>{money(data.positiveVarianceValue, 2)}</div>
          <div className="l">Positive Variance</div>
          <div className="d">{data.positiveItemCount} item(s) over</div>
        </div>
        <div className="kpi accent-neutral">
          <div className="kpi-icon">⚖️</div>
          <div className="n" style={{ color: data.netVarianceValue < 0 ? "var(--bad)" : "inherit" }}>{money(data.netVarianceValue, 2)}</div>
          <div className="l">Net Variance</div>
          <div className="d">{effFrom} — {effTo}</div>
        </div>
        <div className="kpi accent-warn">
          <div className="kpi-icon">🎯</div>
          <div className="n">{data.netVarianceOfSalesPct != null ? pct(data.netVarianceOfSalesPct) : "—"}</div>
          <div className="l">Net Variance / Sales</div>
          <div className="d">{data.netVarianceOfSalesPct == null ? "No sales data in this range" : "Target ≤ 1.0%"}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Variance per Item</h3><span style={{ fontSize: 11, color: "var(--ink-soft)" }}>Top 12 each side, ranked independently</span></div>
        <div className="panel-body">
          {data.negativeItems.length || data.positiveItems.length ? (
            <div className="grid-2">
              <div>
                <div className="section-title" style={{ color: "var(--bad)" }}>Negative (short)</div>
                {data.negativeItems.length ? data.negativeItems.map((i) => (
                  <div className="barrow" key={i.code}>
                    <div className="lbl" title={i.name}>{i.name}</div>
                    <div className="track"><div className="fill" style={{ width: `${(Math.abs(i.varianceValue) / maxNeg) * 100}%`, background: "var(--bad)" }} /></div>
                    <div className="val">{fmt(i.varianceValue, 0)}</div>
                  </div>
                )) : <div style={{ color: "var(--ink-faint)", fontSize: 12.5 }}>None.</div>}
              </div>
              <div>
                <div className="section-title" style={{ color: "var(--good)" }}>Positive (over)</div>
                {data.positiveItems.length ? data.positiveItems.map((i) => (
                  <div className="barrow" key={i.code}>
                    <div className="lbl" title={i.name}>{i.name}</div>
                    <div className="track"><div className="fill" style={{ width: `${(i.varianceValue / maxPos) * 100}%`, background: "var(--good)" }} /></div>
                    <div className="val">{fmt(i.varianceValue, 0)}</div>
                  </div>
                )) : <div style={{ color: "var(--ink-faint)", fontSize: 12.5 }}>None.</div>}
              </div>
            </div>
          ) : (
            <div className="callout">No posted stock counts with a variance in this date range/location.</div>
          )}
        </div>
      </div>
    </>
  );
}

async function SlowMovingTab({ minDays }: { minDays: number }) {
  const rows = await withTimeout(listSlowMovingItems(minDays), TIMEOUT_MS, TIMEOUT_MSG);
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

async function PriceChangeTab({ from, to, view }: { from: string; to: string; view?: string }) {
  const rows = await withTimeout(listPriceChangeEvents({ from, to }), TIMEOUT_MS, TIMEOUT_MSG);
  const totalImpact = rows.reduce((s, e) => s + e.varianceValue, 0);
  const increases = rows.filter((e) => e.variancePct > 0).length;
  const activeView = view === "increases" ? "increases" : "all";
  const displayRows = activeView === "increases" ? rows.filter((e) => e.variancePct > 0) : rows;

  function kpiHref(v: string) {
    const params = new URLSearchParams({ tab: "pricechange" });
    if (v) params.set("view", v);
    params.set("from", from);
    params.set("to", to);
    return `/reports?${params.toString()}`;
  }

  return (
    <>
      <div className="callout">Every GRN line where what you were actually invoiced didn&apos;t match what the LPO said, across every supplier and outlet in one place.</div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="pricechange" />
        <div className="daterange">📅<input type="date" name="from" defaultValue={from} /><span>–</span><input type="date" name="to" defaultValue={to} /></div>
        <button className="btn ghost" type="submit">Apply</button>
      </form>
      <div className="kpi-grid">
        <Link href={kpiHref("")} className={`kpi${activeView === "all" ? " accent-neutral" : ""}`}><div className="n">{rows.length}</div><div className="l">Total Discrepancies</div><div className="d">All-time</div></Link>
        <div className="kpi"><div className="n" style={{ color: totalImpact >= 0 ? "var(--bad)" : "var(--good)" }}>{money(totalImpact, 0)}</div><div className="l">Net Cost Impact</div><div className="d">{totalImpact >= 0 ? "Cost you" : "Saved you"}</div></div>
        <Link href={kpiHref("increases")} className={`kpi${activeView === "increases" ? " accent-bad" : ""}`}><div className="n">{increases}</div><div className="l">Price Increases</div><div className="d">of {rows.length} discrepancies</div></Link>
      </div>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 500 }}>
          <table className="data">
            <thead><tr><th>Date</th><th>GRN #</th><th>Supplier</th><th>Item</th><th className="right">Ordered Rate</th><th className="right">Received Rate</th><th className="right">Variance %</th><th className="right">Cost Impact</th></tr></thead>
            <tbody>
              {displayRows.length ? (
                displayRows.map((e, i) => (
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
                <tr className="empty-row"><td colSpan={8}>{activeView === "increases" ? "No price increases in this range." : "No price discrepancies found — every posted GRN matched its LPO rate exactly."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function CostAdjustmentsTab({ q, view, from, to }: { q?: string; view?: string; from: string; to: string }) {
  const allRows = await withTimeout(listCostAdjustmentEvents({ q, from, to }), TIMEOUT_MS, TIMEOUT_MSG);
  const increasesCount = allRows.filter((e) => e.pctChange > 0).length;
  const decreasesCount = allRows.filter((e) => e.pctChange < 0).length;
  const activeView = view === "increases" || view === "decreases" ? view : "all";
  const rows = activeView === "increases" ? allRows.filter((e) => e.pctChange > 0) : activeView === "decreases" ? allRows.filter((e) => e.pctChange < 0) : allRows;

  function kpiHref(v: string) {
    const params = new URLSearchParams({ tab: "costadjustments" });
    if (v) params.set("view", v);
    if (q) params.set("q", q);
    params.set("from", from);
    params.set("to", to);
    return `/reports?${params.toString()}`;
  }

  return (
    <>
      <div className="callout">Every ingredient price change, and which recipes it moved the cost of — e.g. &quot;recipe cost went up 2% because chicken breast rose 20%.&quot;</div>
      <div className="kpi-grid">
        <Link href={kpiHref("")} className={`kpi${activeView === "all" ? " accent-neutral" : ""}`}><div className="n">{allRows.length}</div><div className="l">Total Adjustments</div></Link>
        <Link href={kpiHref("increases")} className={`kpi${activeView === "increases" ? " accent-bad" : ""}`}><div className="n">{increasesCount}</div><div className="l">Price Increases</div></Link>
        <Link href={kpiHref("decreases")} className={`kpi${activeView === "decreases" ? " accent-good" : ""}`}><div className="n">{decreasesCount}</div><div className="l">Price Decreases</div></Link>
      </div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="costadjustments" />
        <div className="daterange">📅<input type="date" name="from" defaultValue={from} /><span>–</span><input type="date" name="to" defaultValue={to} /></div>
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

async function IngredientSwapsTab({ from, to }: { from: string; to: string }) {
  const events = await withTimeout(listIngredientSwapEvents({ from, to }), TIMEOUT_MS, TIMEOUT_MSG);
  const totalImpact = events.reduce((s, e) => s + e.totalCostImpact, 0);
  const totalLines = events.reduce((s, e) => s + e.affectedLineCount, 0);

  return (
    <>
      <div className="callout">
        Every time an out-of-stock ingredient was replaced with an alternative across the recipes that used it, and the
        recorded cost impact of that swap.
      </div>
      <div className="kpi-grid">
        <div className="kpi"><div className="n">{events.length}</div><div className="l">Swaps</div></div>
        <div className="kpi"><div className="n">{totalLines}</div><div className="l">Ingredient Lines Repointed</div></div>
        <div className={`kpi${totalImpact > 0 ? " accent-bad" : totalImpact < 0 ? " accent-good" : ""}`}>
          <div className="n" style={{ color: totalImpact > 0 ? "var(--bad)" : totalImpact < 0 ? "var(--good)" : undefined }}>
            {totalImpact >= 0 ? "+" : ""}
            {money(totalImpact, 2)}
          </div>
          <div className="l">Total Cost Impact</div>
        </div>
      </div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="ingredientswaps" />
        <div className="daterange">📅<input type="date" name="from" defaultValue={from} /><span>–</span><input type="date" name="to" defaultValue={to} /></div>
        <button className="btn ghost" type="submit">Filter</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{events.length} swap(s)</span>
      </form>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="data">
            <thead><tr><th>Date</th><th>Swap</th><th>Reason</th><th className="right">Lines</th><th className="right">Impact</th><th>By</th></tr></thead>
            <tbody>
              {events.length ? (
                events.map((e) => (
                  <tr key={e.id}>
                    <td>{e.createdAt.toISOString().slice(0, 10)}</td>
                    <td>
                      <Link href={`/reports/ingredient-swaps/${e.id}`}>
                        {e.fromName} → {e.toName}
                      </Link>
                    </td>
                    <td style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{e.reason ?? "—"}</td>
                    <td className="mono-r">{e.affectedLineCount}</td>
                    <td className="right">
                      <span className={`tag ${e.totalCostImpact > 0 ? "bad" : e.totalCostImpact < 0 ? "good" : "neutral"}`}>
                        {e.totalCostImpact >= 0 ? "+" : ""}
                        {money(e.totalCostImpact, 2)}
                      </span>
                    </td>
                    <td style={{ fontSize: 11.5 }}>{e.createdByName ?? "—"}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No ingredient swaps recorded yet — replace an item from its Product page ("Replace Everywhere") to see it here.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function SectionsTab({ sector }: { sector?: string }) {
  const sections = await withTimeout(getSectionStats(), TIMEOUT_MS, TIMEOUT_MSG);
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

async function PurchaseOrdersTab({ q, status, from, to }: { q?: string; status?: string; from: string; to: string }) {
  const rows = await withTimeout(listPurchaseOrders({ q, status, from, to }), TIMEOUT_MS, TIMEOUT_MSG);
  const totalValue = rows.reduce((s, r) => s + r.total, 0);
  const draftCount = rows.filter((r) => r.status === "DRAFT").length;
  const orderedCount = rows.filter((r) => r.status === "ORDERED").length;

  function kpiHref(s: string) {
    const params = new URLSearchParams({ tab: "purchaseorders" });
    if (s) params.set("status", s);
    if (q) params.set("q", q);
    params.set("from", from);
    params.set("to", to);
    return `/reports?${params.toString()}`;
  }

  return (
    <>
      <div className="kpi-grid">
        <Link href={kpiHref("")} className={`kpi${!status ? " accent-neutral" : ""}`}><div className="n">{rows.length}</div><div className="l">Purchase Orders</div></Link>
        <Link href={kpiHref("DRAFT")} className={`kpi${status === "DRAFT" ? " accent-neutral" : ""}`}><div className="n">{draftCount}</div><div className="l">Draft</div></Link>
        <Link href={kpiHref("ORDERED")} className={`kpi${status === "ORDERED" ? " accent-neutral" : ""}`}><div className="n">{orderedCount}</div><div className="l">Ordered</div></Link>
        <div className="kpi"><div className="n">{money(totalValue, 0)}</div><div className="l">Total Value</div></div>
      </div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="purchaseorders" />
        <div className="daterange">📅<input type="date" name="from" defaultValue={from} /><span>–</span><input type="date" name="to" defaultValue={to} /></div>
        <input type="text" name="q" placeholder="Search PO number or supplier..." defaultValue={q ?? ""} />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="APPROVED">Approved</option>
          <option value="ORDERED">Ordered</option>
          <option value="PARTIALLY RECEIVED">Partially Received</option>
          <option value="FULLY RECEIVED">Fully Received</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <button className="btn ghost" type="submit">Apply</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} order(s)</span>
      </form>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="data">
            <thead><tr><th>LPO Number</th><th>Supplier</th><th>Date</th><th className="right">Net</th><th className="right">VAT</th><th className="right">Total</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/purchase-orders/${r.id}`}>{r.poNumber}</Link></td>
                    <td>{r.supplier}</td>
                    <td>{r.createdDate}</td>
                    <td className="mono-r">{fmt(r.net, 2)}</td>
                    <td className="mono-r">{fmt(r.vat, 2)}</td>
                    <td className="mono-r">{money(r.total, 2)}</td>
                    <td><span className="tag neutral">{r.status}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={7}>No purchase orders match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function GrnsTab({ q, status, from, to }: { q?: string; status?: string; from: string; to: string }) {
  const rows = await withTimeout(listGrns({ q, status, from, to }), TIMEOUT_MS, TIMEOUT_MSG);
  const totalValue = rows.reduce((s, r) => s + r.total, 0);
  const draftCount = rows.filter((r) => r.status === "DRAFT").length;
  const postedCount = rows.filter((r) => r.status === "POSTED").length;

  function kpiHref(s: string) {
    const params = new URLSearchParams({ tab: "grns" });
    if (s) params.set("status", s);
    if (q) params.set("q", q);
    params.set("from", from);
    params.set("to", to);
    return `/reports?${params.toString()}`;
  }

  return (
    <>
      <div className="kpi-grid">
        <Link href={kpiHref("")} className={`kpi${!status ? " accent-neutral" : ""}`}><div className="n">{rows.length}</div><div className="l">GRNs</div></Link>
        <Link href={kpiHref("DRAFT")} className={`kpi${status === "DRAFT" ? " accent-neutral" : ""}`}><div className="n">{draftCount}</div><div className="l">Draft</div></Link>
        <Link href={kpiHref("POSTED")} className={`kpi${status === "POSTED" ? " accent-neutral" : ""}`}><div className="n">{postedCount}</div><div className="l">Posted</div></Link>
        <div className="kpi"><div className="n">{money(totalValue, 0)}</div><div className="l">Total Value</div></div>
      </div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="grns" />
        <div className="daterange">📅<input type="date" name="from" defaultValue={from} /><span>–</span><input type="date" name="to" defaultValue={to} /></div>
        <input type="text" name="q" placeholder="Search GRN/PO number or supplier..." defaultValue={q ?? ""} />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="POSTED">Posted</option>
        </select>
        <button className="btn ghost" type="submit">Search</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} GRN(s)</span>
      </form>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="data">
            <thead><tr><th>GRN Number</th><th>LPO Number</th><th>Supplier</th><th>Received Date</th><th>Invoice #</th><th className="right">Net</th><th className="right">VAT</th><th className="right">Total</th><th>Status</th><th>Payment</th></tr></thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/grn/${r.id}`}>{r.grnNumber}</Link></td>
                    <td>{r.poNumber ?? "-"}</td>
                    <td>{r.supplier}</td>
                    <td>{r.receivedDate}</td>
                    <td>{r.invoiceNumber ?? "-"}</td>
                    <td className="mono-r">{fmt(r.net, 2)}</td>
                    <td className="mono-r">{fmt(r.vat, 2)}</td>
                    <td className="mono-r">{money(r.total, 2)}</td>
                    <td><span className="tag neutral">{r.status}</span></td>
                    <td>{r.paymentMethod === "PETTY_CASH" ? <span className="tag neutral">Petty Cash</span> : "Invoice"}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={10}>No GRNs match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function SupplierReturnsTab({ from, to }: { from: string; to: string }) {
  const rows = await withTimeout(listAllSupplierReturns({ from, to }), TIMEOUT_MS, TIMEOUT_MSG);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi"><div className="n">{rows.length}</div><div className="l">Supplier Returns</div></div>
        <div className="kpi"><div className="n">{money(totalValue, 0)}</div><div className="l">Total Value</div></div>
      </div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="supplierreturns" />
        <div className="daterange">📅<input type="date" name="from" defaultValue={from} /><span>–</span><input type="date" name="to" defaultValue={to} /></div>
        <button className="btn ghost" type="submit">Apply</button>
      </form>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="data">
            <thead><tr><th>Return</th><th>GRN</th><th>Supplier</th><th>Reason</th><th className="right">Value</th><th>Date</th></tr></thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.number}</td>
                    <td><Link href={`/grn/${r.grnId}`}>{r.grnNumber}</Link></td>
                    <td>{r.supplierName}</td>
                    <td>{r.reason}</td>
                    <td className="mono-r">{money(r.value, 2)}</td>
                    <td>{r.createdAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No supplier returns recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function InvoicesReportTab({ q, status, from, to }: { q?: string; status?: string; from: string; to: string }) {
  const rows = await withTimeout(listInvoices({ q, status, from, to, limit: 1_000_000 }), TIMEOUT_MS, TIMEOUT_MSG);
  const totalValue = rows.reduce((s, r) => s + (r.total ?? 0), 0);
  const outstandingRows = rows.filter((r) => r.status === "OUTSTANDING");
  const outstanding = outstandingRows.reduce((s, r) => s + (r.total ?? 0), 0);
  const paidCount = rows.filter((r) => r.status === "PAID").length;

  function kpiHref(s: string) {
    const params = new URLSearchParams({ tab: "invoices" });
    if (s) params.set("status", s);
    if (q) params.set("q", q);
    params.set("from", from);
    params.set("to", to);
    return `/reports?${params.toString()}`;
  }

  return (
    <>
      <div className="kpi-grid">
        <Link href={kpiHref("")} className={`kpi${!status ? " accent-neutral" : ""}`}><div className="n">{rows.length}</div><div className="l">Invoices</div></Link>
        <div className="kpi"><div className="n">{money(totalValue, 0)}</div><div className="l">Total Value</div></div>
        <Link href={kpiHref("OUTSTANDING")} className={`kpi${status === "OUTSTANDING" ? " accent-bad" : ""}`}>
          <div className="n" style={{ color: outstanding > 0 ? "var(--bad)" : "inherit" }}>{money(outstanding, 0)}</div>
          <div className="l">Outstanding</div>
          <div className="d">{outstandingRows.length} invoice(s)</div>
        </Link>
        <Link href={kpiHref("PAID")} className={`kpi${status === "PAID" ? " accent-neutral" : ""}`}><div className="n">{paidCount}</div><div className="l">Paid</div></Link>
      </div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="invoices" />
        <div className="daterange">📅<input type="date" name="from" defaultValue={from} /><span>–</span><input type="date" name="to" defaultValue={to} /></div>
        <input type="text" name="q" placeholder="Search invoice number or supplier..." defaultValue={q ?? ""} />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="OUTSTANDING">Outstanding</option>
          <option value="PAID">Paid</option>
          <option value="OTHER">Other</option>
        </select>
        <button className="btn ghost" type="submit">Apply</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} invoice(s)</span>
      </form>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="data">
            <thead><tr><th>Date</th><th>Invoice #</th><th>Supplier</th><th className="right">Net</th><th className="right">VAT</th><th className="right">Total</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={`${r.source}-${r.id}`}>
                    <td>{r.invoiceDate ?? "-"}</td>
                    <td>{r.source === "grn" ? <Link href={`/grn/${r.id}`}>{r.invoiceNumber ?? "-"}</Link> : <Link href={`/invoices/${r.id}`}>{r.invoiceNumber ?? "-"}</Link>}</td>
                    <td>{r.supplier ?? "-"}</td>
                    <td className="mono-r">{r.net != null ? fmt(r.net, 2) : "-"}</td>
                    <td className="mono-r">{r.vat != null ? fmt(r.vat, 2) : "-"}</td>
                    <td className="mono-r">{r.total != null ? money(r.total, 2) : "-"}</td>
                    <td><span className="tag neutral">{r.status ?? "-"}</span></td>
                    <td><span className="tag">{r.source === "grn" ? "GRN" : "Historical"}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={8}>No invoices match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function WastageReportTab({ status, from, to }: { status?: string; from: string; to: string }) {
  const rows = await withTimeout(listWastageEvents({ status, from, to }), TIMEOUT_MS, TIMEOUT_MSG);
  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const draftCount = rows.filter((r) => r.status === "DRAFT").length;
  const postedCount = rows.filter((r) => r.status === "POSTED").length;

  function kpiHref(s: string) {
    const params = new URLSearchParams({ tab: "wastage" });
    if (s) params.set("status", s);
    params.set("from", from);
    params.set("to", to);
    return `/reports?${params.toString()}`;
  }

  return (
    <>
      <div className="kpi-grid">
        <Link href={kpiHref("")} className={`kpi${!status ? " accent-neutral" : ""}`}><div className="n">{rows.length}</div><div className="l">Wastage Logs</div></Link>
        <Link href={kpiHref("DRAFT")} className={`kpi${status === "DRAFT" ? " accent-neutral" : ""}`}><div className="n">{draftCount}</div><div className="l">Draft</div></Link>
        <Link href={kpiHref("POSTED")} className={`kpi${status === "POSTED" ? " accent-neutral" : ""}`}><div className="n">{postedCount}</div><div className="l">Posted</div></Link>
        <div className="kpi"><div className="n">{money(totalCost, 0)}</div><div className="l">Total Wastage Cost</div></div>
      </div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="wastage" />
        <div className="daterange">📅<input type="date" name="from" defaultValue={from} /><span>–</span><input type="date" name="to" defaultValue={to} /></div>
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="POSTED">Posted</option>
        </select>
        <button className="btn ghost" type="submit">Apply</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} log(s)</span>
      </form>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="data">
            <thead><tr><th>Log No.</th><th>Sector</th><th>Branch</th><th>Date</th><th>Staff</th><th className="right">Total Cost</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/wastage/${r.id}`}>{r.wastageNo}</Link></td>
                    <td>{r.costCenter}</td>
                    <td>{r.branchName ?? "-"}</td>
                    <td>{r.eventDate}</td>
                    <td>{r.staffName ?? "-"}</td>
                    <td className="mono-r">{money(r.totalCost, 2)}</td>
                    <td><span className="tag neutral">{r.status}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={7}>No wastage logs match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function TransfersReportTab({ status, from, to }: { status?: string; from: string; to: string }) {
  const rows = await withTimeout(listTransfers({ status, from, to }), TIMEOUT_MS, TIMEOUT_MSG);
  const totalValue = rows.reduce((s, r) => s + r.totalCost, 0);
  const draftCount = rows.filter((r) => r.status === "DRAFT").length;
  const inTransitCount = rows.filter((r) => r.status === "IN_TRANSIT").length;
  const postedCount = rows.filter((r) => r.status === "POSTED").length;

  function kpiHref(s: string) {
    const params = new URLSearchParams({ tab: "transfers" });
    if (s) params.set("status", s);
    params.set("from", from);
    params.set("to", to);
    return `/reports?${params.toString()}`;
  }

  return (
    <>
      <div className="kpi-grid">
        <Link href={kpiHref("")} className={`kpi${!status ? " accent-neutral" : ""}`}><div className="n">{rows.length}</div><div className="l">Transfers</div></Link>
        <Link href={kpiHref("DRAFT")} className={`kpi${status === "DRAFT" ? " accent-neutral" : ""}`}><div className="n">{draftCount}</div><div className="l">Draft</div></Link>
        <Link href={kpiHref("IN_TRANSIT")} className={`kpi${status === "IN_TRANSIT" ? " accent-neutral" : ""}`}><div className="n">{inTransitCount}</div><div className="l">In Transit</div></Link>
        <Link href={kpiHref("POSTED")} className={`kpi${status === "POSTED" ? " accent-neutral" : ""}`}><div className="n">{postedCount}</div><div className="l">Posted</div></Link>
        <div className="kpi"><div className="n">{money(totalValue, 0)}</div><div className="l">Total Value</div></div>
      </div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="transfers" />
        <div className="daterange">📅<input type="date" name="from" defaultValue={from} /><span>–</span><input type="date" name="to" defaultValue={to} /></div>
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="IN_TRANSIT">In Transit</option>
          <option value="POSTED">Posted</option>
        </select>
        <button className="btn ghost" type="submit">Apply</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} transfer(s)</span>
      </form>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="data">
            <thead><tr><th>Transfer No.</th><th>From</th><th>To</th><th>Date</th><th>Staff</th><th className="right">Value</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/transfers/${r.id}`}>{r.transferNo}</Link></td>
                    <td>{r.fromBranchName}</td>
                    <td>{r.toBranchName}</td>
                    <td>{r.transferDate}</td>
                    <td>{r.staffName ?? "-"}</td>
                    <td className="mono-r">{money(r.totalCost, 2)}</td>
                    <td><span className="tag neutral">{r.status}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={7}>No transfers match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function StockCountsTab({ status, from, to }: { status?: string; from: string; to: string }) {
  const rows = await withTimeout(listStockCounts({ status, from, to }), TIMEOUT_MS, TIMEOUT_MSG);
  const totalVariance = rows.reduce((s, r) => s + r.totalVarianceValue, 0);
  const draftCount = rows.filter((r) => r.status === "DRAFT").length;
  const postedCount = rows.filter((r) => r.status === "POSTED").length;

  function kpiHref(s: string) {
    const params = new URLSearchParams({ tab: "stockcounts" });
    if (s) params.set("status", s);
    params.set("from", from);
    params.set("to", to);
    return `/reports?${params.toString()}`;
  }

  return (
    <>
      <div className="kpi-grid">
        <Link href={kpiHref("")} className={`kpi${!status ? " accent-neutral" : ""}`}><div className="n">{rows.length}</div><div className="l">Stock Counts</div></Link>
        <Link href={kpiHref("DRAFT")} className={`kpi${status === "DRAFT" ? " accent-neutral" : ""}`}><div className="n">{draftCount}</div><div className="l">Draft</div></Link>
        <Link href={kpiHref("POSTED")} className={`kpi${status === "POSTED" ? " accent-neutral" : ""}`}><div className="n">{postedCount}</div><div className="l">Posted</div></Link>
        <div className="kpi"><div className="n" style={{ color: totalVariance < 0 ? "var(--bad)" : "inherit" }}>{money(totalVariance, 0)}</div><div className="l">Total Variance Value</div></div>
      </div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="stockcounts" />
        <div className="daterange">📅<input type="date" name="from" defaultValue={from} /><span>–</span><input type="date" name="to" defaultValue={to} /></div>
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="POSTED">Posted</option>
        </select>
        <button className="btn ghost" type="submit">Apply</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} count(s)</span>
      </form>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="data">
            <thead><tr><th>Count Number</th><th>Cost Center</th><th>Branch</th><th>Date</th><th className="right">Items</th><th className="right">Variance Value</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/stock-count/${r.id}`}>{r.countNo}</Link></td>
                    <td>{r.costCenter}</td>
                    <td>{r.branchName ?? "-"}</td>
                    <td>{r.countDate}</td>
                    <td className="mono-r">{r.lineCount}</td>
                    <td className="mono-r" style={{ color: r.totalVarianceValue < 0 ? "var(--bad)" : "inherit" }}>{money(r.totalVarianceValue, 2)}</td>
                    <td><span className="tag neutral">{r.status}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={7}>No stock counts match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function ProductionReportTab({ status, from, to }: { status?: string; from: string; to: string }) {
  const rows = await withTimeout(listProductionBatches({ status, from, to }), TIMEOUT_MS, TIMEOUT_MSG);
  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const openCount = rows.filter((r) => r.status === "OPEN").length;
  const closedCount = rows.filter((r) => r.status === "CLOSED").length;

  function kpiHref(s: string) {
    const params = new URLSearchParams({ tab: "production" });
    if (s) params.set("status", s);
    params.set("from", from);
    params.set("to", to);
    return `/reports?${params.toString()}`;
  }

  return (
    <>
      <div className="kpi-grid">
        <Link href={kpiHref("")} className={`kpi${!status ? " accent-neutral" : ""}`}><div className="n">{rows.length}</div><div className="l">Production Batches</div></Link>
        <Link href={kpiHref("OPEN")} className={`kpi${status === "OPEN" ? " accent-neutral" : ""}`}><div className="n">{openCount}</div><div className="l">Open</div></Link>
        <Link href={kpiHref("CLOSED")} className={`kpi${status === "CLOSED" ? " accent-neutral" : ""}`}><div className="n">{closedCount}</div><div className="l">Closed</div></Link>
        <div className="kpi"><div className="n">{money(totalCost, 0)}</div><div className="l">Total Cost</div></div>
      </div>
      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value="production" />
        <div className="daterange">📅<input type="date" name="from" defaultValue={from} /><span>–</span><input type="date" name="to" defaultValue={to} /></div>
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
        </select>
        <button className="btn ghost" type="submit">Apply</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} batch(es)</span>
      </form>
      <div className="panel">
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="data">
            <thead><tr><th>Batch No.</th><th>Sub-Recipe</th><th>Branch</th><th>Staff</th><th>Produced Date</th><th className="right">Yield</th><th className="right">Total Cost</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/production/${r.id}`}>{r.batchNo}</Link></td>
                    <td>{r.subRecipeCode ? <Link href={`/recipes/sub/${r.subRecipeCode}`}>{r.subRecipeName}</Link> : r.subRecipeName}</td>
                    <td>{r.branchName ?? "-"}</td>
                    <td>{r.staffName ?? "-"}</td>
                    <td>{r.producedDate}</td>
                    <td className="mono-r">{fmt(r.yieldQty, 2)} {r.yieldUnit}</td>
                    <td className="mono-r">{money(r.totalCost, 2)}</td>
                    <td><span className="tag neutral">{r.status}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={8}>No production batches match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

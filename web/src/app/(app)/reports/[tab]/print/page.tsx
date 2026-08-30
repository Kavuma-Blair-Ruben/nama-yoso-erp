import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import {
  listSlowMovingItems,
  listPriceChangeEvents,
  listCostAdjustmentEvents,
  getSectionStats,
  getStockPageRows,
} from "@/server/db/queries/reports";
import { getRecipeSalesReport } from "@/server/db/queries/sales";
import { listPurchaseOrders } from "@/server/db/queries/purchaseOrders";
import { listGrns, listAllSupplierReturns } from "@/server/db/queries/grn";
import { listWastageEvents } from "@/server/db/queries/wastage";
import { listTransfers } from "@/server/db/queries/transfers";
import { listStockCounts } from "@/server/db/queries/stockCount";
import { listProductionBatches } from "@/server/db/queries/production";
import { listInvoices } from "@/server/db/queries/invoices";
import { fmt, pct, todayStr } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";
import { Logo } from "@/components/ui/Logo";
import { PrintButton } from "@/components/ui/PrintButton";
import { withTimeout } from "@/lib/withTimeout";

// Not statement_timeout — confirmed unreliable through Supabase's pooler.
const TIMEOUT_MS = 20000;
const TIMEOUT_MSG = "This is taking longer than expected — please try again in a moment.";

const TITLES: Record<string, string> = {
  sales: "Recipe Sales Report",
  stock: "Stock Page Report",
  slowmoving: "Slow Moving Items Report",
  pricechange: "Item Price Change Report",
  costadjustments: "Cost Adjustments Report",
  sections: "Cost by Brand & Section Report",
  purchaseorders: "Purchase Orders Report",
  grns: "GRN Report",
  supplierreturns: "Supplier Returns Report",
  invoices: "Invoices Report",
  wastage: "Wastage Report",
  transfers: "Transfers Report",
  stockcounts: "Stock Counts Report",
  production: "Production Report",
};

export default async function ReportPrintPage({ params, searchParams }: PageProps<"/reports/[tab]/print">) {
  await requireSection("reports", "view");
  const { tab } = await params;
  const sp = await searchParams;
  const title = TITLES[tab];
  if (!title) notFound();

  let headers: string[] = [];
  let rows: string[][] = [];
  let subtitle = "";

  if (tab === "sales") {
    const report = await withTimeout(getRecipeSalesReport(), TIMEOUT_MS, TIMEOUT_MSG);
    headers = ["Recipe", "Qty Sold", "Avg Price", "Revenue", "Food Cost", "Food Cost %", "Gross Profit"];
    rows = report.rows.map((r) => [
      r.name,
      fmt(r.qty, 0),
      fmt(r.avgPrice, 2),
      fmt(r.revenue, 2),
      r.totalCost != null ? fmt(r.totalCost, 2) : "—",
      r.foodCostPct != null ? `${fmt(r.foodCostPct, 1)}%` : "—",
      r.grossProfit != null ? fmt(r.grossProfit, 2) : "—",
    ]);
  } else if (tab === "stock") {
    const all = await withTimeout(getStockPageRows(), TIMEOUT_MS, TIMEOUT_MSG);
    const flagged = all.filter((r) => r.flag);
    headers = ["Item", "Category", "Stock on Hand", "Min Level", "Value", "Flag"];
    rows = flagged.map((r) => [
      r.name,
      r.categoryName ?? "-",
      `${fmt(r.onHand, 2)} ${canonicalUnitLabel(r.issueUnit)}`,
      r.minLevel != null ? fmt(r.minLevel, 2) : "-",
      fmt(r.value, 2),
      r.flag ?? "",
    ]);
    subtitle = `${flagged.length} flagged item(s) — negative or below minimum`;
  } else if (tab === "slowmoving") {
    const minDays = typeof sp.minDays === "string" ? Number(sp.minDays) : 0;
    const list = await withTimeout(listSlowMovingItems(minDays), TIMEOUT_MS, TIMEOUT_MSG);
    headers = ["Item", "Category", "Stock on Hand", "Stock Value", "Last Purchased", "Days Since"];
    rows = list.map((r) => [
      r.name,
      r.categoryName ?? "-",
      `${fmt(r.qty, 2)} ${canonicalUnitLabel(r.issueUnit)}`,
      fmt(r.stockValue, 2),
      r.last ?? "Never",
      r.daysSince != null ? `${r.daysSince}d` : "No purchase history",
    ]);
    subtitle = minDays ? `${minDays}+ days since purchase` : "All items with stock";
  } else if (tab === "pricechange") {
    const list = await withTimeout(listPriceChangeEvents(), TIMEOUT_MS, TIMEOUT_MSG);
    headers = ["Date", "GRN #", "Supplier", "Item", "Ordered Rate", "Received Rate", "Variance %", "Cost Impact"];
    rows = list.map((e) => [
      e.receivedDate,
      e.grnNumber,
      e.supplier,
      e.name,
      fmt(e.orderedRate, 2),
      fmt(e.receivedRate, 2),
      pct(e.variancePct),
      fmt(e.varianceValue, 2),
    ]);
  } else if (tab === "costadjustments") {
    const q = typeof sp.q === "string" ? sp.q : undefined;
    const list = await withTimeout(listCostAdjustmentEvents({ q }), TIMEOUT_MS, TIMEOUT_MSG);
    headers = ["Date", "Ingredient", "Old Rate", "New Rate", "Change %", "Affected Recipes"];
    rows = list.map((e) => [
      e.date,
      e.name,
      fmt(e.oldRate, 2),
      fmt(e.newRate, 2),
      pct(e.pctChange),
      e.affected.length ? e.affected.map((a) => `${a.name} ${a.impact >= 0 ? "+" : ""}${fmt(a.impact, 2)}`).join("; ") : "Not used in any recipe",
    ]);
    if (q) subtitle = `Filtered: "${q}"`;
  } else if (tab === "sections") {
    const sections = await withTimeout(getSectionStats(), TIMEOUT_MS, TIMEOUT_MSG);
    const sector = typeof sp.sector === "string" ? sp.sector : undefined;
    const selected = sector ? sections.find((s) => s.sector === sector) : null;
    if (selected) {
      headers = ["Category", "Spend"];
      rows = selected.categories.map(([label, value]) => [label, fmt(value, 2)]);
      subtitle = `${selected.sector} — Spend by Category`;
    } else {
      headers = ["Sector", "Spend"];
      rows = sections.map((s) => [s.sector, fmt(s.spend, 2)]);
    }
  } else if (tab === "purchaseorders") {
    const q = typeof sp.q === "string" ? sp.q : undefined;
    const status = typeof sp.status === "string" ? sp.status : undefined;
    const list = await withTimeout(listPurchaseOrders({ q, status }), TIMEOUT_MS, TIMEOUT_MSG);
    headers = ["LPO Number", "Supplier", "Date", "Net", "VAT", "Total", "Status"];
    rows = list.map((r) => [r.poNumber, r.supplier, r.createdDate, fmt(r.net, 2), fmt(r.vat, 2), fmt(r.total, 2), r.status]);
    if (status) subtitle = `Status: ${status}`;
  } else if (tab === "grns") {
    const q = typeof sp.q === "string" ? sp.q : undefined;
    const list = await withTimeout(listGrns({ q }), TIMEOUT_MS, TIMEOUT_MSG);
    headers = ["GRN Number", "LPO Number", "Supplier", "Received Date", "Invoice #", "Net", "VAT", "Total", "Status", "Payment"];
    rows = list.map((r) => [r.grnNumber, r.poNumber ?? "-", r.supplier, r.receivedDate, r.invoiceNumber ?? "-", fmt(r.net, 2), fmt(r.vat, 2), fmt(r.total, 2), r.status, r.paymentMethod === "PETTY_CASH" ? "Petty Cash" : "Invoice"]);
  } else if (tab === "supplierreturns") {
    const list = await withTimeout(listAllSupplierReturns(), TIMEOUT_MS, TIMEOUT_MSG);
    headers = ["Return", "GRN", "Supplier", "Reason", "Value", "Date"];
    rows = list.map((r) => [r.number, r.grnNumber ?? "-", r.supplierName, r.reason ?? "-", fmt(r.value, 2), r.createdAt.toISOString().slice(0, 10)]);
  } else if (tab === "invoices") {
    const q = typeof sp.q === "string" ? sp.q : undefined;
    const status = typeof sp.status === "string" ? sp.status : undefined;
    const list = await withTimeout(listInvoices({ q, status, limit: 1_000_000 }), TIMEOUT_MS, TIMEOUT_MSG);
    headers = ["Date", "Invoice #", "Supplier", "Net", "VAT", "Total", "Status", "Source"];
    rows = list.map((r) => [
      r.invoiceDate ?? "-",
      r.invoiceNumber ?? "-",
      r.supplier ?? "-",
      r.net != null ? fmt(r.net, 2) : "-",
      r.vat != null ? fmt(r.vat, 2) : "-",
      r.total != null ? fmt(r.total, 2) : "-",
      r.status ?? "-",
      r.source === "grn" ? "GRN" : "Historical",
    ]);
    if (status) subtitle = `Status: ${status}`;
  } else if (tab === "wastage") {
    const status = typeof sp.status === "string" ? sp.status : undefined;
    const list = await withTimeout(listWastageEvents({ status }), TIMEOUT_MS, TIMEOUT_MSG);
    headers = ["Log No.", "Sector", "Branch", "Date", "Staff", "Total Cost", "Status"];
    rows = list.map((r) => [r.wastageNo, r.costCenter, r.branchName ?? "-", r.eventDate, r.staffName ?? "-", fmt(r.totalCost, 2), r.status]);
    if (status) subtitle = `Status: ${status}`;
  } else if (tab === "transfers") {
    const status = typeof sp.status === "string" ? sp.status : undefined;
    const list = await withTimeout(listTransfers({ status }), TIMEOUT_MS, TIMEOUT_MSG);
    headers = ["Transfer No.", "From", "To", "Date", "Staff", "Value", "Status"];
    rows = list.map((r) => [r.transferNo, r.fromBranchName, r.toBranchName, r.transferDate, r.staffName ?? "-", fmt(r.totalCost, 2), r.status]);
    if (status) subtitle = `Status: ${status}`;
  } else if (tab === "stockcounts") {
    const status = typeof sp.status === "string" ? sp.status : undefined;
    const list = await withTimeout(listStockCounts({ status }), TIMEOUT_MS, TIMEOUT_MSG);
    headers = ["Count Number", "Cost Center", "Branch", "Date", "Items", "Variance Value", "Status"];
    rows = list.map((r) => [r.countNo, r.costCenter ?? "-", r.branchName ?? "-", r.countDate, String(r.lineCount), fmt(r.totalVarianceValue, 2), r.status]);
    if (status) subtitle = `Status: ${status}`;
  } else if (tab === "production") {
    const status = typeof sp.status === "string" ? sp.status : undefined;
    const list = await withTimeout(listProductionBatches({ status }), TIMEOUT_MS, TIMEOUT_MSG);
    headers = ["Batch No.", "Sub-Recipe", "Branch", "Staff", "Produced Date", "Yield", "Total Cost", "Status"];
    rows = list.map((r) => [r.batchNo, r.subRecipeName, r.branchName ?? "-", r.staffName ?? "-", r.producedDate, `${fmt(r.yieldQty, 2)} ${r.yieldUnit}`, fmt(r.totalCost, 2), r.status]);
    if (status) subtitle = `Status: ${status}`;
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }} className="no-print">
        <PrintButton label="Print" />
      </div>

      <div className="print-doc" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 36, boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 16, marginBottom: 20 }}>
          <Logo height={48} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: ".04em" }}>{title.toUpperCase()}</div>
            {subtitle && <div style={{ fontSize: 11.5, color: "#666", marginTop: 2 }}>{subtitle}</div>}
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Generated {todayStr()}</div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid #111" }}>
              {headers.map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 3px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #e5e5e5" }}>
                  {row.map((cell, j) => (
                    <td key={j} style={{ padding: "6px 3px" }}>{cell}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr><td colSpan={headers.length} style={{ padding: "12px 3px", color: "#888" }}>No data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

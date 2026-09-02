import { NextResponse } from "next/server";
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
import { toCsv } from "@/lib/csv";
import { canonicalUnitLabel } from "@/lib/unitMath";
import { todayStr } from "@/lib/format";

export async function GET(req: Request, { params }: { params: Promise<{ tab: string }> }) {
  await requireSection("reports", "view");
  const { tab } = await params;
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;

  let headers: string[] = [];
  let rows: (string | number | null | undefined)[][] = [];

  if (tab === "sales") {
    const report = await getRecipeSalesReport({ from, to });
    headers = ["Recipe", "Qty Sold", "Avg Price", "Revenue", "Food Cost", "Food Cost %", "Gross Profit"];
    rows = report.rows.map((r) => [r.name, r.qty, r.avgPrice, r.revenue, r.totalCost, r.foodCostPct, r.grossProfit]);
  } else if (tab === "stock") {
    const all = await getStockPageRows();
    const flagged = all.filter((r) => r.flag);
    headers = ["Item", "Category", "Stock on Hand", "Unit", "Min Level", "Value", "Flag"];
    rows = flagged.map((r) => [r.name, r.categoryName ?? "-", r.onHand, canonicalUnitLabel(r.issueUnit), r.minLevel, r.value, r.flag]);
  } else if (tab === "slowmoving") {
    const minDays = Number(sp.get("minDays") ?? 0);
    const list = await listSlowMovingItems(minDays);
    headers = ["Item", "Category", "Stock on Hand", "Unit", "Stock Value", "Last Purchased", "Days Since"];
    rows = list.map((r) => [r.name, r.categoryName ?? "-", r.qty, canonicalUnitLabel(r.issueUnit), r.stockValue, r.last ?? "Never", r.daysSince]);
  } else if (tab === "pricechange") {
    const list = await listPriceChangeEvents({ from, to });
    headers = ["Date", "GRN #", "Supplier", "Item", "Previous Rate", "New Rate", "Variance %", "Cost Impact"];
    rows = list.map((e) => [e.receivedDate, e.grnNumber, e.supplier, e.name, e.previousRate, e.newRate, e.variancePct, e.varianceValue]);
  } else if (tab === "costadjustments") {
    const q = sp.get("q") ?? undefined;
    const list = await listCostAdjustmentEvents({ q, from, to });
    headers = ["Date", "Ingredient", "Old Rate", "New Rate", "Change %", "Affected Recipes"];
    rows = list.map((e) => [
      e.date,
      e.name,
      e.oldRate,
      e.newRate,
      e.pctChange,
      e.affected.length ? e.affected.map((a) => `${a.name} ${a.impact >= 0 ? "+" : ""}${a.impact.toFixed(2)}`).join("; ") : "Not used in any recipe",
    ]);
  } else if (tab === "sections") {
    const sections = await getSectionStats();
    const sector = sp.get("sector") ?? undefined;
    const selected = sector ? sections.find((s) => s.sector === sector) : null;
    if (selected) {
      headers = ["Category", "Spend"];
      rows = selected.categories.map(([label, value]) => [label, value]);
    } else {
      headers = ["Sector", "Spend"];
      rows = sections.map((s) => [s.sector, s.spend]);
    }
  } else if (tab === "purchaseorders") {
    const q = sp.get("q") ?? undefined;
    const status = sp.get("status") ?? undefined;
    const list = await listPurchaseOrders({ q, status, from, to });
    headers = ["LPO Number", "Supplier", "Date", "Net", "VAT", "Total", "Status"];
    rows = list.map((r) => [r.poNumber, r.supplier, r.createdDate, r.net, r.vat, r.total, r.status]);
  } else if (tab === "grns") {
    const q = sp.get("q") ?? undefined;
    const status = sp.get("status") ?? undefined;
    const list = await listGrns({ q, status, from, to });
    headers = ["GRN Number", "LPO Number", "Supplier", "Received Date", "Invoice #", "Net", "VAT", "Total", "Status", "Payment"];
    rows = list.map((r) => [r.grnNumber, r.poNumber, r.supplier, r.receivedDate, r.invoiceNumber, r.net, r.vat, r.total, r.status, r.paymentMethod]);
  } else if (tab === "supplierreturns") {
    const list = await listAllSupplierReturns({ from, to });
    headers = ["Return", "GRN", "Supplier", "Reason", "Value", "Date"];
    rows = list.map((r) => [r.number, r.grnNumber, r.supplierName, r.reason, r.value, r.createdAt.toISOString().slice(0, 10)]);
  } else if (tab === "invoices") {
    const q = sp.get("q") ?? undefined;
    const status = sp.get("status") ?? undefined;
    const list = await listInvoices({ q, status, limit: 1_000_000, from, to });
    headers = ["Date", "Invoice #", "Supplier", "Net", "VAT", "Total", "Status", "Source"];
    rows = list.map((r) => [r.invoiceDate, r.invoiceNumber, r.supplier, r.net, r.vat, r.total, r.status, r.source === "grn" ? "GRN" : "Historical"]);
  } else if (tab === "wastage") {
    const status = sp.get("status") ?? undefined;
    const list = await listWastageEvents({ status, from, to });
    headers = ["Log No.", "Sector", "Branch", "Date", "Staff", "Total Cost", "Status"];
    rows = list.map((r) => [r.wastageNo, r.costCenter, r.branchName, r.eventDate, r.staffName, r.totalCost, r.status]);
  } else if (tab === "transfers") {
    const status = sp.get("status") ?? undefined;
    const list = await listTransfers({ status, from, to });
    headers = ["Transfer No.", "From", "To", "Date", "Staff", "Value", "Status"];
    rows = list.map((r) => [r.transferNo, r.fromBranchName, r.toBranchName, r.transferDate, r.staffName, r.totalCost, r.status]);
  } else if (tab === "stockcounts") {
    const status = sp.get("status") ?? undefined;
    const list = await listStockCounts({ status, from, to });
    headers = ["Count Number", "Cost Center", "Branch", "Date", "Items", "Variance Value", "Status"];
    rows = list.map((r) => [r.countNo, r.costCenter, r.branchName, r.countDate, r.lineCount, r.totalVarianceValue, r.status]);
  } else if (tab === "production") {
    const status = sp.get("status") ?? undefined;
    const list = await listProductionBatches({ status, from, to });
    headers = ["Batch No.", "Sub-Recipe", "Branch", "Staff", "Produced Date", "Yield", "Yield Unit", "Total Cost", "Status"];
    rows = list.map((r) => [r.batchNo, r.subRecipeName, r.branchName, r.staffName, r.producedDate, r.yieldQty, r.yieldUnit, r.totalCost, r.status]);
  } else {
    return new NextResponse(null, { status: 404 });
  }

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tab}-${todayStr()}.csv"`,
    },
  });
}

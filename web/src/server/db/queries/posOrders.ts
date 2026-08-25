import "server-only";
import { db } from "@/server/db";
import { posOrders } from "@/server/db/schema";
import { gte } from "drizzle-orm";

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// Order-level financial totals (gross/discount/net) — separate from
// getRecipeSalesReport, which is per-recipe qty/revenue and can't answer
// "how much did discounts cost us" since that's an order-level field, not
// derivable by summing line totals.
export async function getSalesDashboardStats(days = 30) {
  const since = daysAgoStr(days);
  const rows = await db.select().from(posOrders).where(gte(posOrders.saleDate, since));

  const grossRevenue = rows.reduce((s, r) => s + r.grossAmount, 0);
  const totalDiscount = rows.reduce((s, r) => s + r.discountAmount, 0);
  const netRevenue = rows.reduce((s, r) => s + r.netAmount, 0);
  const orderCount = rows.length;
  const avgOrderValue = orderCount ? netRevenue / orderCount : 0;
  const discountRatePct = grossRevenue ? (totalDiscount / grossRevenue) * 100 : 0;

  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.saleDate, (byDate.get(r.saleDate) ?? 0) + r.netAmount);
  const trend = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value }));

  return { grossRevenue, totalDiscount, netRevenue, orderCount, avgOrderValue, discountRatePct, trend, hasData: orderCount > 0, days };
}

import "server-only";
import { db } from "@/server/db";
import { posOrders } from "@/server/db/schema";
import { gte, lte, and } from "drizzle-orm";

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// Order-level financial totals (gross/discount/net) — separate from
// getRecipeSalesReport, which is per-recipe qty/revenue and can't answer
// "how much did discounts cost us" since that's an order-level field, not
// derivable by summing line totals. Accepts either a trailing window
// (days, the original/default call shape — still used wherever a fixed
// "last N days" figure is wanted, e.g. the Overview digest) or an explicit
// from/to range (the Dashboard's Sales tab date picker).
export async function getSalesDashboardStats(opts: number | { from?: string; to?: string; days?: number } = 30) {
  const { from, to, days } = typeof opts === "number" ? { from: undefined, to: undefined, days: opts } : opts;
  const since = from ?? daysAgoStr(days ?? 30);
  const conditions = [gte(posOrders.saleDate, since)];
  if (to) conditions.push(lte(posOrders.saleDate, to));
  const rows = await db.select().from(posOrders).where(and(...conditions));

  const grossRevenue = rows.reduce((s, r) => s + r.grossAmount, 0);
  const totalDiscount = rows.reduce((s, r) => s + r.discountAmount, 0);
  const netRevenue = rows.reduce((s, r) => s + r.netAmount, 0);
  const orderCount = rows.length;
  const avgOrderValue = orderCount ? netRevenue / orderCount : 0;
  const discountRatePct = grossRevenue ? (totalDiscount / grossRevenue) * 100 : 0;

  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.saleDate, (byDate.get(r.saleDate) ?? 0) + r.netAmount);
  const trend = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value }));

  const rangeDays = days ?? Math.max(1, Math.round((new Date(to ?? new Date().toISOString().slice(0, 10)).getTime() - new Date(since).getTime()) / 86400000));
  return { grossRevenue, totalDiscount, netRevenue, orderCount, avgOrderValue, discountRatePct, trend, hasData: orderCount > 0, days: rangeDays };
}

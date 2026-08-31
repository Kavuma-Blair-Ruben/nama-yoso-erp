import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db";
import { stockItems, stockBalances, priceHistory, purchaseOrders, purchaseOrderLines, wastageEvents, stockTransfers, stockCounts, grns, policySettings, poApprovalSteps } from "@/server/db/schema";
import { eq, gte, sql } from "drizzle-orm";
import type { Session } from "@/server/auth/session";
import { hasAccess } from "@/server/auth/session";
import { withTimeout } from "@/lib/withTimeout";

export type Notification = { id: string; severity: "critical" | "warning" | "info"; title: string; message: string; href: string };

async function getItemsNotifications(): Promise<Notification[]> {
  const items: Notification[] = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const [rows, balances, spikes] = await Promise.all([
    db.select({ id: stockItems.id, legacyCode: stockItems.legacyCode, name: stockItems.name, minLevel: stockItems.minLevel }).from(stockItems).where(eq(stockItems.isActive, true)),
    db.select({ stockItemId: stockBalances.stockItemId, qtyOnHand: stockBalances.qtyOnHand }).from(stockBalances),
    db
      .select({ stockItemId: priceHistory.stockItemId, oldRate: priceHistory.oldRate, newRate: priceHistory.newRate, name: stockItems.name, changedAt: priceHistory.changedAt })
      .from(priceHistory)
      .innerJoin(stockItems, eq(priceHistory.stockItemId, stockItems.id))
      .where(gte(priceHistory.changedAt, cutoff)),
  ]);

  const qtyByItem = new Map<string, number>();
  for (const b of balances) qtyByItem.set(b.stockItemId, (qtyByItem.get(b.stockItemId) ?? 0) + b.qtyOnHand);

  let negativeCount = 0;
  let belowMinCount = 0;
  for (const it of rows) {
    const qty = qtyByItem.get(it.id) ?? 0;
    if (qty < 0) negativeCount++;
    else if (it.minLevel != null && qty < it.minLevel) belowMinCount++;
  }
  if (negativeCount > 0) items.push({ id: "neg-stock", severity: "critical", title: "Negative stock", message: `${negativeCount} item(s) show negative stock on hand — check for a missing GRN or an over-issued transfer/wastage.`, href: "/reports?tab=stock" });
  if (belowMinCount > 0) items.push({ id: "low-stock", severity: "warning", title: "Below minimum level", message: `${belowMinCount} item(s) are below their set minimum stock level.`, href: "/reports?tab=stock" });

  const bigMoves = spikes.filter((s) => s.oldRate && s.newRate && Math.abs((s.newRate - s.oldRate) / s.oldRate) * 100 >= 10);
  if (bigMoves.length > 0) {
    const worst = bigMoves.reduce((a, b) => (Math.abs((b.newRate! - b.oldRate!) / b.oldRate!) > Math.abs((a.newRate! - a.oldRate!) / a.oldRate!) ? b : a));
    const pctChange = ((worst.newRate! - worst.oldRate!) / worst.oldRate!) * 100;
    items.push({
      id: "price-spike",
      severity: "warning",
      title: "Recent price spike",
      message: `${bigMoves.length} ingredient price move(s) of 10%+ in the last 7 days — biggest: ${worst.name} ${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(0)}%.`,
      href: "/reports?tab=costadjustments",
    });
  }
  return items;
}

async function getOrdersNotifications(): Promise<Notification[]> {
  const items: Notification[] = [];
  const [[settings], [{ n: stepCount }]] = await Promise.all([
    db.select({ threshold: policySettings.poApprovalThreshold }).from(policySettings),
    db.select({ n: sql<number>`count(*)::int` }).from(poApprovalSteps),
  ]);
  // A threshold with no chain steps configured gates nothing (see
  // updatePOStatus) — matches that same condition here so this alert can't
  // warn about an approval requirement that isn't actually blocking anyone.
  if (settings?.threshold != null && stepCount > 0) {
    const draftPos = await db
      .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, total: sql<number>`coalesce(sum(${purchaseOrderLines.qty} * ${purchaseOrderLines.rate} * (1 + ${purchaseOrderLines.taxRate}/100.0)), 0)::float8` })
      .from(purchaseOrders)
      .innerJoin(purchaseOrderLines, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
      .where(eq(purchaseOrders.status, "DRAFT"))
      .groupBy(purchaseOrders.id, purchaseOrders.poNumber);
    const pending = draftPos.filter((p) => p.total >= settings.threshold!);
    if (pending.length > 0) items.push({ id: "po-approval", severity: "warning", title: "POs awaiting approval", message: `${pending.length} draft PO(s) are at or above the AED ${settings.threshold} approval threshold.`, href: "/purchase-orders?status=DRAFT" });
  }
  return items;
}

async function getWastageNotifications(): Promise<Notification[]> {
  const items: Notification[] = [];
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(wastageEvents).where(eq(wastageEvents.status, "DRAFT"));
  if (n > 0) items.push({ id: "wastage-drafts", severity: "info", title: "Wastage drafts pending", message: `${n} wastage log(s) saved as draft — stock hasn't been updated for these yet.`, href: "/wastage?status=DRAFT" });
  return items;
}

async function getTransfersNotifications(): Promise<Notification[]> {
  const items: Notification[] = [];
  const [[{ n: draftN }], [{ n: transitN }]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(stockTransfers).where(eq(stockTransfers.status, "DRAFT")),
    db.select({ n: sql<number>`count(*)::int` }).from(stockTransfers).where(eq(stockTransfers.status, "IN_TRANSIT")),
  ]);
  if (draftN > 0) items.push({ id: "transfer-drafts", severity: "info", title: "Transfer drafts pending", message: `${draftN} transfer(s) saved as draft — nothing has moved yet.`, href: "/transfers?status=DRAFT" });
  if (transitN > 0) items.push({ id: "transfer-transit", severity: "warning", title: "Transfers awaiting receipt", message: `${transitN} transfer(s) sent and awaiting confirmation at the destination branch.`, href: "/transfers?status=IN_TRANSIT" });
  return items;
}

async function getStockcountNotifications(): Promise<Notification[]> {
  const items: Notification[] = [];
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(stockCounts).where(eq(stockCounts.status, "DRAFT"));
  if (n > 0) items.push({ id: "count-drafts", severity: "info", title: "Stock counts pending", message: `${n} stock count(s) saved as draft — variances haven't been applied yet.`, href: "/stock-count?status=DRAFT" });
  return items;
}

async function getGrnNotifications(): Promise<Notification[]> {
  const items: Notification[] = [];
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(grns).where(eq(grns.status, "DRAFT"));
  if (n > 0) items.push({ id: "grn-drafts", severity: "info", title: "GRN drafts pending", message: `${n} goods receipt(s) saved as draft — stock hasn't been updated for these yet.`, href: "/grn?status=DRAFT" });
  return items;
}

// A live, computed attention feed rather than a stored/queued notification
// log — every item here is derived fresh from current data (low stock,
// recent price spikes, drafts awaiting action, POs stuck at the approval
// gate), so there's no read/unread state to manage and it can never go
// stale or duplicate. Each type is gated by the same section permission its
// own page uses, so nobody sees a notification linking to a page they can't
// open. Runs on every authenticated page load (see the (app) layout) — the
// per-section queries used to run one after another (~10 sequential DB
// round trips for a role with full access); now every section's queries
// fire together via Promise.all instead.
//
// The whole thing is wrapped in withTimeout rather than relying on the DB
// client's statement_timeout: confirmed live that Supabase's transaction
// pooler doesn't reliably honor that session-level setting (a pg_sleep(20)
// test completed in full despite a 15s statement_timeout configured on the
// client), so it cannot be trusted as the thing bounding a slow query here.
// Cached across requests, not just within one — a hard refresh was
// re-running all 6 of these on every page load via the shared layout, on
// top of the session check above it. Keyed by which sections this specific
// user can see (not just their id) so two users with different access
// never share a cache entry that leaks a section one of them can't open.
// 20s revalidate: stock/price/draft data moving that recently is rare
// enough that a brief staleness on an attention feed (not a source of
// truth for any action) is a fair trade for skipping 6 queries on every
// single page view.
const getCachedNotificationSections = unstable_cache(
  async (
    userId: string,
    access: { items: boolean; orders: boolean; wastage: boolean; transfers: boolean; stockcount: boolean; grn: boolean }
  ): Promise<Notification[][]> =>
    Promise.all([
      access.items ? getItemsNotifications() : Promise.resolve([]),
      access.orders ? getOrdersNotifications() : Promise.resolve([]),
      access.wastage ? getWastageNotifications() : Promise.resolve([]),
      access.transfers ? getTransfersNotifications() : Promise.resolve([]),
      access.stockcount ? getStockcountNotifications() : Promise.resolve([]),
      access.grn ? getGrnNotifications() : Promise.resolve([]),
    ]),
  ["notification-sections-v1"],
  { revalidate: 20 }
);

export async function getNotifications(session: Session): Promise<Notification[]> {
  const access = {
    items: hasAccess(session, "items", "view"),
    orders: hasAccess(session, "orders", "view"),
    wastage: hasAccess(session, "wastage", "view"),
    transfers: hasAccess(session, "transfers", "view"),
    stockcount: hasAccess(session, "stockcount", "view"),
    grn: hasAccess(session, "grn", "view"),
  };

  let sections: Notification[][];
  try {
    sections = await withTimeout(getCachedNotificationSections(session.userId, access), 10000, "TIMEOUT");
  } catch {
    return [];
  }
  const items = sections.flat();

  const order = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}

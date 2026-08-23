import "server-only";
import { db } from "@/server/db";
import { suppliers, invoicesHistorical, purchaseLinesHistorical, grns, stockItems } from "@/server/db/schema";
import { eq, sql, desc, sum, count } from "drizzle-orm";

// A price move of this size or more (up or down) since the last recorded
// change gets flagged for follow-up with the supplier.
const PRICE_FLUCTUATION_THRESHOLD_PCT = 10;

export async function listSuppliers(q?: string) {
  const list = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      // Even single-table subqueries here must use literal qualified text: interpolating
      // ${suppliers.id} (the outer, correlated table) renders as a bare "id", which
      // Postgres silently resolves to the LOCAL invoices_historical/grns "id" column
      // instead of erroring — wrong data with no error, not a crash. Confirmed empirically
      // (bare version returned 0 for every supplier; qualified returns real totals).
      totalSpend: sql<number>`coalesce((select sum(invoices_historical.total) from invoices_historical where invoices_historical.supplier_id = suppliers.id), 0)::float8`,
      outstanding: sql<number>`coalesce((select sum(invoices_historical.total) from invoices_historical where invoices_historical.supplier_id = suppliers.id and invoices_historical.status = 'OUTSTANDING'), 0)::float8`,
      deliveryCount: sql<number>`(select count(distinct grns.id) from grns where grns.supplier_id = suppliers.id and grns.status = 'POSTED')::int`,
      // These two subqueries also JOIN grn_lines+grns (both have "id"), compounding the
      // same trap — every reference, including the outer correlation, must be qualified.
      acceptedLines: sql<number>`(select count(*) from grn_lines join grns on grn_lines.grn_id = grns.id where grns.supplier_id = suppliers.id and grns.status = 'POSTED' and grn_lines.condition = 'ACCEPTED')::int`,
      totalLines: sql<number>`(select count(*) from grn_lines join grns on grn_lines.grn_id = grns.id where grns.supplier_id = suppliers.id and grns.status = 'POSTED')::int`,
      avgLeadTimeDays: sql<number | null>`(
        select avg(extract(day from grns.received_date::timestamp - purchase_orders.created_date::timestamp))::float8
        from grns join purchase_orders on grns.purchase_order_id = purchase_orders.id
        where grns.supplier_id = suppliers.id and grns.status = 'POSTED'
      )`,
    })
    .from(suppliers)
    .where(q ? sql`${suppliers.name} ilike ${"%" + q + "%"}` : undefined)
    .orderBy(sql`3 desc`); // totalSpend, descending

  return list.map((s) => ({
    ...s,
    qualityPct: s.totalLines > 0 ? (s.acceptedLines / s.totalLines) * 100 : null,
    stars: s.totalLines > 0 ? Math.max(1, Math.min(5, Math.round(((s.acceptedLines / s.totalLines) * 100) / 20))) : null,
  }));
}

export async function getSupplierDetail(id: string) {
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!supplier) return null;

  const [invoiceAgg] = await db
    .select({ count: count(), total: sum(invoicesHistorical.total), outstanding: sql<number>`coalesce(sum(case when ${invoicesHistorical.status} = 'OUTSTANDING' then ${invoicesHistorical.total} else 0 end), 0)` })
    .from(invoicesHistorical)
    .where(eq(invoicesHistorical.supplierId, id));

  const invoices = await db
    .select()
    .from(invoicesHistorical)
    .where(eq(invoicesHistorical.supplierId, id))
    .orderBy(desc(invoicesHistorical.invoiceDate))
    .limit(100);

  const topItems = await db
    .select({ item: purchaseLinesHistorical.itemLabel, spend: sum(purchaseLinesHistorical.amount) })
    .from(purchaseLinesHistorical)
    .where(eq(purchaseLinesHistorical.supplierId, id))
    .groupBy(purchaseLinesHistorical.itemLabel)
    .orderBy(sql`sum(${purchaseLinesHistorical.amount}) desc`)
    .limit(10);

  const recentGrns = await db
    .select({ id: grns.id, grnNumber: grns.grnNumber, receivedDate: grns.receivedDate, status: grns.status })
    .from(grns)
    .where(eq(grns.supplierId, id))
    .orderBy(desc(grns.receivedDate))
    .limit(20);

  return {
    supplier,
    invoiceCount: invoiceAgg.count,
    totalSpend: Number(invoiceAgg.total ?? 0),
    outstanding: Number(invoiceAgg.outstanding ?? 0),
    invoices,
    topItems: topItems.map((t) => ({ item: t.item, spend: Number(t.spend ?? 0) })),
    recentGrns,
  };
}

export async function listSupplierProducts(supplierId: string) {
  const rows = await db
    .select({
      id: stockItems.id,
      legacyCode: stockItems.legacyCode,
      name: stockItems.name,
      purchaseUnit: stockItems.purchaseUnit,
      purchaseRate: stockItems.purchaseRate,
      // Following the standing rule for this codebase (see nama-yoso-nextjs-migration
      // memory): always literal-qualify every reference inside a raw sql subquery,
      // even single-table ones, since a silently-wrong bare "id" produces no error.
      lastOldRate: sql<number | null>`(select old_rate from price_history where price_history.stock_item_id = stock_items.id order by changed_at desc limit 1)::float8`,
      lastNewRate: sql<number | null>`(select new_rate from price_history where price_history.stock_item_id = stock_items.id order by changed_at desc limit 1)::float8`,
      lastChangedAt: sql<string | null>`(select changed_at::text from price_history where price_history.stock_item_id = stock_items.id order by changed_at desc limit 1)`,
    })
    .from(stockItems)
    .where(eq(stockItems.supplierId, supplierId))
    .orderBy(stockItems.name);

  return rows.map((r) => {
    const changePct = r.lastOldRate && r.lastOldRate !== 0 ? ((r.lastNewRate ?? r.purchaseRate ?? 0) - r.lastOldRate) / r.lastOldRate * 100 : null;
    const flagged = changePct != null && Math.abs(changePct) >= PRICE_FLUCTUATION_THRESHOLD_PCT;
    return { ...r, changePct, flagged };
  });
}

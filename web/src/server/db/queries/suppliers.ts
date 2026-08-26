import "server-only";
import { db } from "@/server/db";
import { suppliers, invoicesHistorical, purchaseLinesHistorical, grns, grnLines, purchaseOrders, stockItems } from "@/server/db/schema";
import { eq, sql, desc, sum, count } from "drizzle-orm";

// A price move of this size or more (up or down) since the last recorded
// change gets flagged for follow-up with the supplier.
const PRICE_FLUCTUATION_THRESHOLD_PCT = 10;

// Each metric below is its own GROUP BY over its own table, joined to
// suppliers as a derived table — one pass per table total. The previous
// version ran 5 correlated subqueries PER supplier row (300+ subquery
// evaluations for 60 suppliers), which measured at 3.6s on the live DB;
// this shape does the same aggregation in one pass per table regardless of
// supplier count.
export async function listSuppliers(q?: string) {
  const invoiceAgg = db
    .select({
      supplierId: invoicesHistorical.supplierId,
      totalSpend: sql<number>`sum(${invoicesHistorical.total})::float8`.as("total_spend"),
      outstanding: sql<number>`coalesce(sum(case when ${invoicesHistorical.status} = 'OUTSTANDING' then ${invoicesHistorical.total} else 0 end), 0)::float8`.as("outstanding"),
    })
    .from(invoicesHistorical)
    .groupBy(invoicesHistorical.supplierId)
    .as("invoice_agg");

  const grnAgg = db
    .select({
      supplierId: grns.supplierId,
      deliveryCount: sql<number>`count(distinct ${grns.id})::int`.as("delivery_count"),
    })
    .from(grns)
    .where(eq(grns.status, "POSTED"))
    .groupBy(grns.supplierId)
    .as("grn_agg");

  const grnLinesAgg = db
    .select({
      supplierId: grns.supplierId,
      acceptedLines: sql<number>`count(*) filter (where ${grnLines.condition} = 'ACCEPTED')::int`.as("accepted_lines"),
      totalLines: sql<number>`count(*)::int`.as("total_lines"),
    })
    .from(grnLines)
    .innerJoin(grns, eq(grnLines.grnId, grns.id))
    .where(eq(grns.status, "POSTED"))
    .groupBy(grns.supplierId)
    .as("grn_lines_agg");

  const leadTimeAgg = db
    .select({
      supplierId: grns.supplierId,
      avgLeadTimeDays: sql<number | null>`avg(extract(day from ${grns.receivedDate}::timestamp - ${purchaseOrders.createdDate}::timestamp))::float8`.as("avg_lead_time_days"),
    })
    .from(grns)
    .innerJoin(purchaseOrders, eq(grns.purchaseOrderId, purchaseOrders.id))
    .where(eq(grns.status, "POSTED"))
    .groupBy(grns.supplierId)
    .as("lead_time_agg");

  const list = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      totalSpend: sql<number>`coalesce(${invoiceAgg.totalSpend}, 0)`,
      outstanding: sql<number>`coalesce(${invoiceAgg.outstanding}, 0)`,
      deliveryCount: sql<number>`coalesce(${grnAgg.deliveryCount}, 0)`,
      acceptedLines: sql<number>`coalesce(${grnLinesAgg.acceptedLines}, 0)`,
      totalLines: sql<number>`coalesce(${grnLinesAgg.totalLines}, 0)`,
      avgLeadTimeDays: leadTimeAgg.avgLeadTimeDays,
    })
    .from(suppliers)
    .leftJoin(invoiceAgg, eq(invoiceAgg.supplierId, suppliers.id))
    .leftJoin(grnAgg, eq(grnAgg.supplierId, suppliers.id))
    .leftJoin(grnLinesAgg, eq(grnLinesAgg.supplierId, suppliers.id))
    .leftJoin(leadTimeAgg, eq(leadTimeAgg.supplierId, suppliers.id))
    .where(q ? sql`${suppliers.name} ilike ${"%" + q + "%"}` : undefined)
    .orderBy(sql`3 desc`); // totalSpend, descending

  return list.map((s) => {
    const qualityPct = s.totalLines > 0 ? (s.acceptedLines / s.totalLines) * 100 : null;
    const { grade, gradeScore } = supplierGrade(qualityPct, s.avgLeadTimeDays);
    return {
      ...s,
      qualityPct,
      stars: s.totalLines > 0 ? Math.max(1, Math.min(5, Math.round((qualityPct! ) / 20))) : null,
      grade,
      gradeScore,
    };
  });
}

// A-F supplier scorecard: 60% GRN acceptance rate (quality of what actually
// arrives), 40% average PO->GRN lead time (speed). Either component is
// dropped from the blend (and the other used alone) when there isn't enough
// history yet — a brand-new supplier with one fast delivery and no accepted/
// rejected data shouldn't be graded on quality it hasn't demonstrated. A
// supplier with neither signal gets no grade at all rather than a fabricated
// middle score.
export function supplierGrade(qualityPct: number | null, avgLeadTimeDays: number | null): { grade: string | null; gradeScore: number | null } {
  const qualityComponent = qualityPct;
  // 0 days -> 100, 14+ days -> 0, linear between.
  const leadComponent = avgLeadTimeDays != null ? Math.max(0, Math.min(100, 100 - avgLeadTimeDays * 7)) : null;

  let score: number | null;
  if (qualityComponent != null && leadComponent != null) score = qualityComponent * 0.6 + leadComponent * 0.4;
  else if (qualityComponent != null) score = qualityComponent;
  else if (leadComponent != null) score = leadComponent;
  else score = null;

  if (score == null) return { grade: null, gradeScore: null };
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : score >= 50 ? "E" : "F";
  return { grade, gradeScore: score };
}

// Petty-cash Direct GRNs still need a real supplier row (grns.supplier_id
// is NOT NULL, and there's no walk-in concept in the schema) — this
// resolves a single shared "Petty Cash" supplier, creating it once if it
// doesn't exist yet. It behaves like any other supplier for reporting
// (its spend just shows up as its own line), so no filtering elsewhere.
export async function getOrCreateCashSupplierId(): Promise<string> {
  const [existing] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.name, "Petty Cash"));
  if (existing) return existing.id;
  const [created] = await db.insert(suppliers).values({ name: "Petty Cash", notes: "System supplier for petty-cash purchases with no formal invoice." }).returning({ id: suppliers.id });
  return created.id;
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

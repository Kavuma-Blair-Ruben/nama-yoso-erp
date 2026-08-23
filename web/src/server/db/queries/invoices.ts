import "server-only";
import { db } from "@/server/db";
import { invoicesHistorical, purchaseLinesHistorical, suppliers, grns } from "@/server/db/schema";
import { and, eq, ilike, or, desc, isNotNull, ne, sql } from "drizzle-orm";

export type InvoiceRow = {
  id: string;
  source: "historical" | "grn";
  invoiceDate: string | null;
  invoiceNumber: string | null;
  supplierId: string | null;
  supplier: string | null;
  net: number | null;
  vat: number | null;
  total: number | null;
  status: string | null;
};

// A GRN with a real Tax Invoice/Delivery Note attached doubles as its own AP
// record — this merges it into the same list as the imported historical
// ledger so there's one place to see everything owed, regardless of source.
export async function listInvoices(filters: { q?: string; status?: string }): Promise<InvoiceRow[]> {
  const historicalConditions = [];
  if (filters.q) historicalConditions.push(or(ilike(invoicesHistorical.invoiceNumber, `%${filters.q}%`), ilike(suppliers.name, `%${filters.q}%`))!);
  if (filters.status) historicalConditions.push(eq(invoicesHistorical.status, filters.status));

  const historicalRows = await db
    .select({
      id: invoicesHistorical.id,
      invoiceDate: invoicesHistorical.invoiceDate,
      invoiceNumber: invoicesHistorical.invoiceNumber,
      supplierId: invoicesHistorical.supplierId,
      supplier: suppliers.name,
      net: invoicesHistorical.net,
      vat: invoicesHistorical.vat,
      total: invoicesHistorical.total,
      status: invoicesHistorical.status,
    })
    .from(invoicesHistorical)
    .leftJoin(suppliers, eq(invoicesHistorical.supplierId, suppliers.id))
    .where(historicalConditions.length ? and(...historicalConditions) : undefined)
    .orderBy(desc(invoicesHistorical.invoiceDate))
    .limit(500);

  let grnRows: InvoiceRow[] = [];
  // GRN payment status is only ever OUTSTANDING/PAID — a status filter for
  // "OTHER" (a historical-only bucket) should simply exclude all GRN rows.
  if (!filters.status || filters.status === "OUTSTANDING" || filters.status === "PAID") {
    const grnConditions = [eq(grns.status, "POSTED"), isNotNull(grns.invoiceNumber), ne(grns.invoiceNumber, "")];
    if (filters.q) grnConditions.push(or(ilike(grns.invoiceNumber, `%${filters.q}%`), ilike(suppliers.name, `%${filters.q}%`))!);
    if (filters.status) grnConditions.push(eq(grns.paymentStatus, filters.status));

    const rawGrnRows = await db
      .select({
        id: grns.id,
        invoiceDate: grns.receivedDate,
        invoiceNumber: grns.invoiceNumber,
        supplierId: grns.supplierId,
        supplier: suppliers.name,
        paymentStatus: grns.paymentStatus,
        // Single-table-looking subqueries here still risk the silent bare-id
        // bug documented elsewhere in this codebase (the outer query joins
        // suppliers, which also has "id") — literal-qualify every reference.
        net: sql<number>`coalesce((select sum(case when grn_lines.is_foc then 0 else grn_lines.received_qty * grn_lines.rate * (1 - grn_lines.discount_pct / 100) end) from grn_lines where grn_lines.grn_id = grns.id), 0)::float8`,
        vat: sql<number>`coalesce((select sum(case when grn_lines.is_foc then 0 else grn_lines.received_qty * grn_lines.rate * (1 - grn_lines.discount_pct / 100) * grn_lines.tax_rate / 100 end) from grn_lines where grn_lines.grn_id = grns.id), 0)::float8`,
      })
      .from(grns)
      .leftJoin(suppliers, eq(grns.supplierId, suppliers.id))
      .where(and(...grnConditions))
      .orderBy(desc(grns.receivedDate))
      .limit(500);

    grnRows = rawGrnRows.map((r) => ({
      id: r.id,
      source: "grn" as const,
      invoiceDate: r.invoiceDate,
      invoiceNumber: r.invoiceNumber,
      supplierId: r.supplierId,
      supplier: r.supplier,
      net: r.net,
      vat: r.vat,
      total: r.net + r.vat,
      status: r.paymentStatus,
    }));
  }

  const historical: InvoiceRow[] = historicalRows.map((r) => ({ ...r, source: "historical" as const }));
  return [...historical, ...grnRows].sort((a, b) => (b.invoiceDate ?? "").localeCompare(a.invoiceDate ?? "")).slice(0, 500);
}

export async function getInvoiceDetail(id: string) {
  const [invoice] = await db
    .select({
      id: invoicesHistorical.id,
      invoiceDate: invoicesHistorical.invoiceDate,
      invoiceNumber: invoicesHistorical.invoiceNumber,
      supplierId: invoicesHistorical.supplierId,
      supplier: suppliers.name,
      net: invoicesHistorical.net,
      vat: invoicesHistorical.vat,
      total: invoicesHistorical.total,
      terms: invoicesHistorical.terms,
      weekLabel: invoicesHistorical.weekLabel,
      status: invoicesHistorical.status,
    })
    .from(invoicesHistorical)
    .leftJoin(suppliers, eq(invoicesHistorical.supplierId, suppliers.id))
    .where(eq(invoicesHistorical.id, id));
  if (!invoice) return null;

  const lines = await db
    .select({
      id: purchaseLinesHistorical.id,
      purchaseDate: purchaseLinesHistorical.purchaseDate,
      itemLabel: purchaseLinesHistorical.itemLabel,
      unitLabel: purchaseLinesHistorical.unitLabel,
      qty: purchaseLinesHistorical.qty,
      rate: purchaseLinesHistorical.rate,
      amount: purchaseLinesHistorical.amount,
      category: purchaseLinesHistorical.category,
    })
    .from(purchaseLinesHistorical)
    .where(eq(purchaseLinesHistorical.invoiceId, id));

  return { invoice, lines };
}

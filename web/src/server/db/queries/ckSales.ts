import "server-only";
import { db } from "@/server/db";
import { customers, priceLists, deliveryNotes, deliveryNoteLines, customerReturns, customerReturnLines, stockItems, branches } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";

export async function listPriceLists() {
  return db.select().from(priceLists).orderBy(priceLists.name);
}

export async function listCustomers() {
  return db
    .select({
      id: customers.id,
      name: customers.name,
      group: customers.group,
      priceListId: customers.priceListId,
      priceListName: priceLists.name,
      email: customers.email,
      phone: customers.phone,
    })
    .from(customers)
    .leftJoin(priceLists, eq(customers.priceListId, priceLists.id))
    .orderBy(customers.name);
}

// Cost-based or margin-based, per the customer's assigned price list — falls
// back to plain cost price if no price list is assigned. Matches
// index.html's computeCustomerPrice, just reading ratePerKgL (the canonical
// live rate every other screen in this app already costs against).
export async function getCustomersForPicker() {
  return db
    .select({ id: customers.id, name: customers.name, priceListMode: priceLists.mode, priceListMarginPct: priceLists.marginPct })
    .from(customers)
    .leftJoin(priceLists, eq(customers.priceListId, priceLists.id))
    .orderBy(customers.name);
}

export async function listDeliveryNotes() {
  return db
    .select({
      id: deliveryNotes.id,
      number: deliveryNotes.number,
      docType: deliveryNotes.docType,
      customerName: customers.name,
      branchName: branches.name,
      deliveryDate: deliveryNotes.deliveryDate,
      total: deliveryNotes.total,
    })
    .from(deliveryNotes)
    .innerJoin(customers, eq(deliveryNotes.customerId, customers.id))
    .innerJoin(branches, eq(deliveryNotes.branchId, branches.id))
    .orderBy(desc(deliveryNotes.number));
}

export async function getDeliveryNoteDetail(id: string) {
  const [dn] = await db
    .select({
      id: deliveryNotes.id,
      number: deliveryNotes.number,
      docType: deliveryNotes.docType,
      customerId: deliveryNotes.customerId,
      customerName: customers.name,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      branchId: deliveryNotes.branchId,
      branchName: branches.name,
      deliveryDate: deliveryNotes.deliveryDate,
      total: deliveryNotes.total,
    })
    .from(deliveryNotes)
    .innerJoin(customers, eq(deliveryNotes.customerId, customers.id))
    .innerJoin(branches, eq(deliveryNotes.branchId, branches.id))
    .where(eq(deliveryNotes.id, id));
  if (!dn) return null;

  const lines = await db
    .select({ id: deliveryNoteLines.id, stockItemId: deliveryNoteLines.stockItemId, name: stockItems.name, legacyCode: stockItems.legacyCode, qty: deliveryNoteLines.qty, unitLabel: deliveryNoteLines.unitLabel, price: deliveryNoteLines.price, amount: deliveryNoteLines.amount })
    .from(deliveryNoteLines)
    .innerJoin(stockItems, eq(deliveryNoteLines.stockItemId, stockItems.id))
    .where(eq(deliveryNoteLines.deliveryNoteId, id));

  // Already-returned qty per line, so the return builder can't double-return.
  const returnedLines = await db
    .select({ deliveryNoteLineId: customerReturnLines.deliveryNoteLineId, qty: customerReturnLines.qty })
    .from(customerReturnLines)
    .innerJoin(customerReturns, eq(customerReturnLines.customerReturnId, customerReturns.id))
    .where(eq(customerReturns.deliveryNoteId, id));
  const returnedByLine = new Map<string, number>();
  for (const r of returnedLines) returnedByLine.set(r.deliveryNoteLineId, (returnedByLine.get(r.deliveryNoteLineId) ?? 0) + r.qty);

  return { dn, lines: lines.map((l) => ({ ...l, returnedQty: returnedByLine.get(l.id) ?? 0 })) };
}

export async function listCustomerReturns() {
  return db
    .select({ id: customerReturns.id, number: customerReturns.number, dnNumber: deliveryNotes.number, deliveryNoteId: customerReturns.deliveryNoteId, reason: customerReturns.reason, value: customerReturns.value, createdAt: customerReturns.createdAt })
    .from(customerReturns)
    .innerJoin(deliveryNotes, eq(customerReturns.deliveryNoteId, deliveryNotes.id))
    .orderBy(desc(customerReturns.number));
}

import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./index";

export async function nextPoNumber(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('po_number_seq') as nextval`);
  return "PO-" + String(rows[0].nextval).padStart(5, "0");
}

export async function nextGrnNumber(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('grn_number_seq') as nextval`);
  return "GRN-" + String(rows[0].nextval).padStart(5, "0");
}

export async function nextCreditNoteNumber(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('credit_note_number_seq') as nextval`);
  return "CN-" + String(rows[0].nextval).padStart(5, "0");
}

export async function nextConsolidatedInvoiceNumber(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('consolidated_invoice_number_seq') as nextval`);
  return "CI-" + String(rows[0].nextval).padStart(5, "0");
}

export async function nextBatchNumber(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('batch_number_seq') as nextval`);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return "B" + today + "-" + String(rows[0].nextval).padStart(4, "0");
}

export async function nextLotNumber(legacyCode: string): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('lot_number_seq') as nextval`);
  return "LOT-" + legacyCode + "-" + String(rows[0].nextval).padStart(3, "0");
}

export async function nextProductionBatchNo(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('production_batch_number_seq') as nextval`);
  return "PB-" + String(rows[0].nextval).padStart(5, "0");
}

export async function nextWastageNo(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('wastage_event_number_seq') as nextval`);
  return "WST-" + String(rows[0].nextval).padStart(5, "0");
}

export async function nextTransferNo(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('transfer_number_seq') as nextval`);
  return "TRF-" + String(rows[0].nextval).padStart(5, "0");
}

export async function nextStockCountNo(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('stock_count_number_seq') as nextval`);
  return "SC-" + String(rows[0].nextval).padStart(5, "0");
}

export async function nextMrNumber(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('mr_number_seq') as nextval`);
  return "MR-" + String(rows[0].nextval).padStart(6, "0");
}

export async function nextDnNumber(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('dn_number_seq') as nextval`);
  return "DN-" + String(rows[0].nextval).padStart(5, "0");
}

export async function nextProNumber(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('pro_number_seq') as nextval`);
  return "PRO-" + String(rows[0].nextval).padStart(5, "0");
}

export async function nextReturnNumber(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('return_number_seq') as nextval`);
  return "RET-" + String(rows[0].nextval).padStart(5, "0");
}

export async function nextSupplierReturnNumber(): Promise<string> {
  const rows = await db.execute<{ nextval: number }>(sql`select nextval('supplier_return_number_seq') as nextval`);
  return "SRET-" + String(rows[0].nextval).padStart(5, "0");
}

// Continues the existing numeric SKU sequence in stock_items (not a fresh
// Postgres sequence) — the real data isn't ranged per-category, so this is
// simply "one past whatever the highest existing numeric code is".
export async function nextProductCode(): Promise<string> {
  const rows = await db.execute<{ max: number | null }>(
    sql`select max(legacy_code::int) as max from stock_items where legacy_code ~ '^[0-9]+$'`
  );
  return String((rows[0].max ?? 0) + 1);
}

export async function nextRecipeCode(prefix: "MR" | "SR"): Promise<string> {
  const table = prefix === "MR" ? sql`main_recipes` : sql`sub_recipes`;
  const rows = await db.execute<{ max: number | null }>(
    sql`select max(substring(legacy_code from 3)::int) as max from ${table} where legacy_code ~ ${`^${prefix}[0-9]+$`}`
  );
  return prefix + String((rows[0].max ?? 0) + 1).padStart(3, "0");
}

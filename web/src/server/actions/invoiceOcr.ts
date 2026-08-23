"use server";

import { assertPermission } from "@/server/auth/permissions";
import { extractInvoiceData, isInvoiceOcrConfigured, type ExtractedInvoice } from "@/lib/invoiceOcr";

export type { ExtractedInvoice, ExtractedInvoiceLine } from "@/lib/invoiceOcr";

export async function extractGrnInvoice(attachmentUrl: string): Promise<{ error?: string; data?: ExtractedInvoice }> {
  await assertPermission("grn", "edit");
  if (!attachmentUrl) return { error: "Upload the invoice file first." };
  if (!isInvoiceOcrConfigured()) {
    return { error: "AI invoice extraction isn't configured yet — add ANTHROPIC_API_KEY to .env.local." };
  }
  return extractInvoiceData(attachmentUrl);
}

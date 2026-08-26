import "server-only";
import { db } from "@/server/db";
import { printRoutes, devices } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { sendToDevicePrinter } from "@/lib/printerSocket";

export type AutoPrintDocumentType = "expiry_ticket" | "production_label" | "wastage_ticket" | "grn_label" | "product_label";

// Best-effort — an unconfigured or unreachable printer must never fail the
// real business transaction (wastage posted, batch opened) that triggered
// it. Returns a status string instead of throwing so callers can log it
// without wrapping every call site in its own try/catch.
export async function sendToRoutedPrinter(branchId: string, documentType: AutoPrintDocumentType, ticket: Buffer): Promise<{ ok: boolean; status: string }> {
  try {
    const [row] = await db
      .select({ device: devices })
      .from(printRoutes)
      .innerJoin(devices, eq(printRoutes.deviceId, devices.id))
      .where(and(eq(printRoutes.branchId, branchId), eq(printRoutes.documentType, documentType), eq(devices.isActive, true)));
    if (!row) return { ok: false, status: "No printer routed for this document type on this branch." };
    return await sendToDevicePrinter(row.device, ticket);
  } catch (err) {
    return { ok: false, status: err instanceof Error ? err.message : "Auto-print failed." };
  }
}

import "server-only";
import { db } from "@/server/db";
import { printRoutes, devices } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { sendToDevicePrinter } from "@/lib/printerSocket";
import { sendPrintNodeJob } from "@/lib/printnode";

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

// Product/GRN lot labels only — a "roll" document type where the target
// device might be a real driver-based label printer (Brother QL-800 etc.)
// rather than a receipt printer. Only a PrintNode-connected 'label_printer'
// device gets the PDF treatment; every other connection (network socket,
// or a printnode device typed as 'receipt_printer') falls back to the same
// raw ESC/POS path sendToRoutedPrinter already uses, unchanged.
export async function sendLabelToRoutedPrinter(
  branchId: string,
  documentType: "product_label" | "grn_label",
  escposFallback: Buffer,
  buildPdf: () => Promise<Buffer>
): Promise<{ ok: boolean; status: string }> {
  try {
    const [row] = await db
      .select({ device: devices })
      .from(printRoutes)
      .innerJoin(devices, eq(printRoutes.deviceId, devices.id))
      .where(and(eq(printRoutes.branchId, branchId), eq(printRoutes.documentType, documentType), eq(devices.isActive, true)));
    if (!row) return { ok: false, status: "No printer routed for this document type on this branch." };
    const { device } = row;

    if (device.connection === "printnode" && device.type === "label_printer") {
      if (!device.printnodePrinterId) return { ok: false, status: "Pick a PrintNode printer first." };
      const pdf = await buildPdf();
      const result = await sendPrintNodeJob(device.printnodePrinterId, pdf, device.name, "pdf_base64");
      return result.ok ? { ok: true, status: `Sent via PrintNode (job #${result.jobId ?? "?"})` } : { ok: false, status: result.error ?? "Failed to send via PrintNode." };
    }

    return await sendToDevicePrinter(device, escposFallback);
  } catch (err) {
    return { ok: false, status: err instanceof Error ? err.message : "Auto-print failed." };
  }
}

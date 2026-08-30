import "server-only";
import { db } from "@/server/db";
import { printRoutes, devices, branches } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export const DOCUMENT_TYPES = ["expiry_ticket", "production_label", "wastage_ticket", "grn_label", "product_label"] as const;

// One round trip for the Print Routing settings panel: every branch, every
// receipt printer that could plausibly be routed (plain-text ESC/POS
// tickets only — label printers aren't offered here, see the print_routes
// schema comment), and whatever's currently assigned.
export async function listPrintRoutingContext() {
  // Sequential, not Promise.all — concurrent connection opens against the
  // Supabase pooler have been observed to hang under load (same reasoning
  // as dashboard.ts's cached queries); each of these is cheap enough alone
  // that staying sequential costs little and reuses one warm connection.
  const branchList = await db.select({ id: branches.id, name: branches.name }).from(branches);
  const deviceList = await db
    .select({ id: devices.id, name: devices.name, branchId: devices.branchId, connection: devices.connection, isActive: devices.isActive })
    .from(devices)
    .where(eq(devices.type, "receipt_printer"));
  const routeList = await db
    .select({ id: printRoutes.id, branchId: printRoutes.branchId, documentType: printRoutes.documentType, deviceId: printRoutes.deviceId })
    .from(printRoutes);
  return { branches: branchList, devices: deviceList, routes: routeList };
}

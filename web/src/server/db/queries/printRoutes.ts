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
  const [branchList, deviceList, routeList] = await Promise.all([
    db.select({ id: branches.id, name: branches.name }).from(branches),
    db
      .select({ id: devices.id, name: devices.name, branchId: devices.branchId, connection: devices.connection, isActive: devices.isActive })
      .from(devices)
      .where(eq(devices.type, "receipt_printer")),
    db.select({ id: printRoutes.id, branchId: printRoutes.branchId, documentType: printRoutes.documentType, deviceId: printRoutes.deviceId }).from(printRoutes),
  ]);
  return { branches: branchList, devices: deviceList, routes: routeList };
}

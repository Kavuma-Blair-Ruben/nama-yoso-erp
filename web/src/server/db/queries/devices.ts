import "server-only";
import { db } from "@/server/db";
import { devices, branches } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function listDevices() {
  return db
    .select({
      id: devices.id,
      name: devices.name,
      type: devices.type,
      connection: devices.connection,
      address: devices.address,
      branchId: devices.branchId,
      branchName: branches.name,
      notes: devices.notes,
      lastTestedAt: devices.lastTestedAt,
      lastTestStatus: devices.lastTestStatus,
      lastTestOk: devices.lastTestOk,
      printnodePrinterId: devices.printnodePrinterId,
      isActive: devices.isActive,
    })
    .from(devices)
    .leftJoin(branches, eq(devices.branchId, branches.id))
    .orderBy(devices.name);
}

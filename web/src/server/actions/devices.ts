"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { devices, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { parseDeviceAddress, tcpProbe, sendToDevicePrinter } from "@/lib/printerSocket";
import { buildTestPrintTicket, buildExpiryTicketEscPos, buildBarcodeTestTicket } from "@/lib/escpos";
import { listExpiringBatches } from "@/server/db/queries/expiry";
import { listPrintNodePrinters, isPrintNodeConfigured } from "@/lib/printnode";

const DEVICE_TYPES = ["label_printer", "receipt_printer", "barcode_scanner", "document_scanner", "fax", "other"] as const;
const CONNECTIONS = ["network", "bluetooth", "wifi_direct", "printnode", "other"] as const;

export type CreateDeviceInput = { name: string; type: string; connection: string; address?: string; printnodePrinterId?: number; branchId?: string; notes?: string };

export async function createDevice(input: CreateDeviceInput): Promise<{ error?: string }> {
  const session = await assertPermission("system", "edit");
  const name = input.name.trim();
  if (!name) return { error: "Enter a device name." };
  if (!DEVICE_TYPES.includes(input.type as (typeof DEVICE_TYPES)[number])) return { error: "Invalid device type." };
  if (!CONNECTIONS.includes(input.connection as (typeof CONNECTIONS)[number])) return { error: "Invalid connection type." };
  if (input.connection === "network" && !input.address?.trim()) return { error: "Enter an IP address for a network device." };
  if (input.connection === "printnode" && !input.printnodePrinterId) return { error: "Pick a PrintNode printer." };

  await db.insert(devices).values({
    name,
    type: input.type,
    connection: input.connection,
    address: input.address?.trim() || undefined,
    printnodePrinterId: input.printnodePrinterId,
    branchId: input.branchId || undefined,
    notes: input.notes?.trim() || undefined,
  });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Device", entityLabel: name, detail: `${input.type} via ${input.connection}` });
  revalidatePath("/system-settings");
  revalidatePath("/devices");
  return {};
}

export async function listPrintNodePrintersForPicker(): Promise<{ printers?: { id: number; name: string; description: string | null; state: string; computerName: string | null }[]; error?: string }> {
  await assertPermission("system", "edit");
  if (!isPrintNodeConfigured()) return { error: "PrintNode isn't configured — add PRINTNODE_API_KEY to .env.local." };
  return listPrintNodePrinters();
}

export async function deleteDevice(id: string): Promise<{ error?: string }> {
  const session = await assertPermission("system", "edit");
  const [device] = await db.select({ name: devices.name }).from(devices).where(eq(devices.id, id));
  await db.delete(devices).where(eq(devices.id, id));
  if (device) await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Device", entityLabel: device.name, detail: "Removed" });
  revalidatePath("/system-settings");
  revalidatePath("/devices");
  return {};
}

export async function setDeviceActive(id: string, isActive: boolean): Promise<{ error?: string }> {
  const session = await assertPermission("system", "edit");
  const [device] = await db.select({ name: devices.name }).from(devices).where(eq(devices.id, id));
  if (!device) return { error: "Device not found." };

  await db.update(devices).set({ isActive }).where(eq(devices.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: isActive ? "Activated" : "Deactivated", entity: "Device", entityLabel: device.name, detail: isActive ? "Marked active" : "Marked inactive" });
  revalidatePath("/system-settings");
  revalidatePath("/devices");
  return {};
}

// A real TCP connection attempt, not a mock — for a device with connection
// 'network', this is exactly the kind of raw socket a print job to that
// printer's port would open (the standard "JetDirect"/port-9100 raw-print
// path most label/receipt printers speak), so success here genuinely means
// this server can reach the device. Bluetooth/Wi-Fi Direct devices pair
// directly with whatever phone/tablet is running the browser, not with this
// server, so there's nothing for the server to test — say so instead of
// faking a result.
export async function testDeviceConnection(id: string): Promise<{ error?: string; ok?: boolean; message?: string }> {
  const session = await assertPermission("system", "edit");
  const [device] = await db.select().from(devices).where(eq(devices.id, id));
  if (!device) return { error: "Device not found." };

  if (device.connection === "printnode") {
    if (!device.printnodePrinterId) return { error: "Pick a PrintNode printer first." };
    const { printers, error } = await listPrintNodePrinters();
    if (error) return { error };
    const p = printers?.find((pr) => pr.id === device.printnodePrinterId);
    const online = p?.state === "online";
    const status = !p
      ? "That printer is no longer registered in PrintNode."
      : online
        ? `PrintNode: ${p.name} is online${p.computerName ? ` (on ${p.computerName})` : ""}`
        : `PrintNode: ${p.name} is offline — check the PrintNode client is running on that computer.`;
    await db.update(devices).set({ lastTestedAt: new Date(), lastTestStatus: status, lastTestOk: online }).where(eq(devices.id, id));
    await db.insert(auditLog).values({ actorId: session.profile.id, action: "Tested", entity: "Device", entityLabel: device.name, detail: status });
    revalidatePath("/system-settings");
    revalidatePath("/devices");
    return online ? { ok: true, message: status } : { error: status };
  }

  if (device.connection !== "network") {
    const label = device.connection === "bluetooth" ? "Bluetooth" : device.connection === "wifi_direct" ? "Wi-Fi Direct" : "This";
    return { message: `${label} devices pair directly with the phone or tablet running the app — there's nothing for this server to test. Try printing or scanning from the device that's paired with it.` };
  }
  if (!device.address) return { error: "Enter an IP address (and optional :port) first." };

  const { host, port } = parseDeviceAddress(device.address);
  const result = await tcpProbe(host, port);
  const status = result.ok ? `Reachable at ${host}:${port}` : (result.error ?? "Unreachable");
  await db.update(devices).set({ lastTestedAt: new Date(), lastTestStatus: status, lastTestOk: result.ok }).where(eq(devices.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Tested", entity: "Device", entityLabel: device.name, detail: status });
  revalidatePath("/system-settings");
  revalidatePath("/devices");

  if (!result.ok) return { error: result.error };
  return { ok: true, message: status };
}

// Proves a registered device can actually render a scannable barcode, not
// just plain text — the open question before any real GRN/product label
// printing gets wired through the Device pipeline instead of the browser
// print dialog. Same shape as sendTestPrint, different ticket content.
export async function sendBarcodeTestPrint(id: string): Promise<{ error?: string; ok?: boolean; message?: string }> {
  const session = await assertPermission("system", "edit");
  const [device] = await db.select().from(devices).where(eq(devices.id, id));
  if (!device) return { error: "Device not found." };

  const ticket = buildBarcodeTestTicket(device.name);
  const result = await sendToDevicePrinter(device, ticket);

  await db.update(devices).set({ lastTestedAt: new Date(), lastTestStatus: result.status, lastTestOk: result.ok }).where(eq(devices.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Test Printed", entity: "Device", entityLabel: device.name, detail: `${result.status} (barcode test)` });
  revalidatePath("/system-settings");
  revalidatePath("/devices");

  if (!result.ok) return { error: result.status };
  return { ok: true, message: `${result.status} — scan the printed code and confirm it reads "NY-TEST-00128".` };
}

export async function sendTestPrint(id: string): Promise<{ error?: string; ok?: boolean; message?: string }> {
  const session = await assertPermission("system", "edit");
  const [device] = await db.select().from(devices).where(eq(devices.id, id));
  if (!device) return { error: "Device not found." };

  const ticket = buildTestPrintTicket(device.name);
  const result = await sendToDevicePrinter(device, ticket);

  await db.update(devices).set({ lastTestedAt: new Date(), lastTestStatus: result.status, lastTestOk: result.ok }).where(eq(devices.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Test Printed", entity: "Device", entityLabel: device.name, detail: result.status });
  revalidatePath("/system-settings");
  revalidatePath("/devices");

  if (!result.ok) return { error: result.status };
  return { ok: true, message: `${result.status} — check the printer for output.` };
}

// Demonstrates the exact content the auto-print expiry ticket
// (ExpiryTicketAutoPrint.tsx) would send, but through the raw ESC/POS path
// instead of a browser print dialog. Uses a real overdue batch/lot if one
// exists so the printed ticket is genuine data, not filler.
export async function sendExpiryTicketTestPrint(id: string): Promise<{ error?: string; ok?: boolean; message?: string }> {
  const session = await assertPermission("system", "edit");
  const [device] = await db.select().from(devices).where(eq(devices.id, id));
  if (!device) return { error: "Device not found." };

  const expiring = await listExpiringBatches();
  const overdue = expiring.find((b) => b.bucket === "EXPIRED");
  const ticketData = overdue
    ? { name: overdue.name, code: overdue.code, batchNo: overdue.batchNo, lotNo: overdue.lotNo, expiryDate: overdue.expiryDate, daysLeft: overdue.daysLeft, reference: overdue.reference }
    : { name: "Demo Product (No Real Expired Items)", code: "DEMO-001", batchNo: "DEMO-BATCH", lotNo: "DEMO-LOT", expiryDate: "2026-01-01", daysLeft: -1, reference: "DEMO" };

  const ticket = buildExpiryTicketEscPos(ticketData);
  const result = await sendToDevicePrinter(device, ticket);

  await db.update(devices).set({ lastTestedAt: new Date(), lastTestStatus: result.status, lastTestOk: result.ok }).where(eq(devices.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Test Printed", entity: "Device", entityLabel: device.name, detail: result.status });
  revalidatePath("/system-settings");
  revalidatePath("/devices");

  if (!result.ok) return { error: result.status };
  return { ok: true, message: `${result.status} (${overdue ? overdue.name : "demo data — no real expired item found"}) — check the printer for output.` };
}

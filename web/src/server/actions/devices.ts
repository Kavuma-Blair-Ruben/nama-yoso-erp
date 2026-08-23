"use server";

import net from "node:net";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { devices, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";

const DEVICE_TYPES = ["label_printer", "receipt_printer", "barcode_scanner", "other"] as const;
const CONNECTIONS = ["network", "bluetooth", "wifi_direct", "other"] as const;

export type CreateDeviceInput = { name: string; type: string; connection: string; address?: string; branchId?: string; notes?: string };

export async function createDevice(input: CreateDeviceInput): Promise<{ error?: string }> {
  const session = await assertPermission("system", "edit");
  const name = input.name.trim();
  if (!name) return { error: "Enter a device name." };
  if (!DEVICE_TYPES.includes(input.type as (typeof DEVICE_TYPES)[number])) return { error: "Invalid device type." };
  if (!CONNECTIONS.includes(input.connection as (typeof CONNECTIONS)[number])) return { error: "Invalid connection type." };
  if (input.connection === "network" && !input.address?.trim()) return { error: "Enter an IP address for a network device." };

  await db.insert(devices).values({ name, type: input.type, connection: input.connection, address: input.address?.trim() || undefined, branchId: input.branchId || undefined, notes: input.notes?.trim() || undefined });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Device", entityLabel: name, detail: `${input.type} via ${input.connection}` });
  revalidatePath("/system-settings");
  return {};
}

export async function deleteDevice(id: string): Promise<{ error?: string }> {
  const session = await assertPermission("system", "edit");
  const [device] = await db.select({ name: devices.name }).from(devices).where(eq(devices.id, id));
  await db.delete(devices).where(eq(devices.id, id));
  if (device) await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Device", entityLabel: device.name, detail: "Removed" });
  revalidatePath("/system-settings");
  return {};
}

export async function setDeviceActive(id: string, isActive: boolean): Promise<{ error?: string }> {
  const session = await assertPermission("system", "edit");
  const [device] = await db.select({ name: devices.name }).from(devices).where(eq(devices.id, id));
  if (!device) return { error: "Device not found." };

  await db.update(devices).set({ isActive }).where(eq(devices.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: isActive ? "Activated" : "Deactivated", entity: "Device", entityLabel: device.name, detail: isActive ? "Marked active" : "Marked inactive" });
  revalidatePath("/system-settings");
  return {};
}

function parseAddress(address: string): { host: string; port: number } {
  const [host, portStr] = address.split(":");
  // 9100 — the de facto standard "raw"/JetDirect printing port most network
  // label and receipt printers listen on when no port is given explicitly.
  return { host, port: portStr ? Number(portStr) : 9100 };
}

function tcpProbe(host: string, port: number, timeoutMs = 3000): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, error: `Timed out connecting to ${host}:${port} after ${timeoutMs / 1000}s — check the IP and that the device is on the same network.` }));
    socket.once("error", (err: Error) => finish({ ok: false, error: `Couldn't reach ${host}:${port} — ${err.message}` }));
    socket.connect(port, host);
  });
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

  if (device.connection !== "network") {
    const label = device.connection === "bluetooth" ? "Bluetooth" : device.connection === "wifi_direct" ? "Wi-Fi Direct" : "This";
    return { message: `${label} devices pair directly with the phone or tablet running the app — there's nothing for this server to test. Try printing or scanning from the device that's paired with it.` };
  }
  if (!device.address) return { error: "Enter an IP address (and optional :port) first." };

  const { host, port } = parseAddress(device.address);
  const result = await tcpProbe(host, port);
  const status = result.ok ? `Reachable at ${host}:${port}` : (result.error ?? "Unreachable");
  await db.update(devices).set({ lastTestedAt: new Date(), lastTestStatus: status }).where(eq(devices.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Tested", entity: "Device", entityLabel: device.name, detail: status });
  revalidatePath("/system-settings");

  if (!result.ok) return { error: result.error };
  return { ok: true, message: status };
}

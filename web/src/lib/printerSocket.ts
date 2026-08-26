import "server-only";
import net from "node:net";
import type { devices } from "@/server/db/schema";
import { sendPrintNodeJob } from "@/lib/printnode";

export function parseDeviceAddress(address: string): { host: string; port: number } {
  const [host, portStr] = address.split(":");
  // 9100 — the de facto standard "raw"/JetDirect printing port most network
  // label and receipt printers listen on when no port is given explicitly.
  return { host, port: portStr ? Number(portStr) : 9100 };
}

export function tcpProbe(host: string, port: number, timeoutMs = 3000): Promise<{ ok: boolean; error?: string }> {
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

// Connects, writes raw bytes (e.g. ESC/POS ticket data), then half-closes and
// waits for the printer to close its end. A successful write+close proves
// the printer's socket accepted the data; it can't guarantee paper actually
// came out (jam, empty roll, unsupported command set on an off-brand clone).
export function sendRawData(host: string, port: number, data: Buffer, timeoutMs = 5000): Promise<{ ok: boolean; error?: string }> {
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
    socket.once("connect", () => socket.end(data));
    socket.once("close", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, error: `Timed out sending to ${host}:${port} — check the IP and that the printer is on.` }));
    socket.once("error", (err: Error) => finish({ ok: false, error: `Couldn't reach ${host}:${port} — ${err.message}` }));
    socket.connect(port, host);
  });
}

// Sends real print bytes down whichever path the device is registered for —
// a raw TCP socket to an IP the server itself can reach ('network'), or a
// PrintNode print job relayed through PrintNode's client app on whatever
// computer is actually on the printer's network ('printnode'). Bluetooth/
// Wi-Fi Direct devices have no server-reachable path at all. Shared by the
// manual "Send Test Print" actions and the automatic print-routing helper
// (src/lib/printRouting.ts) — kept here rather than in the "use server"
// actions file so both can import it as a plain function.
export async function sendToDevicePrinter(device: typeof devices.$inferSelect, data: Buffer): Promise<{ ok: boolean; status: string }> {
  if (device.connection === "printnode") {
    if (!device.printnodePrinterId) return { ok: false, status: "Pick a PrintNode printer first." };
    const result = await sendPrintNodeJob(device.printnodePrinterId, data, device.name);
    return result.ok ? { ok: true, status: `Sent via PrintNode (job #${result.jobId ?? "?"})` } : { ok: false, status: result.error ?? "Failed to send via PrintNode." };
  }
  if (device.connection !== "network") return { ok: false, status: "Only network (IP) or PrintNode receipt printers can receive a print from this server." };
  if (!device.address) return { ok: false, status: "Enter an IP address (and optional :port) first." };

  const { host, port } = parseDeviceAddress(device.address);
  const result = await sendRawData(host, port, data);
  return result.ok ? { ok: true, status: `Sent to ${host}:${port}` } : { ok: false, status: result.error ?? "Failed to send." };
}

import "server-only";
import net from "node:net";

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

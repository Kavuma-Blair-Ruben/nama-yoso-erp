import "server-only";

// PrintNode (printnode.com) — a hosted print-relay service. A free client
// app runs on any PC on the same network as the printer; this server posts
// print jobs to PrintNode's API, and PrintNode relays them to that client,
// which sends them on to the actual printer. This is how a cloud-hosted app
// (Render, with no path into anyone's home/office LAN) can still reach a
// printer sitting on a private network — the client is the bridge.
const BASE_URL = "https://api.printnode.com";

export function isPrintNodeConfigured(): boolean {
  return !!process.env.PRINTNODE_API_KEY;
}

function authHeader(): string {
  // HTTP Basic auth with the API key as username, blank password.
  return "Basic " + Buffer.from(`${process.env.PRINTNODE_API_KEY}:`).toString("base64");
}

export type PrintNodePrinter = {
  id: number;
  name: string;
  description: string | null;
  state: string; // "online" | "offline" (etc.)
  computerName: string | null;
};

export async function listPrintNodePrinters(): Promise<{ printers?: PrintNodePrinter[]; error?: string }> {
  if (!isPrintNodeConfigured()) return { error: "PrintNode isn't configured — add PRINTNODE_API_KEY to .env.local." };

  const res = await fetch(`${BASE_URL}/printers`, { headers: { Authorization: authHeader() }, cache: "no-store" });
  if (!res.ok) return { error: `PrintNode API error ${res.status}: ${await res.text().catch(() => res.statusText)}` };

  const data = await res.json();
  const printers: PrintNodePrinter[] = (Array.isArray(data) ? data : []).map((p: { id: number; name: string; description?: string; state?: string; computer?: { name?: string } }) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    state: p.state ?? "unknown",
    computerName: p.computer?.name ?? null,
  }));
  return { printers };
}

export async function sendPrintNodeJob(
  printerId: number,
  content: Buffer,
  title: string,
  // "raw_base64" (default) sends the bytes straight through, unmodified —
  // correct for ESC/POS receipt tickets, meaningless to a driver-based label
  // printer like the Brother QL-800. "pdf_base64" instead hands PrintNode a
  // real PDF, which it prints through the receiving computer's own OS driver
  // — the only path that actually renders on hardware like the QL-800.
  contentType: "raw_base64" | "pdf_base64" = "raw_base64"
): Promise<{ ok?: boolean; jobId?: number; error?: string }> {
  if (!isPrintNodeConfigured()) return { error: "PrintNode isn't configured — add PRINTNODE_API_KEY to .env.local." };

  const res = await fetch(`${BASE_URL}/printjobs`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      printerId,
      title,
      contentType,
      content: content.toString("base64"),
      source: "NAMA YOSO ERP",
    }),
  });

  if (!res.ok) return { error: `PrintNode rejected the print job (${res.status}): ${await res.text().catch(() => res.statusText)}` };
  const jobId = await res.json().catch(() => null);
  return { ok: true, jobId: typeof jobId === "number" ? jobId : undefined };
}

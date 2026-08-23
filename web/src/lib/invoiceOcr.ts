import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type ExtractedInvoiceLine = { description: string; qty: number; unitLabel: string | null; rate: number; taxRatePct: number };
export type ExtractedInvoice = { supplierName: string | null; invoiceNumber: string | null; invoiceDate: string | null; lines: ExtractedInvoiceLine[] };

export function isInvoiceOcrConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const EXTRACTION_PROMPT = `You are extracting structured data from a supplier invoice or delivery note image for a restaurant's goods-receiving system. Read the document and return ONLY a JSON object (no markdown fences, no commentary) with this exact shape:
{
  "supplierName": string | null,
  "invoiceNumber": string | null,
  "invoiceDate": string | null,
  "lines": [
    { "description": string, "qty": number, "unitLabel": string | null, "rate": number, "taxRatePct": number }
  ]
}
Rules:
- "invoiceDate" must be YYYY-MM-DD if determinable, else null.
- "qty" is the quantity received/invoiced for that line, as a plain number.
- "rate" is the unit price per the line's unit, before tax, as a plain number with no currency symbol.
- "taxRatePct" is the tax/VAT percentage applied to that line (e.g. 5 for 5% VAT); use 0 if the document shows no tax for that line.
- Skip subtotal/total/tax-summary rows — only include actual line items with a real quantity and price.
- If a field truly cannot be determined, use null for strings or 0 for numbers rather than guessing.
- Return valid JSON only, nothing else.`;

function imageMediaType(contentType: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (contentType.includes("png")) return "image/png";
  if (contentType.includes("webp")) return "image/webp";
  if (contentType.includes("gif")) return "image/gif";
  return "image/jpeg";
}

// Downloads the already-uploaded invoice file and asks Claude to read it
// directly (vision for images, native PDF support for scanned/emailed
// invoices) — no separate OCR service, no local parsing.
export async function extractInvoiceData(fileUrl: string): Promise<{ error?: string; data?: ExtractedInvoice }> {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) return { error: "Couldn't download the uploaded invoice file to read it." };
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const isPdf = contentType.includes("pdf");
    if (!isPdf && !contentType.startsWith("image/")) {
      return { error: "AI extraction only supports image or PDF invoices." };
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const base64 = buffer.toString("base64");

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
              : { type: "image", source: { type: "base64", media_type: imageMediaType(contentType), data: base64 } },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return { error: "The AI didn't return readable text." };
    const jsonText = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return { error: "Couldn't parse the AI's response — try again or enter items manually." };
    }
    if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { lines?: unknown }).lines)) {
      return { error: "The AI response wasn't in the expected format — try again or enter items manually." };
    }
    const raw = parsed as { supplierName?: unknown; invoiceNumber?: unknown; invoiceDate?: unknown; lines: unknown[] };
    const lines: ExtractedInvoiceLine[] = raw.lines
      .map((l): ExtractedInvoiceLine => {
        const r = l as Record<string, unknown>;
        return {
          description: typeof r.description === "string" ? r.description : "",
          qty: Number(r.qty) || 0,
          unitLabel: typeof r.unitLabel === "string" && r.unitLabel ? r.unitLabel : null,
          rate: Number(r.rate) || 0,
          taxRatePct: Number(r.taxRatePct) || 0,
        };
      })
      .filter((l) => l.description && l.qty > 0);

    if (lines.length === 0) return { error: "Couldn't find any line items on that document — try a clearer photo or enter items manually." };

    return {
      data: {
        supplierName: typeof raw.supplierName === "string" ? raw.supplierName : null,
        invoiceNumber: typeof raw.invoiceNumber === "string" ? raw.invoiceNumber : null,
        invoiceDate: typeof raw.invoiceDate === "string" ? raw.invoiceDate : null,
        lines,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? `AI extraction failed: ${err.message}` : "AI extraction failed." };
  }
}

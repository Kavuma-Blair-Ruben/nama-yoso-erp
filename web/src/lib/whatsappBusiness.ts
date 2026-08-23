import "server-only";

// Sends documents via the Meta WhatsApp Business Cloud API. Requires a Meta
// Business account with the WhatsApp Business Platform set up, a permanent
// access token, and (for business-initiated messages, which this always is)
// a pre-approved message template with a document header component — a
// freeform "here's your PDF" message cannot be sent as the first contact.
// See docs: https://developers.facebook.com/docs/whatsapp/cloud-api

export function isWhatsAppBusinessConfigured(): boolean {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsAppDocument(input: {
  to: string; // digits only, with country code, no leading +
  documentUrl: string; // publicly reachable URL Meta's servers can fetch
  filename: string;
  templateName: string; // must already be approved in Meta Business Manager
  templateParams: string[]; // positional {{1}}, {{2}}... body variables
}): Promise<{ error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { error: "WhatsApp Business API isn't configured yet — add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to .env.local." };
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: input.to,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: "en" },
        components: [
          { type: "header", parameters: [{ type: "document", document: { link: input.documentUrl, filename: input.filename } }] },
          { type: "body", parameters: input.templateParams.map((p) => ({ type: "text", text: p })) },
        ],
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { error: `WhatsApp send failed (${res.status}): ${body.slice(0, 300)}` };
  }
  return {};
}

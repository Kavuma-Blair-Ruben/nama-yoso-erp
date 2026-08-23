import "server-only";
import { Resend } from "resend";

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<{ error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "Email sending isn't configured yet — add RESEND_API_KEY to .env.local." };

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL || "NAMA YOSO <onboarding@resend.dev>";

  const { error } = await resend.emails.send({ from, to: input.to, subject: input.subject, text: input.text });
  if (error) return { error: error.message || "Failed to send email." };
  return {};
}

export async function sendEmailWithAttachment(input: {
  to: string;
  subject: string;
  text: string;
  attachment: { filename: string; content: Buffer };
}): Promise<{ error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "Email sending isn't configured yet — add RESEND_API_KEY to .env.local." };

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL || "NAMA YOSO <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    attachments: [{ filename: input.attachment.filename, content: input.attachment.content }],
  });

  if (error) return { error: error.message || "Failed to send email." };
  return {};
}

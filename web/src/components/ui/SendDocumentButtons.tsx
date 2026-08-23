"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type SendResult = { error?: string; ok?: boolean };

export function SendDocumentButtons({
  documentLabel,
  hasEmail,
  whatsappConfigured,
  waTextHref,
  pdfHref,
  sendEmailAction,
  sendWhatsAppAction,
}: {
  documentLabel: string;
  hasEmail: boolean;
  whatsappConfigured: boolean;
  /** Existing text-only wa.me link — kept as a fallback until the WhatsApp Business API is configured. */
  waTextHref: string | null;
  pdfHref: string;
  sendEmailAction: () => Promise<SendResult>;
  sendWhatsAppAction: () => Promise<SendResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: "email" | "whatsapp"; ok?: boolean; error?: string } | null>(null);
  const router = useRouter();

  function handleEmail() {
    setStatus(null);
    startTransition(async () => {
      const res = await sendEmailAction();
      if (res.error) setStatus({ kind: "email", error: res.error });
      else {
        setStatus({ kind: "email", ok: true });
        router.refresh();
      }
    });
  }

  function handleWhatsApp() {
    setStatus(null);
    startTransition(async () => {
      const res = await sendWhatsAppAction();
      if (res.error) setStatus({ kind: "whatsapp", error: res.error });
      else {
        setStatus({ kind: "whatsapp", ok: true });
        router.refresh();
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div className="btn-row" style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {hasEmail && (
          <button type="button" className="btn ghost" disabled={pending} onClick={handleEmail}>
            {pending ? "Sending…" : `Email ${documentLabel} (PDF)`}
          </button>
        )}
        {whatsappConfigured ? (
          <button type="button" className="btn ghost" disabled={pending} onClick={handleWhatsApp}>
            {pending ? "Sending…" : `WhatsApp ${documentLabel} (PDF)`}
          </button>
        ) : (
          waTextHref && (
            <a className="btn ghost" href={waTextHref} target="_blank" rel="noopener noreferrer">
              WhatsApp {documentLabel}
            </a>
          )
        )}
        <a className="btn ghost" href={pdfHref} target="_blank" rel="noopener noreferrer">
          Download PDF
        </a>
      </div>
      {status?.error && <div className="login-error" style={{ fontSize: 11 }}>{status.error}</div>}
      {status?.ok && (
        <div style={{ fontSize: 11, color: "var(--good)" }}>
          {status.kind === "email" ? "Emailed" : "Sent via WhatsApp"} successfully.
        </div>
      )}
    </div>
  );
}

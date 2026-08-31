"use client";

import { useState, useTransition } from "react";
import { printProductionLabelCopy } from "@/server/actions/production";

// Fires straight to the branch's routed printer, no browser dialog — see
// printProductionLabelCopy for why this replaced the browser-print label
// sheet as the default path.
export function PrintLabelCopyButton({ batchId }: { batchId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function print() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await printProductionLabelCopy(batchId);
      if (result.error) setError(result.error);
      else setMessage(result.message ?? "Sent to printer.");
    });
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button type="button" className="btn ghost" disabled={pending} onClick={print}>
        {pending ? "Sending…" : "Print Batch/Lot Label"}
      </button>
      {message && <span style={{ fontSize: 11, color: "var(--good)" }}>{message}</span>}
      {error && <span style={{ fontSize: 11, color: "var(--bad)" }}>{error}</span>}
    </div>
  );
}

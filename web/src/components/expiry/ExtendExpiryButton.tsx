"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { extendExpiry, type ExpirySource } from "@/server/actions/expiry";

export function ExtendExpiryButton({ id, source, extensionsLeft }: { id: string; source: ExpirySource; extensionsLeft: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (extensionsLeft <= 0) {
    return <span style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>Max extensions used</span>;
  }

  if (!open) {
    return (
      <button type="button" className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setOpen(true)}>
        Extend ({extensionsLeft} left)
      </button>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await extendExpiry(source, id, date);
      if (result.error) setError(result.error);
      else {
        setOpen(false);
        setDate("");
        router.refresh();
      }
    });
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ fontSize: 11, padding: "2px 4px" }} />
      <button type="button" className="btn accent" style={{ padding: "2px 8px", fontSize: 11 }} disabled={pending || !date} onClick={submit}>
        {pending ? "…" : "Confirm"}
      </button>
      <button type="button" className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} disabled={pending} onClick={() => { setOpen(false); setError(null); }}>
        Cancel
      </button>
      {error && <span style={{ fontSize: 10.5, color: "var(--bad)" }}>{error}</span>}
    </span>
  );
}

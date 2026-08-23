"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markGrnPaymentStatus } from "@/server/actions/grn";

export function PaymentStatusToggle({ id, status }: { id: string; status: "OUTSTANDING" | "PAID" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    const next = status === "PAID" ? "OUTSTANDING" : "PAID";
    startTransition(async () => {
      const result = await markGrnPaymentStatus(id, next);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      {error && <div className="login-error" style={{ marginBottom: 8 }}>{error}</div>}
      <button className={`btn ${status === "PAID" ? "ghost" : "accent"}`} disabled={pending} onClick={toggle}>
        {pending ? "Saving…" : status === "PAID" ? "Mark as Outstanding" : "Mark as Paid"}
      </button>
    </div>
  );
}

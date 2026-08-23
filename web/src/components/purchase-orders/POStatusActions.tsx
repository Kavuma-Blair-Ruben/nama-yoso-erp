"use client";

import { useState, useTransition } from "react";
import { updatePOStatus } from "@/server/actions/purchaseOrders";

const NEXT_STATUSES: Record<string, string[]> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["ORDERED", "CANCELLED"],
  ORDERED: ["CANCELLED"],
  "PARTIALLY RECEIVED": [],
  "FULLY RECEIVED": [],
  CANCELLED: [],
};

export function POStatusActions({ id, status }: { id: string; status: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const actions = NEXT_STATUSES[status] ?? [];
  if (actions.length === 0) return null;

  function handleClick(newStatus: string) {
    setError(null);
    startTransition(async () => {
      const result = await updatePOStatus(id, newStatus);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div>
      <div className="section-title">Update Status</div>
      {error && <div className="login-error">{error}</div>}
      <div className="btn-row">
        {actions.map((a) => (
          <button key={a} className={`btn ${a === "CANCELLED" ? "ghost" : "accent"}`} disabled={pending} onClick={() => handleClick(a)}>
            Mark as {a}
          </button>
        ))}
      </div>
    </div>
  );
}

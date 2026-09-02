"use client";

import { useState, useTransition } from "react";
import { reviewLimitOverride } from "@/server/actions/policies";

type Request = { id: string; requestType: string; amount: number; context: string | null; requestedByName: string; createdAt: string | Date };

export function PendingLimitOverrides({ requests, isApprover }: { requests: Request[]; isApprover: boolean }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isApprover) return null;

  function decide(id: string, decision: "APPROVED" | "DENIED") {
    setPendingId(id);
    startTransition(async () => {
      await reviewLimitOverride(id, decision);
      setPendingId(null);
    });
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Pending Limit Override Requests</h3></div>
      <div className="panel-body">
        <div className="callout">You&apos;re a designated approver — review requests to exceed a role&apos;s PO/GRN limit below.</div>
        {requests.length ? (
          requests.map((r) => (
            <div className="usedin-item" key={r.id}>
              <span className="name">
                {r.requestType} — AED {r.amount.toFixed(2)} — {r.requestedByName}
                <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>{r.context}</div>
              </span>
              <span className="code">
                <button className="btn accent" style={{ marginRight: 6 }} disabled={pending && pendingId === r.id} onClick={() => decide(r.id, "APPROVED")}>
                  {pending && pendingId === r.id ? "…" : "Approve"}
                </button>
                <button className="btn ghost" disabled={pending && pendingId === r.id} onClick={() => decide(r.id, "DENIED")}>
                  Deny
                </button>
              </span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>No pending requests.</div>
        )}
      </div>
    </div>
  );
}

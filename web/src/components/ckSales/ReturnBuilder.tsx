"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomerReturn } from "@/server/actions/ckSales";
import { fmt, money } from "@/lib/format";

type Line = { id: string; name: string; legacyCode: string; qty: number; unitLabel: string | null; price: number; amount: number; returnedQty: number };

export function ReturnBuilder({ deliveryNoteId, dnNumber, lines }: { deliveryNoteId: string; dnNumber: string; lines: Line[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const value = lines.filter((l) => selected.has(l.id)).reduce((s, l) => s + l.amount, 0);

  function submit() {
    setError(null);
    if (selected.size === 0) return setError("Select at least one line to return.");
    startTransition(async () => {
      const result = await createCustomerReturn({ deliveryNoteId, reason: reason || undefined, lineIds: [...selected] });
      if (result.error) setError(result.error);
      else router.push(`/ck-sales/${deliveryNoteId}`);
    });
  }

  return (
    <div className="panel" style={{ border: "2px solid var(--accent)", maxWidth: 700 }}>
      <div className="panel-head"><h3>Customer Return — {dnNumber}</h3></div>
      <div className="panel-body">
        <div className="callout">Select which lines the customer is returning/rejecting. Stock is added back for accepted returns.</div>
        {lines.map((l) => {
          const alreadyReturned = l.returnedQty >= l.qty;
          return (
            <label key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)", opacity: alreadyReturned ? 0.5 : 1 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" disabled={alreadyReturned} checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                {l.legacyCode} — {l.name} — {fmt(l.qty, 2)} {l.unitLabel ?? ""}
                {alreadyReturned && <span className="tag neutral">already returned</span>}
              </span>
              <span className="mono-r">{money(l.amount, 2)}</span>
            </label>
          );
        })}
        <div className="form-row" style={{ marginTop: 12 }}>
          <label>Reason</label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong item delivered" />
        </div>
        <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Return Value</b></span><span className="v">{money(value, 2)}</span></div>
        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          <button className="btn accent" disabled={pending} onClick={submit}>{pending ? "Processing…" : "Process Return"}</button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestCreditNote, updateCreditNoteStatus } from "@/server/actions/creditNotes";
import { money } from "@/lib/format";

type CreditNote = { id: string; creditNoteNumber: string; amount: number; reason: string; status: string; createdAt: Date };

function statusTagClass(status: string) {
  if (status === "ISSUED") return "good";
  if (status === "REJECTED") return "bad";
  return "neutral";
}

export function CreditNoteSection({ grnId, notes, canEdit, canRequest, maxAmount }: { grnId: string; notes: CreditNote[]; canEdit: boolean; canRequest: boolean; maxAmount: number }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(() => maxAmount.toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitRequest() {
    setError(null);
    if (!reason.trim()) {
      setError("Enter a reason for the credit/return request.");
      return;
    }
    const amt = Number(amount);
    if (!(amt > 0)) {
      setError("Enter the amount being credited/returned.");
      return;
    }
    startTransition(async () => {
      const result = await requestCreditNote(grnId, reason, amt);
      if (result.error) setError(result.error);
      else {
        setShowForm(false);
        setReason("");
        setAmount(maxAmount.toFixed(2));
        router.refresh();
      }
    });
  }

  function setStatus(id: string, status: "ISSUED" | "REJECTED") {
    startTransition(async () => {
      await updateCreditNoteStatus(id, status);
      router.refresh();
    });
  }

  if (notes.length === 0 && !canRequest) return null;

  return (
    <div className="panel" style={{ marginTop: 16, marginBottom: 16 }}>
      <div className="panel-head">
        <h3>Credit / Return Requests</h3>
        {canRequest && !showForm && (
          <button className="btn ghost" onClick={() => setShowForm(true)}>
            Request Credit / Return
          </button>
        )}
      </div>
      <div className="panel-body">
        {showForm && (
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
            <div className="form-row">
              <label>Amount</label>
              <input
                type="text"
                inputMode="decimal"
                style={{ width: 160, font: "500 13px var(--sans)", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8 }}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>
                Defaults to the full GRN value ({money(maxAmount, 2)}) — edit it down for a partial credit/return.
              </div>
            </div>
            <div className="form-row">
              <label>Reason</label>
              <textarea
                rows={2}
                style={{ width: "100%", font: "500 13px var(--sans)", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8 }}
                placeholder="e.g. 2kg of salmon arrived spoiled"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {error && <div className="login-error">{error}</div>}
            <div className="btn-row">
              <button className="btn accent" disabled={pending} onClick={submitRequest}>
                {pending ? "Submitting…" : "Submit Request"}
              </button>
              <button className="btn ghost" disabled={pending} onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {notes.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>No credit or return requests against this GRN.</div>
        ) : (
          notes.map((n) => (
            <div className="field-row" key={n.id} style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                <span>
                  <b>{n.creditNoteNumber}</b> <span className={`tag ${statusTagClass(n.status)}`}>{n.status}</span>
                </span>
                <span className="tabular">{money(n.amount, 2)}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{n.reason}</div>
              {canEdit && n.status === "REQUESTED" && (
                <div className="btn-row" style={{ marginTop: 2 }}>
                  <button className="btn ghost" style={{ padding: "3px 10px", fontSize: 11 }} disabled={pending} onClick={() => setStatus(n.id, "ISSUED")}>
                    Mark Issued
                  </button>
                  <button className="btn ghost" style={{ padding: "3px 10px", fontSize: 11 }} disabled={pending} onClick={() => setStatus(n.id, "REJECTED")}>
                    Mark Rejected
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

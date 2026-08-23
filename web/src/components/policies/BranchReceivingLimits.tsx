"use client";

import { useState, useTransition } from "react";
import { saveBranchReceivingLimit, removeBranchReceivingLimit } from "@/server/actions/policies";

type Limit = { branchId: string; branchName: string; amount: number; frequency: string };

export function BranchReceivingLimits({ limits, branches, canEdit }: { limits: Limit[]; branches: { id: string; name: string }[]; canEdit: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const byBranchId = new Set(limits.map((l) => l.branchId));

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Branch Receiving Limits</h3></div>
      <div className="panel-body">
        {limits.length ? (
          limits.map((l) => (
            <div className="usedin-item" key={l.branchId}>
              <span className="name">{l.branchName}</span>
              <span className="code">
                AED {Math.round(l.amount).toLocaleString()} / {l.frequency}
                {canEdit && (
                  <>
                    {" "}
                    <a
                      href="#"
                      style={{ color: "var(--bad)" }}
                      onClick={(e) => {
                        e.preventDefault();
                        startTransition(async () => {
                          await removeBranchReceivingLimit(l.branchId);
                        });
                      }}
                    >
                      remove
                    </a>
                  </>
                )}
              </span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>No branch receiving limits set yet.</div>
        )}

        {canEdit && !showForm && (
          <button className="btn accent" style={{ marginTop: 10 }} onClick={() => setShowForm(true)}>
            + Add Branch Limit
          </button>
        )}

        {canEdit && showForm && (
          <form
            action={async (formData) => {
              await saveBranchReceivingLimit(undefined, formData);
              setShowForm(false);
            }}
            style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}
          >
            <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div>Branch</div>
              <div>Max receiving value (AED)</div>
              <div>Frequency</div>
            </div>
            <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
              <select name="branchId">
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {byBranchId.has(b.id) ? " (configured)" : ""}
                  </option>
                ))}
              </select>
              <input type="text" inputMode="decimal" name="amount" placeholder="e.g. 8000" />
              <select name="frequency">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <div className="btn-row">
              <button className="btn accent" type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save Limit"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

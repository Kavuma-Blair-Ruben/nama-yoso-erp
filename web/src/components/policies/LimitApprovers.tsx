"use client";

import { useState, useTransition } from "react";
import { addLimitApprover, removeLimitApprover } from "@/server/actions/policies";

type Approver = { id: string; userId: string; name: string; email: string };
type Profile = { id: string; name: string };

export function LimitApprovers({ approvers, profiles, canEdit }: { approvers: Approver[]; profiles: Profile[]; canEdit: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const approverIds = new Set(approvers.map((a) => a.userId));
  const available = profiles.filter((p) => !approverIds.has(p.id));
  const [selected, setSelected] = useState(available[0]?.id ?? "");

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Designated Limit Approvers</h3></div>
      <div className="panel-body">
        <div className="callout">
          These specific people (not a role) can approve a one-time exception when someone hits a Per-Role Purchase Limit
          above — the blocked user requests an exception from the GRN/PO screen, one of these people approves it, and the
          same amount can then go through once.
        </div>
        {approvers.length ? (
          approvers.map((a) => (
            <div className="usedin-item" key={a.id}>
              <span className="name">{a.name}</span>
              <span className="code">
                {a.email}
                {canEdit && (
                  <>
                    {" "}
                    <a
                      href="#"
                      style={{ color: "var(--bad)" }}
                      onClick={(e) => {
                        e.preventDefault();
                        startTransition(async () => {
                          await removeLimitApprover(a.userId);
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
          <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>No designated approvers yet — nobody can approve a limit exception until one is added.</div>
        )}

        {canEdit && !showForm && available.length > 0 && (
          <button className="btn accent" style={{ marginTop: 10 }} onClick={() => setShowForm(true)}>
            + Add Approver
          </button>
        )}

        {canEdit && showForm && (
          <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="line-builder-row" style={{ gridTemplateColumns: "1fr auto auto", alignItems: "center" }}>
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                className="btn accent"
                disabled={pending || !selected}
                onClick={() => {
                  startTransition(async () => {
                    await addLimitApprover(selected);
                    setShowForm(false);
                  });
                }}
              >
                {pending ? "Saving…" : "Add"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

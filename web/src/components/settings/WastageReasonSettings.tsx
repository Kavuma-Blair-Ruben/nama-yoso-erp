"use client";

import { useState, useTransition } from "react";
import { createWastageReason, deleteWastageReason, toggleWastageReasonExpense } from "@/server/actions/settings";

type WastageReason = { id: string; name: string; isExpense: boolean };

export function WastageReasonSettings({ reasons }: { reasons: WastageReason[] }) {
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newIsExpense, setNewIsExpense] = useState(false);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Wastage Reasons</h3>
      </div>
      <div className="panel-body">
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 8 }}>
          &ldquo;Expense&rdquo; reasons are excluded from cost-of-goods-sold reporting.
        </div>
        {reasons.map((r) => (
          <div className="usedin-item" key={r.id}>
            <span className="name">
              {r.name}
              <label style={{ marginLeft: 10, fontSize: 11, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={r.isExpense}
                  disabled={pending}
                  onChange={(e) => startTransition(() => toggleWastageReasonExpense(r.id, e.target.checked))}
                />
                Expense
              </label>
            </span>
            <span className="code">
              {reasons.length > 1 && (
                <a
                  href="#"
                  style={{ color: "var(--bad)" }}
                  onClick={(e) => {
                    e.preventDefault();
                    startTransition(() => deleteWastageReason(r.id));
                  }}
                >
                  remove
                </a>
              )}
            </span>
          </div>
        ))}
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr auto auto", marginTop: 10, alignItems: "center" }}>
          <input type="text" placeholder="e.g. Staff Meal" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <label style={{ fontSize: 11, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={newIsExpense} onChange={(e) => setNewIsExpense(e.target.checked)} />
            Expense
          </label>
          <button
            className="btn accent"
            disabled={pending}
            onClick={() => {
              const val = newName.trim();
              if (!val) return;
              startTransition(async () => {
                await createWastageReason(val, newIsExpense);
              });
              setNewName("");
              setNewIsExpense(false);
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

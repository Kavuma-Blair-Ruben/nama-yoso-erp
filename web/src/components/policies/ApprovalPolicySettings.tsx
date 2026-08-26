"use client";

import { useState, useTransition } from "react";
import { savePoApprovalPolicy, savePoApprovalSteps } from "@/server/actions/policies";

type Step = { stepOrder: number; roleId: string; roleName: string };

export function ApprovalPolicySettings({
  threshold,
  steps,
  roles,
  canEdit,
}: {
  threshold: number | null;
  steps: Step[];
  roles: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [amount, setAmount] = useState(threshold != null ? String(threshold) : "");
  // Always exactly 5 slots — an empty string means that step of the chain is unused.
  const [slots, setSlots] = useState<string[]>(() => {
    const bySlot = Array.from({ length: 5 }, (_, i) => steps.find((s) => s.stepOrder === i + 1)?.roleId ?? "");
    return bySlot;
  });
  const [pending, startTransition] = useTransition();

  function commitThreshold() {
    const n = amount.trim() === "" ? null : Number(amount);
    const value = n != null && !Number.isNaN(n) ? n : null;
    startTransition(async () => {
      await savePoApprovalPolicy(value);
    });
  }

  function commitSlot(index: number, roleId: string) {
    const next = [...slots];
    next[index] = roleId;
    setSlots(next);
    startTransition(async () => {
      await savePoApprovalSteps(next.map((s) => s || null));
    });
  }

  const activeStepCount = slots.filter(Boolean).length;

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Purchase Order Approval</h3></div>
      <div className="panel-body">
        <div className="callout">
          A real block, not just a warning — once a PO&apos;s total is at or above this value, it can only move from DRAFT to
          APPROVED once every configured step below has signed off, in order. Leave all steps blank to disable (no gate).
        </div>
        <div className="form-row" style={{ maxWidth: 260, marginBottom: 16 }}>
          <label>Requires approval at or above (AED)</label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            disabled={!canEdit || pending}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={commitThreshold}
            placeholder="e.g. 5000 — leave blank to disable"
          />
        </div>

        <div className="line-builder-row head" style={{ gridTemplateColumns: "90px 1fr" }}>
          <div>Step</div>
          <div>Approving role</div>
        </div>
        {slots.map((roleId, i) => (
          <div className="line-builder-row" key={i} style={{ gridTemplateColumns: "90px 1fr", alignItems: "center" }}>
            <div>{i + 1}</div>
            <select value={roleId} disabled={!canEdit || pending} onChange={(e) => commitSlot(i, e.target.value)}>
              <option value="">— unused —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        ))}
        {activeStepCount > 0 && (
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 8 }}>
            {activeStepCount}-step chain configured — a qualifying PO needs all {activeStepCount} to sign off in order.
          </div>
        )}
      </div>
    </div>
  );
}

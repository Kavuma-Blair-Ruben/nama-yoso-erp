"use client";

import { useState, useTransition } from "react";
import { savePoApprovalPolicy } from "@/server/actions/policies";

export function ApprovalPolicySettings({
  threshold,
  roleId,
  roles,
  canEdit,
}: {
  threshold: number | null;
  roleId: string | null;
  roles: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [amount, setAmount] = useState(threshold != null ? String(threshold) : "");
  const [selectedRole, setSelectedRole] = useState(roleId ?? "");
  const [pending, startTransition] = useTransition();

  function commit(nextAmount: string, nextRoleId: string) {
    const n = nextAmount.trim() === "" ? null : Number(nextAmount);
    const value = n != null && !Number.isNaN(n) ? n : null;
    startTransition(async () => {
      await savePoApprovalPolicy(value, value != null ? nextRoleId || null : null);
    });
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Purchase Order Approval</h3></div>
      <div className="panel-body">
        <div className="callout">
          A real block, not just a warning — Purchase Orders at or above this value can only be moved from DRAFT to APPROVED
          by someone holding the selected role. Everyone else will see the approval requirement instead of being able to approve it.
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Requires approval at or above (AED)</div>
          <div>Approving role</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            disabled={!canEdit || pending}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => commit(amount, selectedRole)}
            placeholder="e.g. 5000 — leave blank to disable"
          />
          <select
            value={selectedRole}
            disabled={!canEdit || pending || amount.trim() === ""}
            onChange={(e) => {
              setSelectedRole(e.target.value);
              commit(amount, e.target.value);
            }}
          >
            <option value="">Select a role…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { saveRolePurchaseLimit } from "@/server/actions/policies";

type RoleLimit = { roleId: string; roleName: string; maxPoAmount: number | null; maxGrnAmount: number | null };

function LimitCell({ roleId, field, value, canEdit }: { roleId: string; field: "maxPoAmount" | "maxGrnAmount"; value: number | null; canEdit: boolean }) {
  const [amount, setAmount] = useState(value != null ? String(value) : "");
  const [pending, startTransition] = useTransition();

  function commit() {
    const trimmed = amount.trim();
    const n = trimmed === "" ? null : Number(trimmed);
    const next = n != null && !Number.isNaN(n) ? n : null;
    startTransition(async () => {
      await saveRolePurchaseLimit(roleId, field, next);
    });
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={amount}
      disabled={!canEdit || pending}
      onChange={(e) => setAmount(e.target.value)}
      onBlur={commit}
      placeholder="Unlimited"
    />
  );
}

export function RolePurchaseLimits({ roleLimits, canEdit }: { roleLimits: RoleLimit[]; canEdit: boolean }) {
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Per-Role Purchase Limits</h3></div>
      <div className="panel-body">
        <div className="callout">
          A real block, not just a warning — a user can&apos;t create a single Purchase Order, or post a single GRN, over
          their role&apos;s limit. Leave blank for unlimited.
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>Role</div>
          <div>Max per PO (AED)</div>
          <div>Max per GRN (AED)</div>
        </div>
        {roleLimits.map((r) => (
          <div className="line-builder-row" key={r.roleId} style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 6, alignItems: "center" }}>
            <div>{r.roleName}</div>
            <LimitCell roleId={r.roleId} field="maxPoAmount" value={r.maxPoAmount} canEdit={canEdit} />
            <LimitCell roleId={r.roleId} field="maxGrnAmount" value={r.maxGrnAmount} canEdit={canEdit} />
          </div>
        ))}
      </div>
    </div>
  );
}

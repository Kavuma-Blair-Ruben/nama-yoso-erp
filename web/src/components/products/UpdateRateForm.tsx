"use client";

import { useActionState } from "react";
import { updateProductRate } from "@/server/actions/products";
import { fmt } from "@/lib/format";

export function UpdateRateForm({ code, currentRate }: { code: string; currentRate: number | null }) {
  const [state, action, pending] = useActionState(updateProductRate, undefined);

  return (
    <form action={action}>
      <input type="hidden" name="code" value={code} />
      <div className="form-row">
        <label>New rate (per purchase unit)</label>
        <input type="text" inputMode="decimal" name="newRate" defaultValue={fmt(currentRate, 2)} required />
      </div>
      <div className="form-row">
        <label>Reason for change (optional)</label>
        <input type="text" name="reason" placeholder="e.g. Supplier price increase — May invoice" />
      </div>
      {state?.error && <div className="login-error">{state.error}</div>}
      {state?.success && <div className="callout">Price updated — recipes using this item now recost automatically.</div>}
      <div className="btn-row">
        <button className="btn accent" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Update & recost recipes"}
        </button>
      </div>
    </form>
  );
}

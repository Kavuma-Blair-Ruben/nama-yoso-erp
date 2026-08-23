"use client";

import { useActionState } from "react";
import { saveSupplier } from "@/server/actions/suppliers";

type Supplier = {
  id: string;
  name: string;
  trn: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  paymentTerms: string | null;
  leadTimeDays: number | null;
  notes: string | null;
  orderLimitAmount: number | null;
  orderLimitFrequency: string | null;
  receivingLimitAmount: number | null;
  receivingLimitFrequency: string | null;
};

export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const [state, action, pending] = useActionState(saveSupplier, undefined);

  return (
    <form action={action} className="panel" style={{ maxWidth: 640 }}>
      <div className="panel-body">
        {supplier && <input type="hidden" name="id" value={supplier.id} />}
        <div className="form-row">
          <label>Legal / display name</label>
          <input type="text" name="name" defaultValue={supplier?.name} required />
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Tax number (TRN)</div>
          <div>Contact person</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
          <input type="text" name="trn" defaultValue={supplier?.trn ?? ""} />
          <input type="text" name="contactName" defaultValue={supplier?.contactName ?? ""} />
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Phone / WhatsApp</div>
          <div>Email</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
          <input type="text" name="phone" defaultValue={supplier?.phone ?? ""} placeholder="+971..." />
          <input type="text" name="email" defaultValue={supplier?.email ?? ""} />
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Payment terms</div>
          <div>Delivery lead time (days)</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
          <input type="text" name="paymentTerms" defaultValue={supplier?.paymentTerms ?? ""} placeholder="e.g. Net 30" />
          <input type="text" inputMode="decimal" name="leadTimeDays" defaultValue={supplier?.leadTimeDays ?? ""} />
        </div>
        <div className="form-row">
          <label>Notes</label>
          <input type="text" name="notes" defaultValue={supplier?.notes ?? ""} />
        </div>

        <div className="section-title" style={{ marginTop: 4 }}>Ordering &amp; Receiving Limits</div>
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 8 }}>
          Optional — warns (doesn&apos;t block) when this supplier&apos;s recent orders or receipts would exceed the limit.
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Max order value (AED)</div>
          <div>Frequency</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
          <input type="text" inputMode="decimal" name="orderLimitAmount" defaultValue={supplier?.orderLimitAmount ?? ""} placeholder="e.g. 8000 — leave blank for no limit" />
          <select name="orderLimitFrequency" defaultValue={supplier?.orderLimitFrequency ?? ""}>
            <option value="">—</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Max receiving value (AED)</div>
          <div>Frequency</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
          <input type="text" inputMode="decimal" name="receivingLimitAmount" defaultValue={supplier?.receivingLimitAmount ?? ""} placeholder="e.g. 6000 — leave blank for no limit" />
          <select name="receivingLimitFrequency" defaultValue={supplier?.receivingLimitFrequency ?? ""}>
            <option value="">—</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        {state?.error && <div className="login-error">{state.error}</div>}
        <div className="btn-row">
          <button className="btn accent" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save Supplier"}
          </button>
        </div>
      </div>
    </form>
  );
}

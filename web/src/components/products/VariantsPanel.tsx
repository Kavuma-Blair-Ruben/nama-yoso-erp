"use client";

import { useState } from "react";
import { useActionState } from "react";
import { addPackagingVariant, removePackagingVariant, setPriorityVariant } from "@/server/actions/products";
import { fmt } from "@/lib/format";

type Variant = {
  id: string;
  purchaseUnit: string | null;
  unitWeight: number | null;
  rate: number | null;
  supplierName: string;
  supplierItemName: string | null;
  supplierItemCode: string | null;
  isPriority: boolean;
};

const NEW_SUPPLIER = "__new__";

export function VariantsPanel({ code, stockItemId, variants, suppliers }: { code: string; stockItemId: string; variants: Variant[]; suppliers: string[] }) {
  const [state, action, pending] = useActionState(addPackagingVariant, undefined);
  const [supplierChoice, setSupplierChoice] = useState(suppliers[0] ?? NEW_SUPPLIER);

  return (
    <>
      {variants.map((v) => (
        <div className="usedin-item" key={v.id}>
          <span className="name">
            {v.purchaseUnit} {v.isPriority && <span className="tag good" style={{ marginLeft: 4 }}>Priority Supplier</span>}
            {v.supplierItemCode && <span style={{ color: "var(--ink-faint)" }}> ({v.supplierItemCode})</span>}
          </span>
          <span className="code">
            {v.supplierName} &nbsp;{fmt(v.rate, 2)} &nbsp;
            <a href="#" onClick={(e) => { e.preventDefault(); setPriorityVariant(v.id, stockItemId, code); }} style={{ marginRight: 8 }}>
              {v.isPriority ? "unset priority" : "set as priority"}
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); removePackagingVariant(v.id, code); }} style={{ color: "var(--bad)" }}>
              remove
            </a>
          </span>
        </div>
      ))}
      <details style={{ marginTop: 8 }}>
        <summary className="btn ghost" style={{ display: "inline-block", cursor: "pointer" }}>
          + Add Packaging / Supplier Option
        </summary>
        <form action={action} style={{ marginTop: 10 }}>
          <input type="hidden" name="code" value={code} />
          <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>Packaging label</div>
            <div>Supplier</div>
          </div>
          <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <input type="text" name="purchaseUnit" placeholder="e.g. 450ML BTL" required />
            <select value={supplierChoice} onChange={(e) => setSupplierChoice(e.target.value)} required>
              {suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={NEW_SUPPLIER}>+ Add new supplier…</option>
            </select>
          </div>
          {supplierChoice === NEW_SUPPLIER ? (
            <input type="text" name="supplier" placeholder="New supplier name" required style={{ marginBottom: 8 }} />
          ) : (
            <input type="hidden" name="supplier" value={supplierChoice} />
          )}
          <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>Unit weight</div>
            <div>Rate (per this packaging)</div>
          </div>
          <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 8 }}>
            <input type="text" inputMode="decimal" name="unitWeight" placeholder="e.g. 450" />
            <input type="text" inputMode="decimal" name="rate" placeholder="e.g. 22.50" required />
          </div>
          {state?.error && <div className="login-error">{state.error}</div>}
          <div className="btn-row">
            <button className="btn accent" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add Option"}
            </button>
          </div>
        </form>
      </details>
    </>
  );
}

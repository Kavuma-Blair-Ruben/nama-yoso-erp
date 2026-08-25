"use client";

import { useActionState, useState } from "react";
import { updateItemSetup } from "@/server/actions/products";
import { fmt } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";

type Item = {
  legacyCode: string;
  accountingCategory: string | null;
  secondaryName: string | null;
  branches: string[];
  minLevel: number | null;
  parLevel: number | null;
  preferredCountingUnit: string | null;
  defaultPrepWastagePct: number | null;
  itemTaxRate: number | null;
  nonCogs: boolean;
  isPackaging: boolean;
  issueUnit: string | null;
  purchaseUnit: string | null;
};

export function ItemSetupPanel({ item, accountingCategories, canEdit }: { item: Item; accountingCategories: string[]; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateItemSetup, undefined);

  if (!editing) {
    return (
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <h3>Item Setup</h3>
        </div>
        <div className="panel-body">
          <div className="field-row"><span className="k">Accounting category</span><span className="v">{item.accountingCategory ?? "-"} {item.nonCogs ? <span className="tag neutral">Expense</span> : <span className="tag good">COGS</span>} {item.isPackaging && <span className="tag neutral">Packaging</span>}</span></div>
          <div className="field-row"><span className="k">Secondary language name</span><span className="v">{item.secondaryName ?? "-"}</span></div>
          <div className="field-row"><span className="k">Assigned branches</span><span className="v">{item.branches.length ? item.branches.join(", ") : "All"}</span></div>
          <div className="field-row"><span className="k">Min level</span><span className="v">{item.minLevel != null ? fmt(item.minLevel, 2) : "Not set"}</span></div>
          <div className="field-row"><span className="k">Par level</span><span className="v">{item.parLevel != null ? fmt(item.parLevel, 2) : "Not set"}</span></div>
          <div className="field-row"><span className="k">Preferred counting unit</span><span className="v">{item.preferredCountingUnit ?? item.issueUnit ?? "-"}</span></div>
          <div className="field-row"><span className="k">Default prep wastage</span><span className="v">{item.defaultPrepWastagePct != null ? fmt(item.defaultPrepWastagePct, 1) + "%" : "Not set"}</span></div>
          <div className="field-row"><span className="k">Item tax rate</span><span className="v">{item.itemTaxRate != null ? fmt(item.itemTaxRate, 1) + "%" : "Default (5%)"}</span></div>
          {canEdit && (
            <button className="btn ghost" style={{ marginTop: 6 }} onClick={() => setEditing(true)}>
              Edit Item Setup
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ marginBottom: 16, border: "2px solid var(--accent)" }}>
      <div className="panel-head">
        <h3>Item Setup</h3>
      </div>
      <div className="panel-body">
        <form
          action={async (fd) => {
            await action(fd);
            setEditing(false);
          }}
        >
          <input type="hidden" name="code" value={item.legacyCode} />
          <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>Accounting category</div>
            <div>Secondary language name</div>
          </div>
          <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
            <input type="text" name="accountingCategory" list="acct-cat-list" defaultValue={item.accountingCategory ?? ""} placeholder="e.g. Food, Beverage, Consumables" />
            <datalist id="acct-cat-list">
              {accountingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <input type="text" name="secondaryName" defaultValue={item.secondaryName ?? ""} placeholder="e.g. Arabic name" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
            <input type="checkbox" name="nonCogs" defaultChecked={item.nonCogs} /> Non-COGS item (flag as Expense instead of Cost of Goods Sold)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
            <input type="checkbox" name="isPackaging" defaultChecked={item.isPackaging} /> This is packaging (box, bag, cutlery — not food). Recipe costing reports it separately from Food Cost.
          </label>
          <div className="form-row">
            <label>Assign to branch</label>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 500 }}>
                <input type="checkbox" name="branchNamayoso" defaultChecked={item.branches.includes("NAMAYOSO MIRDIFF")} /> NAMAYOSO MIRDIFF
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 500 }}>
                <input type="checkbox" name="branchThg" defaultChecked={item.branches.includes("NAMAYOSO MARSA")} /> NAMAYOSO MARSA
              </label>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>Leave both unchecked to make this item available to all branches.</div>
          </div>
          <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>Min level</div>
            <div>Par level</div>
            <div>Preferred counting unit</div>
          </div>
          <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
            <input type="text" inputMode="decimal" name="minLevel" defaultValue={item.minLevel ?? ""} placeholder="e.g. 5" />
            <input type="text" inputMode="decimal" name="parLevel" defaultValue={item.parLevel ?? ""} placeholder="e.g. 20" />
            <select name="preferredCountingUnit" defaultValue={item.preferredCountingUnit ?? ""}>
              <option value="">Default ({item.issueUnit ?? "unit"})</option>
              {item.issueUnit && <option value={item.issueUnit}>{item.issueUnit}</option>}
              {item.purchaseUnit && <option value={item.purchaseUnit}>{item.purchaseUnit}</option>}
            </select>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: -6, marginBottom: 10 }}>Both in {canonicalUnitLabel(item.issueUnit)} — &quot;Fill Cart to Par&quot; on a new Purchase Order tops up anything below Par level.</div>
          <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>Default prep wastage %</div>
            <div>Item tax rate %</div>
          </div>
          <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
            <input type="text" inputMode="decimal" name="defaultPrepWastagePct" defaultValue={item.defaultPrepWastagePct ?? ""} placeholder="e.g. 15" />
            <input type="text" inputMode="decimal" name="itemTaxRate" defaultValue={item.itemTaxRate ?? ""} placeholder="Leave blank for default (5%)" />
          </div>
          {state?.error && <div className="login-error">{state.error}</div>}
          <div className="btn-row">
            <button className="btn accent" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save Item Setup"}
            </button>
            <button className="btn ghost" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

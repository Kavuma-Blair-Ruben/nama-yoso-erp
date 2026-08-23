"use client";

import { useActionState } from "react";
import { createProduct } from "@/server/actions/products";

export function NewProductForm({ categories, subcategories, suppliers }: { categories: string[]; subcategories: string[]; suppliers: string[] }) {
  const [state, action, pending] = useActionState(createProduct, undefined);

  return (
    <form action={action} className="panel" style={{ maxWidth: 600 }}>
      <div className="panel-body">
        <div className="form-row">
          <label>Name</label>
          <input type="text" name="name" required />
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Category</div>
          <div>Subcategory</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
          <input type="text" name="category" list="category-list" required placeholder="e.g. Fresh Produce" />
          <datalist id="category-list">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <input type="text" name="subcategory" list="subcategory-list" placeholder="e.g. Vegetables" />
          <datalist id="subcategory-list">
            {subcategories.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr" }}>
          <div>Supplier</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr", marginBottom: 10 }}>
          <input type="text" name="supplier" list="supplier-list" placeholder="Supplier name" />
          <datalist id="supplier-list">
            {suppliers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>Storage</div>
          <div>Purchase Unit</div>
          <div>Issue Unit</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
          <select name="storageType" defaultValue="">
            <option value="">Unset</option>
            <option value="DRY">DRY</option>
            <option value="CHILLED">CHILLED</option>
            <option value="FROZEN">FROZEN</option>
          </select>
          <input type="text" name="purchaseUnit" placeholder="e.g. KG" />
          <input type="text" name="issueUnit" placeholder="e.g. gm" />
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Unit weight (issue units per purchase unit)</div>
          <div>Purchase rate</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
          <input type="text" inputMode="decimal" name="unitWeight" placeholder="e.g. 1000" />
          <input type="text" inputMode="decimal" name="rate" required placeholder="e.g. 6.50" />
        </div>
        {state?.error && <div className="login-error">{state.error}</div>}
        <div className="btn-row">
          <button className="btn accent" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save Product"}
          </button>
        </div>
      </div>
    </form>
  );
}

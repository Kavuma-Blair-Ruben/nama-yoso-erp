"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseOrders } from "@/server/actions/purchaseOrders";
import { fmt, money, num } from "@/lib/format";
import { canonicalToPurchaseQty } from "@/lib/unitMath";
import { ItemSearchSelect } from "@/components/ui/ItemSearchSelect";

type Product = {
  id: string;
  legacyCode: string;
  name: string;
  purchaseUnit: string | null;
  purchaseRate: number | null;
  supplierId: string | null;
  supplierName: string | null;
  parLevel: number | null;
  issueUnit: string | null;
  unitWeight: number | null;
  itemTaxRate: number | null;
};
type Branch = { id: string; code: string; name: string };
type CostCenter = { id: string; branchId: string; name: string };
type Supplier = { id: string; name: string };
type StockBalance = { stockItemId: string; branchId: string; qtyOnHand: number };

// qty/rate/taxRate are kept as raw strings while editing — see num() in
// @/lib/format for why (typing "2." must not snap back to "2" on every keystroke).
type Line = { stockItemId: string; name: string; unitLabel: string; qty: string; rate: string; taxRate: string; supplierId: string | null; supplierName: string | null };

export function POBuilder({
  products,
  branches,
  costCenters,
  suppliers,
  stockBalances,
}: {
  products: Product[];
  branches: Branch[];
  costCenters: CostCenter[];
  suppliers: Supplier[];
  stockBalances: StockBalance[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [deliverTo, setDeliverTo] = useState(branches[0]?.code ?? "");
  const costCentersForBranch = costCenters.filter((c) => c.branchId === branchId);
  const [costCenterId, setCostCenterId] = useState(costCentersForBranch[0]?.id ?? "");
  function changeBranch(newBranchId: string) {
    setBranchId(newBranchId);
    setDeliverTo(branches.find((b) => b.id === newBranchId)?.code ?? "");
    const stillValid = costCenters.some((c) => c.branchId === newBranchId && c.id === costCenterId);
    if (!stillValid) setCostCenterId(costCenters.find((c) => c.branchId === newBranchId)?.id ?? "");
  }
  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, code: p.legacyCode, label: p.name, sublabel: p.supplierName ?? undefined })),
    [products]
  );
  const [fallbackSupplierId, setFallbackSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function fillCartToPar() {
    setInfo(null);
    setError(null);
    const existingIds = new Set(lines.map((l) => l.stockItemId));
    const added: Line[] = [];
    for (const p of products) {
      if (p.parLevel == null || existingIds.has(p.id)) continue;
      const onHand = stockBalances.filter((b) => b.stockItemId === p.id && b.branchId === branchId).reduce((s, b) => s + b.qtyOnHand, 0);
      if (onHand >= p.parLevel) continue;
      const purchaseQty = canonicalToPurchaseQty(p.parLevel - onHand, p.issueUnit, p.unitWeight);
      if (purchaseQty <= 0) continue;
      added.push({ stockItemId: p.id, name: p.name, unitLabel: p.purchaseUnit ?? "", qty: String(purchaseQty), rate: String(p.purchaseRate ?? 0), taxRate: String(p.itemTaxRate ?? 5), supplierId: p.supplierId, supplierName: p.supplierName });
    }
    if (added.length === 0) {
      setInfo("Nothing is below par level right now.");
      return;
    }
    setLines((ls) => [...ls, ...added]);
    setInfo(`Added ${added.length} item(s) below par level.`);
  }

  function addLine() {
    const p = products[0];
    if (!p) return;
    setLines((ls) => [
      ...ls,
      { stockItemId: p.id, name: p.name, unitLabel: p.purchaseUnit ?? "", qty: "1", rate: String(p.purchaseRate ?? 0), taxRate: "5", supplierId: p.supplierId, supplierName: p.supplierName },
    ]);
  }
  function updateLineProduct(i: number, stockItemId: string) {
    const p = products.find((x) => x.id === stockItemId);
    if (!p) return;
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, stockItemId: p.id, name: p.name, unitLabel: p.purchaseUnit ?? "", rate: String(p.purchaseRate ?? 0), supplierId: p.supplierId, supplierName: p.supplierName } : l)));
  }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  const net = lines.reduce((s, l) => s + num(l.qty) * num(l.rate), 0);
  const vat = lines.reduce((s, l) => s + num(l.qty) * num(l.rate) * (num(l.taxRate) / 100), 0);
  const total = net + vat;

  const splitGroups = useMemo(() => {
    const groups = new Map<string, { supplierName: string; lines: Line[] }>();
    const unresolved: Line[] = [];
    const fallback = suppliers.find((s) => s.id === fallbackSupplierId);
    for (const l of lines) {
      const supplierId = l.supplierId ?? fallbackSupplierId;
      const supplierName = l.supplierName ?? fallback?.name;
      if (!supplierId || !supplierName) {
        unresolved.push(l);
        continue;
      }
      const g = groups.get(supplierId) ?? { supplierName, lines: [] };
      g.lines.push(l);
      groups.set(supplierId, g);
    }
    return { groups: [...groups.values()], unresolved };
  }, [lines, fallbackSupplierId, suppliers]);

  async function handleSubmit() {
    setError(null);
    if (lines.length === 0) {
      setError("Add at least one item.");
      return;
    }
    if (!costCenterId) {
      setError("Choose a sector.");
      return;
    }
    startTransition(async () => {
      const result = await createPurchaseOrders({
        lines: lines.map((l) => ({ stockItemId: l.stockItemId, name: l.name, unitLabel: l.unitLabel, qty: num(l.qty), rate: num(l.rate), taxRate: num(l.taxRate), supplierId: l.supplierId })),
        branchId,
        costCenterId,
        deliverTo,
        fallbackSupplierId: fallbackSupplierId || null,
        notes,
      });
      if (result.error) setError(result.error);
      else router.push(result.warning ? `/purchase-orders?warning=${encodeURIComponent(result.warning)}` : "/purchase-orders");
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 900 }}>
      <div className="panel-head">
        <h3>New LPO (Local Purchase Order)</h3>
        <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>Auto-splits by supplier, one LPO per supplier</span>
      </div>
      <div className="panel-body">
        <div className="section-title">Items</div>
        <div className="line-builder">
          <div className="line-builder-row head" style={{ gridTemplateColumns: "2fr 80px 80px 90px 64px 32px" }}>
            <div>Product</div>
            <div>Qty</div>
            <div>Unit</div>
            <div>Rate</div>
            <div>Tax %</div>
            <div></div>
          </div>
          {lines.map((l, i) => (
            <div className="line-builder-row" key={i} style={{ gridTemplateColumns: "2fr 80px 80px 90px 64px 32px" }}>
              <ItemSearchSelect options={productOptions} value={l.stockItemId} onChange={(v) => updateLineProduct(i, v)} placeholder="Search item code or name…" />
              <input type="text" inputMode="decimal" value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} />
              <input type="text" value={l.unitLabel} readOnly />
              <input type="text" inputMode="decimal" value={l.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} />
              <input type="text" inputMode="decimal" value={l.taxRate} onChange={(e) => updateLine(i, { taxRate: e.target.value })} />
              <button className="line-remove" onClick={() => removeLine(i)}>✕</button>
            </div>
          ))}
        </div>
        <div className="btn-row" style={{ marginBottom: info ? 8 : 16 }}>
          <button className="btn ghost" onClick={addLine}>+ Add item</button>
          <button className="btn ghost" onClick={fillCartToPar} title="Add every item below its par level for the selected branch">
            Fill Cart to Par
          </button>
        </div>
        {info && <div className="callout" style={{ marginBottom: 16 }}>{info}</div>}

        <div className="section-title">Supplier Split Preview</div>
        {splitGroups.groups.length === 0 && splitGroups.unresolved.length === 0 && (
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)", padding: "6px 0" }}>Add items above to see how they&apos;ll be split by supplier.</div>
        )}
        {splitGroups.groups.length > 1 && (
          <div className="callout">This will create <b>{splitGroups.groups.length} separate LPOs</b> — one per supplier.</div>
        )}
        {splitGroups.groups.map((g) => {
          const groupNet = g.lines.reduce((s, l) => s + num(l.qty) * num(l.rate), 0);
          return (
            <div className="panel" style={{ marginBottom: 10 }} key={g.supplierName}>
              <div className="panel-head" style={{ padding: "10px 14px" }}>
                <h3 style={{ textTransform: "none", fontSize: 13, letterSpacing: 0 }}>{g.supplierName}</h3>
                <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{g.lines.length} item(s) · {fmt(groupNet, 2)} net</span>
              </div>
              <div className="panel-body" style={{ padding: "8px 14px" }}>
                {g.lines.map((l, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--ink-soft)", padding: "2px 0" }}>
                    {l.name} — {fmt(num(l.qty), 2)} {l.unitLabel}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {splitGroups.unresolved.length > 0 && (
          <div className="callout" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad)" }}>
            {splitGroups.unresolved.length} item(s) have no designated supplier and no fallback supplier set. Pick a
            fallback supplier below, or these items won&apos;t be included in any order.
          </div>
        )}

        <div className="form-row">
          <label>Deliver to</label>
          <select value={branchId} onChange={(e) => changeBranch(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Sector</label>
          <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
            {costCentersForBranch.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Fallback supplier <span style={{ fontWeight: 400, color: "var(--ink-faint)" }}>(only used for items with no designated supplier)</span></label>
          <select value={fallbackSupplierId} onChange={(e) => setFallbackSupplierId(e.target.value)}>
            <option value="">— None —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Notes (optional)</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, approval notes..." />
        </div>

        <div className="field-row"><span className="k">Net Amount</span><span className="v tabular">{fmt(net, 2)}</span></div>
        <div className="field-row"><span className="k">VAT (per item)</span><span className="v tabular">{fmt(vat, 2)}</span></div>
        <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Total (all suppliers)</b></span><span className="v">{money(total, 2)}</span></div>

        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          <button className="btn accent" onClick={handleSubmit} disabled={pending}>
            {pending ? "Creating…" : "Create Order(s)"}
          </button>
        </div>
      </div>
    </div>
  );
}

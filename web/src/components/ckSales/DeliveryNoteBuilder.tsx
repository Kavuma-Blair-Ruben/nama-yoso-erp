"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDeliveryNote } from "@/server/actions/ckSales";
import { money, todayStr, num } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";

type PickerItem = { id: string; legacyCode: string; name: string; issueUnit: string | null; ratePerKgL: number | null };
type CustomerOption = { id: string; name: string; priceListMode: string | null; priceListMarginPct: number | null };
// qty/price are raw strings while editing — see num() in @/lib/format for why.
type Line = { stockItemId: string; unitLabel: string; qty: string; price: string };

function priceFor(item: PickerItem, customer: CustomerOption | undefined): number {
  const cost = item.ratePerKgL ?? 0;
  if (!customer || customer.priceListMode !== "margin") return cost;
  return cost * (1 + (customer.priceListMarginPct ?? 0) / 100);
}

export function DeliveryNoteBuilder({ items, customers, branches }: { items: PickerItem[]; customers: CustomerOption[]; branches: { id: string; name: string }[] }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [docType, setDocType] = useState<"DN" | "PRO">("DN");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [deliveryDate, setDeliveryDate] = useState(todayStr());
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const customer = customers.find((c) => c.id === customerId);

  function addLine() {
    const p = items[0];
    if (!p) return;
    setLines((ls) => [...ls, { stockItemId: p.id, unitLabel: canonicalUnitLabel(p.issueUnit), qty: "0", price: String(priceFor(p, customer)) }]);
  }
  function updateLineItem(i: number, stockItemId: string) {
    const p = items.find((x) => x.id === stockItemId);
    if (!p) return;
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, stockItemId: p.id, unitLabel: canonicalUnitLabel(p.issueUnit), price: String(priceFor(p, customer)) } : l)));
  }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  const total = lines.reduce((s, l) => s + num(l.qty) * num(l.price), 0);

  function submit() {
    setError(null);
    if (!customerId) return setError("Select a customer.");
    if (!branchId) return setError("Select a branch.");
    const validLines = lines.filter((l) => num(l.qty) > 0);
    if (validLines.length === 0) return setError("Add at least one item with a quantity.");

    startTransition(async () => {
      const result = await createDeliveryNote({
        customerId,
        docType,
        branchId,
        deliveryDate,
        lines: validLines.map((l) => ({ stockItemId: l.stockItemId, qty: num(l.qty), unitLabel: l.unitLabel || undefined, price: num(l.price) })),
      });
      if (result.error) setError(result.error);
      else router.push(`/ck-sales/${result.id}`);
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 1040 }}>
      <div className="panel-head"><h3>New {docType === "PRO" ? "Pro Forma / Tax Invoice" : "Delivery Note"}</h3></div>
      <div className="panel-body">
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Customer</div>
          <div>Document Type</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={docType} onChange={(e) => setDocType(e.target.value as "DN" | "PRO")}>
            <option value="DN">Delivery Note</option>
            <option value="PRO">Pro Forma / Tax Invoice</option>
          </select>
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Branch / Kitchen</div>
          <div>Delivery date</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </div>

        <div className="section-title">Items</div>
        <div className="callout">Price auto-fills from the customer&apos;s assigned price list — cost price, or cost plus their margin. Edit any line if needed.</div>
        <div className="table-wrap" style={{ maxHeight: 380 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th className="right">Qty</th>
                <th>Unit</th>
                <th className="right">Price</th>
                <th className="right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.length ? (
                lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select value={l.stockItemId} onChange={(e) => updateLineItem(i, e.target.value)} style={{ minWidth: 220 }}>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>{it.legacyCode} — {it.name}</option>
                        ))}
                      </select>
                    </td>
                    <td><input type="text" inputMode="decimal" style={{ width: 70 }} value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></td>
                    <td>{l.unitLabel}</td>
                    <td><input type="text" inputMode="decimal" style={{ width: 80 }} value={l.price} onChange={(e) => updateLine(i, { price: e.target.value })} /></td>
                    <td className="mono-r">{money(num(l.qty) * num(l.price), 2)}</td>
                    <td><button className="line-remove" onClick={() => removeLine(i)}>✕</button></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No items added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <button className="btn ghost" style={{ margin: "10px 0 16px" }} onClick={addLine}>+ Add item</button>

        <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Total</b></span><span className="v">{money(total, 2)}</span></div>

        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          <button className="btn accent" disabled={pending} onClick={submit}>{pending ? "Saving…" : "Create & Deduct Stock"}</button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMaterialRequest } from "@/server/actions/materialRequests";
import { todayStr, num } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";
import { ItemSearchSelect } from "@/components/ui/ItemSearchSelect";

type PickerItem = { id: string; legacyCode: string; name: string; issueUnit: string | null };
// qty is a raw string while editing ("" = not yet entered) — see num() in @/lib/format for why.
type Line = { stockItemId: string; unitLabel: string; qty: string };

export function MaterialRequestBuilder({ items, locations }: { items: PickerItem[]; locations: readonly string[] }) {
  const router = useRouter();
  const itemOptions = useMemo(() => items.map((it) => ({ value: it.id, code: it.legacyCode, label: it.name })), [items]);
  const [fromLocation, setFromLocation] = useState(locations[0] ?? "");
  const [toLocation, setToLocation] = useState(locations[1] ?? locations[0] ?? "");
  const [requiredDate, setRequiredDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addLine() {
    const p = items[0];
    if (!p) return;
    setLines((ls) => [...ls, { stockItemId: p.id, unitLabel: canonicalUnitLabel(p.issueUnit), qty: "" }]);
  }
  function updateLineItem(i: number, stockItemId: string) {
    const p = items.find((x) => x.id === stockItemId);
    if (!p) return;
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, stockItemId: p.id, unitLabel: canonicalUnitLabel(p.issueUnit) } : l)));
  }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  function submit() {
    setError(null);
    if (fromLocation === toLocation) return setError("From and To locations must differ.");
    const validLines = lines.filter((l) => num(l.qty) > 0);
    if (validLines.length === 0) return setError("Add at least one item with a quantity.");

    startTransition(async () => {
      const result = await createMaterialRequest({
        fromLocation,
        toLocation,
        requiredDate,
        notes: notes || undefined,
        lines: validLines.map((l) => ({ stockItemId: l.stockItemId, qty: num(l.qty), unitLabel: l.unitLabel || undefined })),
      });
      if (result.error) setError(result.error);
      else router.push(`/material-requests/${result.id}`);
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 900 }}>
      <div className="panel-head"><h3>New Material Request</h3></div>
      <div className="panel-body">
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>From Location</div>
          <div>Deliver To</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
          <select value={fromLocation} onChange={(e) => setFromLocation(e.target.value)}>
            {locations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <select value={toLocation} onChange={(e) => setToLocation(e.target.value)}>
            {locations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ maxWidth: 220 }}>
          <label>Required date</label>
          <input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
        </div>

        <div className="section-title">Items</div>
        <div className="table-wrap" style={{ maxHeight: 400 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th className="right">Qty</th>
                <th>Unit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.length ? (
                lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ minWidth: 220 }}>
                        <ItemSearchSelect options={itemOptions} value={l.stockItemId} onChange={(v) => updateLineItem(i, v)} placeholder="Search item…" />
                      </div>
                    </td>
                    <td><input type="text" inputMode="decimal" style={{ width: 80 }} value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} placeholder="Qty" /></td>
                    <td>{l.unitLabel}</td>
                    <td><button className="line-remove" onClick={() => removeLine(i)}>✕</button></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={4}>No items added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <button className="btn ghost" style={{ margin: "10px 0 16px" }} onClick={addLine}>+ Add item</button>

        <div className="form-row">
          <label>Notes (optional)</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          <button className="btn accent" disabled={pending} onClick={submit}>{pending ? "Submitting…" : "Submit Request"}</button>
        </div>
      </div>
    </div>
  );
}

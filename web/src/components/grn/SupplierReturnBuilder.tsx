"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupplierReturn } from "@/server/actions/supplierReturns";
import { fmt, money, num } from "@/lib/format";

type Line = { grnLineId: string; name: string; legacyCode: string; unitLabel: string | null; receivedQty: number; rate: number; remaining: number };

export function SupplierReturnBuilder({ grnId, grnNumber, lines }: { grnId: string; grnNumber: string; lines: Line[] }) {
  const router = useRouter();
  // qty is a raw string per line while editing — see num() in @/lib/format for why.
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const value = lines.reduce((s, l) => s + num(qtyByLine[l.grnLineId] ?? "") * l.rate, 0);

  function submit() {
    setError(null);
    const selected = lines
      .map((l) => ({ grnLineId: l.grnLineId, qty: num(qtyByLine[l.grnLineId] ?? "") }))
      .filter((l) => l.qty > 0);
    if (selected.length === 0) return setError("Enter a quantity for at least one line to return.");

    startTransition(async () => {
      const result = await createSupplierReturn({ grnId, reason: reason || undefined, lines: selected });
      if (result.error) setError(result.error);
      else router.push(`/grn/${grnId}`);
    });
  }

  return (
    <div className="panel" style={{ border: "2px solid var(--accent)", maxWidth: 760 }}>
      <div className="panel-head"><h3>Return to Supplier — {grnNumber}</h3></div>
      <div className="panel-body">
        <div className="callout">Enter how much of each line is being returned — stock is removed immediately for whatever quantity you enter.</div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th className="right">Received</th>
                <th className="right">Remaining</th>
                <th className="right">Return Qty</th>
                <th>Unit</th>
                <th className="right">Value</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const fullyReturned = l.remaining <= 0;
                const qty = qtyByLine[l.grnLineId] ?? "";
                return (
                  <tr key={l.grnLineId} style={{ opacity: fullyReturned ? 0.5 : 1 }}>
                    <td>{l.legacyCode} — {l.name}</td>
                    <td className="mono-r">{fmt(l.receivedQty, 2)}</td>
                    <td className="mono-r">{fullyReturned ? <span className="tag neutral">fully returned</span> : fmt(l.remaining, 2)}</td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        style={{ width: 80 }}
                        disabled={fullyReturned}
                        value={qty}
                        placeholder="0"
                        onChange={(e) => setQtyByLine((q) => ({ ...q, [l.grnLineId]: e.target.value }))}
                      />
                    </td>
                    <td>{l.unitLabel}</td>
                    <td className="mono-r">{money(num(qty) * l.rate, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="form-row" style={{ marginTop: 12 }}>
          <label>Reason</label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Arrived damaged, wrong item delivered" />
        </div>
        <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Return Value</b></span><span className="v">{money(value, 2)}</span></div>
        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          <button className="btn accent" disabled={pending} onClick={submit}>{pending ? "Processing…" : "Process Return"}</button>
        </div>
      </div>
    </div>
  );
}

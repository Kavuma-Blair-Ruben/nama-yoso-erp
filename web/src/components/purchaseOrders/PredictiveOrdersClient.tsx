"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseOrders } from "@/server/actions/purchaseOrders";
import type { PredictiveOrderSuggestion } from "@/server/db/queries/forecasting";
import { fmt, money, num } from "@/lib/format";
import { canonicalToPurchaseQty } from "@/lib/unitMath";

type Branch = { id: string; code: string; name: string };
type CostCenter = { id: string; branchId: string; name: string };

export function PredictiveOrdersClient({
  rows,
  skippedNoDemandCount,
  branches,
  costCenters,
  selectedBranchId,
  targetCoverDays,
}: {
  rows: PredictiveOrderSuggestion[];
  skippedNoDemandCount: number;
  branches: Branch[];
  costCenters: CostCenter[];
  selectedBranchId: string;
  targetCoverDays: number;
}) {
  const router = useRouter();
  const costCentersForBranch = costCenters.filter((c) => c.branchId === selectedBranchId);
  const [costCenterId, setCostCenterId] = useState(costCentersForBranch[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(rows.filter((r) => r.status === "low").map((r) => r.stockItemId)));
  // Purchase-unit qty per item, keyed by stockItemId — starts from the
  // suggested canonical qty converted once, editable per row from there.
  const [qtyByItem, setQtyByItem] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.stockItemId, String(round2(canonicalToPurchaseQty(r.suggestedQty, r.issueUnit, r.unitWeight)))]))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeBranch(newBranchId: string) {
    router.push(`/predictive-orders?branch=${newBranchId}&cover=${targetCoverDays}`);
  }
  function changeCoverDays(days: string) {
    router.push(`/predictive-orders?branch=${selectedBranchId}&cover=${days}`);
  }

  function toggleRow(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedRows = rows.filter((r) => selected.has(r.stockItemId));
  const estimatedOrderValue = selectedRows.reduce((s, r) => s + num(qtyByItem[r.stockItemId] ?? "0") * (r.purchaseRate ?? 0), 0);
  const avgCoverageAfterOrder = useMemo(() => {
    if (selectedRows.length === 0) return null;
    const days = selectedRows.map((r) => {
      const purchaseQty = num(qtyByItem[r.stockItemId] ?? "0");
      const canonicalQty = purchaseQty * (r.unitWeight || 1) * (["G", "GM", "GRAM", "GRAMS", "ML", "MILLILITER", "MILLILITRE"].includes((r.issueUnit ?? "").toUpperCase()) ? 0.001 : 1);
      return r.dailyDemand > 0 ? (r.stockAtDelivery + canonicalQty) / r.dailyDemand : 0;
    });
    return days.reduce((s, d) => s + d, 0) / days.length;
  }, [selectedRows, qtyByItem]);

  function handlePlaceOrder() {
    setError(null);
    if (selectedRows.length === 0) {
      setError("Select at least one item.");
      return;
    }
    if (!costCenterId) {
      setError("Choose a sector.");
      return;
    }
    const branch = branches.find((b) => b.id === selectedBranchId);
    startTransition(async () => {
      const result = await createPurchaseOrders({
        lines: selectedRows.map((r) => ({
          stockItemId: r.stockItemId,
          name: r.name,
          unitLabel: r.purchaseUnit ?? "",
          qty: num(qtyByItem[r.stockItemId] ?? "0"),
          rate: r.purchaseRate ?? 0,
          taxRate: r.itemTaxRate ?? 5,
          supplierId: r.supplierId,
        })),
        branchId: selectedBranchId,
        costCenterId,
        deliverTo: branch?.code,
        fallbackSupplierId: null,
        notes: "Created from Predictive Orders",
      });
      if (result.error) setError(result.error);
      else router.push(result.warning ? `/purchase-orders?warning=${encodeURIComponent(result.warning)}` : "/purchase-orders");
    });
  }

  return (
    <>
      <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr 1fr auto", marginBottom: 12 }}>
        <select value={selectedBranchId} onChange={(e) => changeBranch(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
          <option value="">— Pick sector —</option>
          {costCentersForBranch.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>Cover</label>
          <input type="number" min={1} value={targetCoverDays} onChange={(e) => changeCoverDays(e.target.value)} style={{ width: 64 }} />
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>days</span>
        </div>
        <div />
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="n">{rows.length}</div>
          <div className="l">Items to Order</div>
          <div className="d">Suggested</div>
        </div>
        <div className="kpi">
          <div className="n">{money(estimatedOrderValue, 0)}</div>
          <div className="l">Estimated Order Value</div>
          <div className="d">{selectedRows.length} selected</div>
        </div>
        <div className="kpi">
          <div className="n">{avgCoverageAfterOrder != null ? `${fmt(avgCoverageAfterOrder, 1)} days` : "—"}</div>
          <div className="l">Stock Coverage After Order</div>
          <div className="d">Target {targetCoverDays} days</div>
        </div>
      </div>

      {skippedNoDemandCount > 0 && (
        <div className="callout">
          {skippedNoDemandCount} purchased item(s) have no recent consumption recorded for this branch — not enough
          history yet to suggest a quantity, so they're left out rather than guessed.
        </div>
      )}
      {error && <div className="login-error">{error}</div>}

      <div className="panel">
        <div className="panel-head">
          <h3>AI-Suggested Order Quantities</h3>
          <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>Ranked by lowest stock coverage first</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th>Item</th>
                <th>Supplier</th>
                <th className="right">Daily Use</th>
                <th className="right">Current Stock</th>
                <th className="right">At Delivery</th>
                <th className="right">Suggested Qty</th>
                <th className="right">4-wk Avg</th>
                <th>Last Ordered</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.stockItemId}>
                    <td>
                      <input type="checkbox" checked={selected.has(r.stockItemId)} onChange={() => toggleRow(r.stockItemId)} />
                    </td>
                    <td>
                      {r.legacyCode} — {r.name}
                      <span className={`tag ${r.status === "low" ? "bad" : "good"}`} style={{ marginLeft: 6 }}>
                        {r.status === "low" ? "Low stock" : "On track"}
                      </span>
                    </td>
                    <td>{r.supplierName}{r.leadTimeIsDefault && <span title="No lead time set on this supplier — defaulting to 3 days" style={{ marginLeft: 4, color: "var(--ink-faint)" }}>({r.leadTimeDays}d default)</span>}</td>
                    <td className="mono-r">{fmt(r.dailyDemand, 2)}</td>
                    <td className="mono-r">{fmt(r.currentStock, 2)}</td>
                    <td className="mono-r" style={{ color: r.stockAtDelivery <= 0 ? "var(--bad)" : "inherit" }}>{fmt(r.stockAtDelivery, 2)}</td>
                    <td className="mono-r">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={qtyByItem[r.stockItemId] ?? ""}
                        onChange={(e) => setQtyByItem((q) => ({ ...q, [r.stockItemId]: e.target.value }))}
                        style={{ width: 70, textAlign: "right" }}
                      />{" "}
                      {r.purchaseUnit}
                    </td>
                    <td className="mono-r">{fmt(r.fourWeekAvgDaily, 2)}</td>
                    <td>{r.lastOrderedDate ?? "—"}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row">
                  <td colSpan={9}>No items need reordering right now for this branch.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn accent" disabled={pending || selectedRows.length === 0} onClick={handlePlaceOrder}>
          {pending ? "Placing…" : `Place Order (${selectedRows.length} item${selectedRows.length === 1 ? "" : "s"})`}
        </button>
      </div>
    </>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

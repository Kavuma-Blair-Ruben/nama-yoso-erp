"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openProductionBatch, updateProductionBatch } from "@/server/actions/production";
import { fmt, money, todayStr, num } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";

type SubRecipeOption = {
  id: string;
  legacyCode: string;
  name: string;
  yieldQty: number | null;
  yieldUnit: string | null;
  stockItemId: string;
  shelfLifeDays: number | null;
  storageInstructions: string | null;
  ingredients: { stockItemId: string; legacyCode: string; name: string; issueUnit: string | null; ratePerKgL: number | null; qty: number; unitLabel: string | null }[];
};

// qty/rate are raw strings while editing — see num() in @/lib/format for why.
type IngredientLine = { stockItemId: string; name: string; qty: string; unitLabel: string; rate: string };

// Same "produced date + shelf life" calculation as index.html's
// buildProductionLabelHTML — this just runs it earlier, at data-entry time,
// so the batch's stored expiry reflects the shelf life as of production
// rather than being recomputed later from whatever the setting says today.
// Formats from local getFullYear/Month/Date rather than toISOString(), which
// round-trips through UTC and silently shifts the date back a day in any
// timezone ahead of UTC (e.g. GST, UTC+4 — exactly where this app runs).
function computeExpiry(producedDate: string, shelfLifeDays: number | null): string {
  if (!producedDate || shelfLifeDays == null) return "";
  const d = new Date(producedDate + "T00:00:00");
  d.setDate(d.getDate() + shelfLifeDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ProductionBuilder({
  subRecipes,
  branches,
  stockBalances,
  existingBatchId,
  initialSubRecipeId,
  initialBranchId,
  initialScaleMultiplier,
  initialYieldQty,
  initialYieldUnit,
  initialProducedDate,
  initialExpiryDate,
  initialNotes,
  initialIngredients,
}: {
  subRecipes: SubRecipeOption[];
  branches: { id: string; name: string }[];
  stockBalances?: { stockItemId: string; branchId: string; qtyOnHand: number }[];
  existingBatchId?: string;
  initialSubRecipeId?: string;
  initialBranchId?: string;
  initialScaleMultiplier?: number;
  initialYieldQty?: number;
  initialYieldUnit?: string;
  initialProducedDate?: string;
  initialExpiryDate?: string;
  initialNotes?: string;
  initialIngredients?: IngredientLine[];
}) {
  const router = useRouter();
  const [subRecipeId, setSubRecipeId] = useState(initialSubRecipeId ?? subRecipes[0]?.id ?? "");
  const [branchId, setBranchId] = useState(initialBranchId ?? branches[0]?.id ?? "");
  const [scaleMultiplier, setScaleMultiplier] = useState(String(initialScaleMultiplier ?? 1));
  const [producedDate, setProducedDate] = useState(initialProducedDate ?? todayStr());
  const [expiryDate, setExpiryDate] = useState(initialExpiryDate ?? "");
  const [expiryTouched, setExpiryTouched] = useState(!!existingBatchId);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = subRecipes.find((s) => s.id === subRecipeId);

  // Auto-fills the expiry from shelf life whenever the recipe or produced
  // date changes, unless the user has already typed their own value.
  useEffect(() => {
    if (expiryTouched) return;
    const computed = computeExpiry(producedDate, selected?.shelfLifeDays ?? null);
    if (computed) setExpiryDate(computed);
  }, [producedDate, selected, expiryTouched]);

  const [manualLines, setManualLines] = useState<IngredientLine[] | null>(initialIngredients ?? null);

  const scaledLines: IngredientLine[] = useMemo(() => {
    if (manualLines) return manualLines;
    if (!selected) return [];
    return selected.ingredients.map((i) => ({
      stockItemId: i.stockItemId,
      name: `${i.legacyCode} — ${i.name}`,
      qty: String(i.qty * num(scaleMultiplier)),
      unitLabel: i.unitLabel ?? canonicalUnitLabel(i.issueUnit),
      rate: String(i.ratePerKgL ?? 0),
    }));
  }, [selected, scaleMultiplier, manualLines]);

  const yieldQty = manualLines ? (initialYieldQty ?? 0) : (selected?.yieldQty ?? 0) * num(scaleMultiplier);
  const yieldUnit = manualLines ? (initialYieldUnit ?? "") : selected?.yieldUnit ?? "";

  const totalCost = scaledLines.reduce((s, l) => s + num(l.qty) * num(l.rate), 0);
  const costPerUnit = yieldQty > 0 ? totalCost / yieldQty : 0;

  function handleSubRecipeChange(id: string) {
    setSubRecipeId(id);
    setManualLines(null);
    setExpiryTouched(false);
  }

  function updateLine(i: number, patch: Partial<IngredientLine>) {
    setManualLines((current) => {
      const base = current ?? scaledLines;
      return base.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    });
  }

  // Soft, non-blocking warning only — matches index.html's
  // productionIngredientRowsHTML, which flags a shortfall but never prevents
  // producing (stock can legitimately go negative pending a GRN catch-up).
  function availableFor(stockItemId: string): number {
    return (stockBalances ?? []).find((b) => b.stockItemId === stockItemId && b.branchId === branchId)?.qtyOnHand ?? 0;
  }

  function buildInput() {
    return {
      subRecipeId,
      branchId,
      scaleMultiplier: num(scaleMultiplier),
      yieldQty,
      yieldUnit: yieldUnit || undefined,
      producedDate,
      expiryDate: expiryDate || undefined,
      notes: notes || undefined,
      ingredients: scaledLines.map((l) => ({ stockItemId: l.stockItemId, qty: num(l.qty), unitLabel: l.unitLabel || undefined, rate: num(l.rate) })),
    };
  }

  function handleSubmit() {
    setError(null);
    if (!subRecipeId) {
      setError("Choose a sub-recipe to produce.");
      return;
    }
    if (!branchId) {
      setError("Choose a branch.");
      return;
    }
    const input = buildInput();
    if (input.ingredients.length === 0) {
      setError("This sub-recipe has no ingredients defined — add them via Recipe Costing first.");
      return;
    }
    if (input.yieldQty <= 0) {
      setError("Yield quantity must be greater than zero.");
      return;
    }
    startTransition(async () => {
      const result = existingBatchId ? await updateProductionBatch(existingBatchId, input) : await openProductionBatch(input);
      if (result.error) setError(result.error);
      else router.push(`/production/${result.id}`);
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 1000 }}>
      <div className="panel-head">
        <h3>{existingBatchId ? "Edit Open Production Ticket" : "New Production Ticket"}</h3>
      </div>
      <div className="panel-body">
        <div className="line-builder-row head" style={{ gridTemplateColumns: "2fr 1fr" }}>
          <div>Sub-recipe to produce</div>
          <div>Branch</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "2fr 1fr", marginBottom: 10 }}>
          <select value={subRecipeId} disabled={!!existingBatchId} onChange={(e) => handleSubRecipeChange(e.target.value)}>
            {subRecipes.map((s) => (
              <option key={s.id} value={s.id}>{s.legacyCode} — {s.name}</option>
            ))}
          </select>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>Scale multiplier</div>
          <div>Produced date</div>
          <div>Expiry date</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
          <input
            type="text"
            inputMode="decimal"
            value={scaleMultiplier}
            disabled={!!manualLines}
            onChange={(e) => setScaleMultiplier(e.target.value)}
          />
          <input type="date" value={producedDate} onChange={(e) => setProducedDate(e.target.value)} />
          <input type="date" value={expiryDate} onChange={(e) => { setExpiryDate(e.target.value); setExpiryTouched(true); }} />
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: -6, marginBottom: 10 }}>
          Ingredient quantities scale automatically with the multiplier. Edit a line below to fine-tune it directly (this stops it from
          auto-scaling further).
          {selected?.shelfLifeDays != null && !expiryTouched && ` Expiry auto-filled from this recipe's ${selected.shelfLifeDays}-day shelf life — edit it to override.`}
        </div>

        <div className="field-row">
          <span className="k">Expected yield</span>
          <span className="v tabular">{fmt(yieldQty, 2)} {yieldUnit}</span>
        </div>
        {selected?.storageInstructions && (
          <div className="field-row"><span className="k">Storage</span><span className="v">{selected.storageInstructions}</span></div>
        )}

        <div className="section-title">Ingredients Consumed</div>
        <div className="table-wrap" style={{ maxHeight: 380 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th className="right">Qty</th>
                <th>Unit</th>
                <th className="right">Available</th>
                <th className="right">Rate</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {scaledLines.length ? (
                scaledLines.map((l, i) => {
                  const available = availableFor(l.stockItemId);
                  const short = num(l.qty) > available;
                  return (
                    <tr key={l.stockItemId}>
                      <td>{l.name}</td>
                      <td><input type="text" inputMode="decimal" style={{ width: 80 }} value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></td>
                      <td>{l.unitLabel}</td>
                      <td className="mono-r" style={{ color: short ? "var(--bad)" : "var(--good)" }}>{fmt(available, 2)}{short ? " ⚠" : ""}</td>
                      <td><input type="text" inputMode="decimal" style={{ width: 80 }} value={l.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} /></td>
                      <td className="mono-r">{fmt(num(l.qty) * num(l.rate), 2)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr className="empty-row"><td colSpan={6}>Select a sub-recipe with ingredients defined.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="form-row" style={{ marginTop: 10 }}>
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div style={{ height: 14 }} />
        <div className="field-row"><span className="k">Total Cost</span><span className="v tabular">{money(totalCost, 2)}</span></div>
        <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Cost per {yieldUnit || "unit"}</b></span><span className="v">{money(costPerUnit, 4)}</span></div>

        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          <button className="btn accent" disabled={pending} onClick={handleSubmit}>
            {pending ? "Saving…" : existingBatchId ? "Save Changes" : "Open Production"}
          </button>
        </div>
        {!existingBatchId && (
          <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 8 }}>
            This opens the ticket — stock isn&apos;t touched yet. Print as many batch/lot labels as you need while producing, then close
            it from the ticket page once done to update stock.
          </div>
        )}
      </div>
    </div>
  );
}

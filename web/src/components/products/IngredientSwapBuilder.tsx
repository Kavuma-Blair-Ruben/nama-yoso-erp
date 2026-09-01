"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewIngredientSwap, commitIngredientSwap, type SwapImpact } from "@/server/actions/ingredientSwap";
import { ItemSearchSelect } from "@/components/ui/ItemSearchSelect";
import { money, pct } from "@/lib/format";

type PickerItem = { id: string; legacyCode: string; name: string };

export function IngredientSwapBuilder({ fromItem, items }: { fromItem: { id: string; code: string; name: string }; items: PickerItem[] }) {
  const router = useRouter();
  const itemOptions = items.map((it) => ({ value: it.id, code: it.legacyCode, label: it.name }));
  const [toId, setToId] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<SwapImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runPreview() {
    setError(null);
    setPreview(null);
    if (!toId) return setError("Pick the alternative item first.");
    startTransition(async () => {
      const result = await previewIngredientSwap(fromItem.id, toId);
      if (result.error) setError(result.error);
      else if (result.preview) setPreview(result.preview);
    });
  }

  function confirm() {
    setError(null);
    if (!preview) return;
    startTransition(async () => {
      const result = await commitIngredientSwap(fromItem.id, toId, reason.trim() || undefined);
      if (result.error) setError(result.error);
      else if (result.eventId) router.push(`/reports/ingredient-swaps/${result.eventId}`);
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 900 }}>
      <div className="panel-head"><h3>Replace {fromItem.name}</h3></div>
      <div className="panel-body">
        <div className="form-row">
          <label>Replace with</label>
          <ItemSearchSelect
            options={itemOptions}
            value={toId}
            onChange={(v) => {
              setToId(v);
              setPreview(null);
            }}
            placeholder="Search the alternative item…"
          />
        </div>
        <div className="form-row">
          <label>Reason (optional)</label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Japonica Rice out of stock" />
        </div>

        <div className="btn-row" style={{ marginTop: 4 }}>
          <button className="btn ghost" disabled={pending || !toId} onClick={runPreview}>
            {pending && !preview ? "Checking…" : "Preview Impact"}
          </button>
        </div>

        {error && <div className="login-error" style={{ marginTop: 10 }}>{error}</div>}

        {preview && (
          <>
            <div className="callout" style={{ marginTop: 16 }}>
              <b>{preview.affectedLineCount}</b> ingredient line(s) across <b>{preview.affected.length}</b> recipe(s) will be repointed from{" "}
              <b>{preview.fromItem.name}</b> to <b>{preview.toItem.name}</b>. This also changes what future wastage/POS-sale
              deductions come out of stock for those recipes — not just the displayed cost.
            </div>
            {preview.unitMismatch && (
              <div className="callout" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad)", marginTop: 8 }}>
                ⚠️ Unit mismatch: {preview.fromItem.name} is measured in {preview.fromItem.issueUnit ?? "?"}, {preview.toItem.name} in{" "}
                {preview.toItem.issueUnit ?? "?"} — a different kind of unit (weight/volume/count). Quantities won&apos;t auto-convert; review
                affected recipes&apos; quantities after swapping.
              </div>
            )}
            {preview.targetIsSubRecipe && (
              <div className="callout" style={{ marginTop: 8 }}>
                ℹ️ {preview.toItem.name} is itself a sub-recipe — affected lines will cost from its own recipe going forward instead of a flat
                rate.
              </div>
            )}
            {preview.affected.some((a) => a.hasDuplicateLine) && (
              <div className="callout" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad)", marginTop: 8 }}>
                ⚠️ Some affected recipes already use {preview.toItem.name} too — they&apos;ll end up with two separate lines for it. Worth
                merging manually afterward.
              </div>
            )}

            <div className="field-row" style={{ fontSize: 14, marginTop: 12 }}>
              <span className="k"><b>Total Cost Impact</b></span>
              <span className="v">
                <span className={`tag ${preview.totalImpact > 0 ? "bad" : preview.totalImpact < 0 ? "good" : "neutral"}`}>
                  {preview.totalImpact >= 0 ? "+" : ""}
                  {money(preview.totalImpact, 2)}
                </span>
              </span>
            </div>

            <div className="table-wrap" style={{ maxHeight: 360, marginTop: 10 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Recipe</th>
                    <th className="right">Cost Before</th>
                    <th className="right">Cost After</th>
                    <th className="right">Δ</th>
                    <th className="right">Δ%</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.affected.length ? (
                    preview.affected.map((a) => (
                      <tr key={a.type + a.code}>
                        <td>
                          {a.name} <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>({a.code}{a.hasDuplicateLine ? " · dup" : ""})</span>
                        </td>
                        <td className="mono-r">{money(a.costBefore, 2)}</td>
                        <td className="mono-r">{money(a.costAfter, 2)}</td>
                        <td className="mono-r" style={{ color: a.impact === 0 ? undefined : a.impact > 0 ? "var(--bad)" : "var(--good)" }}>
                          {a.impact >= 0 ? "+" : ""}
                          {money(a.impact, 2)}
                        </td>
                        <td className="right">{pct(a.impactPct)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="empty-row">
                      <td colSpan={5}>{fromItem.name} isn&apos;t used in any recipe — nothing would be affected.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn accent" disabled={pending || preview.affectedLineCount === 0} onClick={confirm}>
                {pending ? "Swapping…" : "Confirm Swap"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

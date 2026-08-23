"use client";

import { useState } from "react";
import { money, fmt } from "@/lib/format";
import { normalizeToKgLtr, ledgerDisplayUnit } from "@/lib/unitMath";

type Ingredient = { legacyCode: string; name: string; unitLabel: string | null; productIssueUnit: string | null; qty: number; rateAtBuild: number | null };
type SubResult = { perUnit: number; yieldUnit: string | null; lines: { ing: Ingredient; result: Result }[] } | undefined;
type Result = { cost: number; missing: { code: string; name: string }[]; sub?: SubResult };

export function LedgerRow({ ing, result, depth }: { ing: Ingredient; result: Result; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const isSub = !!result.sub;
  const missCount = result.missing.length;

  let displayRate: number | null;
  if (isSub && result.sub) {
    const perKg = normalizeToKgLtr(result.sub.perUnit, result.sub.yieldUnit);
    displayRate = perKg != null ? perKg : result.sub.perUnit;
  } else {
    // Derive the rate actually used for Cost (live rate, falling back to
    // build-time only when no live rate exists) instead of always showing
    // the stale build-time rate — keeps Qty x Rate = Cost true after any
    // price change, matching how index.html always normalizes this rate.
    displayRate = ing.qty !== 0 ? result.cost / ing.qty : ing.rateAtBuild;
  }

  const displayUnit = ledgerDisplayUnit({
    isSub,
    ingredientUnitLabel: ing.unitLabel,
    productIssueUnit: ing.productIssueUnit,
    subYieldUnit: result.sub?.yieldUnit,
  });

  return (
    <>
      <div className={`ledger-row ${depth > 0 ? "sub" : ""}`}>
        <div className="n ind" style={{ paddingLeft: depth * 16 }}>
          {isSub && (
            <button className="expand-btn" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "-" : "+"}
            </button>
          )}
          <span>{ing.name}</span>
          {missCount > 0 && <span className="tag bad" style={{ marginLeft: 6 }}>no price</span>}
        </div>
        <div className="mono-r">{fmt(ing.qty, 3)}</div>
        <div className="mono-r">{displayUnit}</div>
        <div className="mono-r">{money(displayRate, 2)}</div>
        <div className="mono-r">{money(result.cost, 2)}</div>
      </div>
      {isSub && expanded && result.sub?.lines.map((l, i) => <LedgerRow key={i} ing={l.ing} result={l.result} depth={depth + 1} />)}
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { savePolicyPercent } from "@/server/actions/policies";

export function PolicyPercentSettings({
  abovePparOverPct,
  receiveAbovePricePct,
  canEdit,
}: {
  abovePparOverPct: number | null;
  receiveAbovePricePct: number | null;
  canEdit: boolean;
}) {
  const [abovePar, setAbovePar] = useState(abovePparOverPct != null ? String(abovePparOverPct) : "");
  const [abovePrice, setAbovePrice] = useState(receiveAbovePricePct != null ? String(receiveAbovePricePct) : "");
  const [pending, startTransition] = useTransition();

  function commitAbovePar() {
    const n = abovePar.trim() === "" ? null : Number(abovePar);
    const value = n != null && !Number.isNaN(n) ? n : null;
    startTransition(async () => {
      await savePolicyPercent("abovePparOverPct", value);
    });
  }
  function commitAbovePrice() {
    const n = abovePrice.trim() === "" ? null : Number(abovePrice);
    const value = n != null && !Number.isNaN(n) ? n : null;
    startTransition(async () => {
      await savePolicyPercent("receiveAbovePricePct", value);
    });
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h3>Above Par Order Limit</h3></div>
        <div className="panel-body">
          <div className="callout">Restrict ordering above a set % over an item&apos;s par (min) level — catches accidental over-ordering before it happens.</div>
          <div className="form-row" style={{ maxWidth: 260 }}>
            <label>Max % above par</label>
            <input
              type="text"
              inputMode="decimal"
              value={abovePar}
              disabled={!canEdit || pending}
              onChange={(e) => setAbovePar(e.target.value)}
              onBlur={commitAbovePar}
              placeholder="e.g. 150 — leave blank for no limit"
            />
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h3>Receive Above Expected Price</h3></div>
        <div className="panel-body">
          <div className="callout">Warn when a GRN line&apos;s price is more than this % above what the LPO ordered at.</div>
          <div className="form-row" style={{ maxWidth: 260 }}>
            <label>Max % above LPO price</label>
            <input
              type="text"
              inputMode="decimal"
              value={abovePrice}
              disabled={!canEdit || pending}
              onChange={(e) => setAbovePrice(e.target.value)}
              onBlur={commitAbovePrice}
              placeholder="e.g. 10 — leave blank for no limit"
            />
          </div>
        </div>
      </div>
    </>
  );
}

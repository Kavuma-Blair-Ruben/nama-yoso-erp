"use client";

import { useState, useTransition } from "react";
import { setCostingMethod } from "@/server/actions/settings";

type CostingMethod = "latest" | "moving_average" | "weighted_average";

export function CostingMethodSettings({ costingMethod }: { costingMethod: CostingMethod }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<CostingMethod>(costingMethod);

  return (
    <div className="panel">
      <div className="panel-head"><h3>Costing Method</h3></div>
      <div className="panel-body">
        <select
          style={{ maxWidth: 280 }}
          value={value}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value as CostingMethod;
            setValue(v);
            startTransition(async () => {
              await setCostingMethod(v);
            });
          }}
        >
          <option value="latest">Latest Price</option>
          <option value="moving_average">Moving Average</option>
          <option value="weighted_average">Weighted Average</option>
        </select>
        <div className="callout" style={{ marginTop: 10 }}>
          Honest note: recipe and stock costing throughout this system currently always uses the <b>latest price</b> for every
          ingredient, regardless of what&apos;s selected here. True Moving/Weighted Average costing would need to track a running
          cost per item from GRN receipt history over time — a real engineering change, not a toggle. This setting is saved so the
          intent is on record for whoever builds that next.
        </div>
      </div>
    </div>
  );
}

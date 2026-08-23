"use client";

import { useState, useTransition } from "react";
import { setBlindCounts } from "@/server/actions/settings";

export function BlindCountSettings({ blindCounts }: { blindCounts: boolean }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(blindCounts);

  return (
    <div className="panel">
      <div className="panel-head"><h3>Blind Stock Counts</h3></div>
      <div className="panel-body">
        <button
          type="button"
          className="switch-row"
          disabled={pending}
          onClick={() => {
            const next = !value;
            setValue(next);
            startTransition(async () => {
              await setBlindCounts(next);
            });
          }}
        >
          <span className={`switch-track ${value ? "on" : ""}`}><span className="switch-knob" /></span>
          <span className={`switch-label ${value ? "on" : ""}`}>{value ? "On" : "Off"}</span>
        </button>
        <div className="callout" style={{ marginTop: 10 }}>
          When on, the Stock Count builder hides System Qty and Variance from whoever is entering counts, so they can&apos;t just
          copy the expected number. Variance is still computed and stored as normal — it&apos;s only hidden while counting is in progress.
        </div>
      </div>
    </div>
  );
}

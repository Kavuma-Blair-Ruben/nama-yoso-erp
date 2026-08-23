"use client";

import { useTransition } from "react";
import { toggleInternalOnlyLocation } from "@/server/actions/policies";

export function InternalOnlyLocations({ locations, checked, canEdit }: { locations: readonly string[]; checked: string[]; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const checkedSet = new Set(checked);

  return (
    <div className="panel">
      <div className="panel-head"><h3>Restrict Ordering to Internal Only</h3></div>
      <div className="panel-body">
        <div className="callout">Locations checked here can only be ordered for via Material Requests (Central Kitchen/Warehouse), not directly from external suppliers — attempting to create a purchase order for one is blocked.</div>
        {locations.map((loc) => (
          <label key={loc} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            <input
              type="checkbox"
              defaultChecked={checkedSet.has(loc)}
              disabled={!canEdit || pending}
              onChange={(e) => {
                const checkedNow = e.target.checked;
                startTransition(async () => {
                  await toggleInternalOnlyLocation(loc, checkedNow);
                });
              }}
            />
            {loc}
          </label>
        ))}
      </div>
    </div>
  );
}

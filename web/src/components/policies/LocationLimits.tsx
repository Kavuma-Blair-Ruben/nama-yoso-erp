"use client";

import { useState, useTransition } from "react";
import { saveLocationLimit, removeLocationLimit } from "@/server/actions/policies";

type Limit = { location: string; amount: number; frequency: string };

export function LocationLimits({ limits, locations, canEdit }: { limits: Limit[]; locations: readonly string[]; canEdit: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const byLocation = new Map(limits.map((l) => [l.location, l]));

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Location Order Limits</h3></div>
      <div className="panel-body">
        {limits.length ? (
          limits.map((l) => (
            <div className="usedin-item" key={l.location}>
              <span className="name">{l.location}</span>
              <span className="code">
                AED {Math.round(l.amount).toLocaleString()} / {l.frequency}
                {canEdit && (
                  <>
                    {" "}
                    <a
                      href="#"
                      style={{ color: "var(--bad)" }}
                      onClick={(e) => {
                        e.preventDefault();
                        startTransition(async () => {
                          await removeLocationLimit(l.location);
                        });
                      }}
                    >
                      remove
                    </a>
                  </>
                )}
              </span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>No location order limits set yet.</div>
        )}

        {canEdit && !showForm && (
          <button className="btn accent" style={{ marginTop: 10 }} onClick={() => setShowForm(true)}>
            + Add Location Limit
          </button>
        )}

        {canEdit && showForm && (
          <form
            action={async (formData) => {
              await saveLocationLimit(undefined, formData);
              setShowForm(false);
            }}
            style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}
          >
            <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div>Location</div>
              <div>Max order value (AED)</div>
              <div>Frequency</div>
            </div>
            <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
              <select name="location">
                {locations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                    {byLocation.has(loc) ? " (configured)" : ""}
                  </option>
                ))}
              </select>
              <input type="text" inputMode="decimal" name="amount" placeholder="e.g. 8000" />
              <select name="frequency">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <div className="btn-row">
              <button className="btn accent" type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save Limit"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

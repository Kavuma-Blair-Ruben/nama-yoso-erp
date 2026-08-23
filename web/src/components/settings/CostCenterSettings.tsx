"use client";

import { useState, useTransition } from "react";
import { createCostCenter, deleteCostCenter } from "@/server/actions/settings";

type CostCenter = { id: string; name: string };

export function CostCenterSettings({ costCenters }: { costCenters: CostCenter[] }) {
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Cost Centers</h3>
      </div>
      <div className="panel-body">
        {costCenters.map((c) => (
          <div className="usedin-item" key={c.id}>
            <span className="name">{c.name}</span>
            <span className="code">
              {costCenters.length > 1 && (
                <a
                  href="#"
                  style={{ color: "var(--bad)" }}
                  onClick={(e) => {
                    e.preventDefault();
                    startTransition(() => deleteCostCenter(c.id));
                  }}
                >
                  remove
                </a>
              )}
            </span>
          </div>
        ))}
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr auto", marginTop: 10 }}>
          <input type="text" placeholder="e.g. Bar" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button
            className="btn accent"
            disabled={pending}
            onClick={() => {
              const val = newName.trim();
              if (!val) return;
              startTransition(async () => {
                await createCostCenter(val);
              });
              setNewName("");
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { createStorageArea, deleteStorageArea } from "@/server/actions/settings";

type StorageArea = { id: string; name: string };

export function StorageAreaSettings({ storageAreas }: { storageAreas: StorageArea[] }) {
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Storage Areas</h3>
      </div>
      <div className="panel-body">
        {storageAreas.map((s) => (
          <div className="usedin-item" key={s.id}>
            <span className="name">{s.name}</span>
            <span className="code">
              {storageAreas.length > 1 && (
                <a
                  href="#"
                  style={{ color: "var(--bad)" }}
                  onClick={(e) => {
                    e.preventDefault();
                    startTransition(() => deleteStorageArea(s.id));
                  }}
                >
                  remove
                </a>
              )}
            </span>
          </div>
        ))}
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr auto", marginTop: 10 }}>
          <input type="text" placeholder="e.g. Walk-in Freezer" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button
            className="btn accent"
            disabled={pending}
            onClick={() => {
              const val = newName.trim();
              if (!val) return;
              startTransition(async () => {
                await createStorageArea(val);
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

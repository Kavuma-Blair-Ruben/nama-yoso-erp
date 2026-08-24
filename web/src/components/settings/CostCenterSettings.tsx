"use client";

import { useState, useTransition } from "react";
import { createCostCenter, renameCostCenter, setCostCenterActive, deleteCostCenter } from "@/server/actions/costCenters";

type CostCenter = { id: string; branchId: string; name: string; isActive: boolean };
type Branch = { id: string; name: string };

function CostCenterRow({ center }: { center: CostCenter }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(center.name);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== center.name && name.trim().length > 0;

  function saveRename() {
    setError(null);
    startTransition(async () => {
      const result = await renameCostCenter(center.id, name);
      if (result.error) setError(result.error);
    });
  }

  function toggleActive() {
    startTransition(async () => {
      await setCostCenterActive(center.id, !center.isActive);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCostCenter(center.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="usedin-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} disabled={pending} />
        {dirty && (
          <button type="button" className="btn ghost" style={{ padding: "3px 8px", fontSize: 11 }} disabled={pending} onClick={saveRename}>
            Save
          </button>
        )}
        <button
          type="button"
          className="switch-row"
          disabled={pending}
          onClick={toggleActive}
          title={center.isActive ? "Click to deactivate" : "Click to activate"}
        >
          <span className={`switch-track ${center.isActive ? "on" : ""}`}>
            <span className="switch-knob" />
          </span>
          <span className={`switch-label ${center.isActive ? "on" : ""}`}>{center.isActive ? "Active" : "Inactive"}</span>
        </button>
        <a href="#" style={{ color: "var(--bad)" }} onClick={(e) => { e.preventDefault(); remove(); }}>
          remove
        </a>
      </div>
      {error && <div style={{ fontSize: 11, color: "var(--bad)" }}>{error}</div>}
    </div>
  );
}

function BranchCostCenters({ branch, centers }: { branch: Branch; centers: CostCenter[] }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await createCostCenter(branch.id, name);
      if (result.error) setError(result.error);
      else setName("");
    });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", margin: "10px 0 4px" }}>{branch.name}</div>
      {centers.length ? centers.map((c) => <CostCenterRow key={c.id} center={c} />) : <div style={{ fontSize: 12, color: "var(--ink-faint)", padding: "6px 0" }}>No sectors yet.</div>}
      <div className="line-builder-row" style={{ gridTemplateColumns: "1fr auto", marginTop: 6 }}>
        <input type="text" placeholder="e.g. Kitchen, Bar" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn accent" disabled={pending || !name.trim()} onClick={handleAdd}>
          {pending ? "Adding…" : "+ Add Sector"}
        </button>
      </div>
      {error && <div className="login-error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

export function CostCenterSettings({ branches, costCenters }: { branches: Branch[]; costCenters: CostCenter[] }) {
  return (
    <div className="panel">
      <div className="panel-head"><h3>Sectors (Cost Centers)</h3></div>
      <div className="panel-body">
        <div className="callout">
          Sectors like Kitchen and Bar hold their own stock, purchase orders, and cost totals within each branch — a
          NAMAYOSO Kitchen sector is entirely separate from a THG Kitchen sector. Deactivate a sector no longer in use
          instead of deleting it if it has any transaction history.
        </div>
        {branches.map((b) => (
          <BranchCostCenters key={b.id} branch={b} centers={costCenters.filter((c) => c.branchId === b.id)} />
        ))}
      </div>
    </div>
  );
}

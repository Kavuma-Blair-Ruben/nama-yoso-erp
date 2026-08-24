"use client";

import { useState, useTransition } from "react";
import { createBranch, renameBranch, setBranchActive, deleteBranch } from "@/server/actions/branches";

type Branch = { id: string; code: string; name: string; isActive: boolean };

function BranchRow({ branch }: { branch: Branch }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(branch.name);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== branch.name && name.trim().length > 0;

  function saveRename() {
    setError(null);
    startTransition(async () => {
      const result = await renameBranch(branch.id, name);
      if (result.error) setError(result.error);
    });
  }

  function toggleActive() {
    startTransition(async () => {
      await setBranchActive(branch.id, !branch.isActive);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteBranch(branch.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="usedin-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="tag neutral" style={{ flexShrink: 0 }}>{branch.code}</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1 }}
          disabled={pending}
        />
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
          title={branch.isActive ? "Click to deactivate" : "Click to activate"}
        >
          <span className={`switch-track ${branch.isActive ? "on" : ""}`}>
            <span className="switch-knob" />
          </span>
          <span className={`switch-label ${branch.isActive ? "on" : ""}`}>{branch.isActive ? "Active" : "Inactive"}</span>
        </button>
        <a href="#" style={{ color: "var(--bad)" }} onClick={(e) => { e.preventDefault(); remove(); }}>
          remove
        </a>
      </div>
      {error && <div style={{ fontSize: 11, color: "var(--bad)" }}>{error}</div>}
    </div>
  );
}

export function BranchSettings({ branches }: { branches: Branch[] }) {
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await createBranch(code, name);
      if (result.error) setError(result.error);
      else {
        setCode("");
        setName("");
      }
    });
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Branches</h3></div>
      <div className="panel-body">
        <div className="callout">
          Every branch your business operates from — as the administrator, add as many as you need. New purchase orders,
          GRNs, production, transfers, and stock counts pick a branch from this list; deactivate a branch you're no longer
          using instead of deleting it if it has any transaction history.
        </div>

        {branches.length ? branches.map((b) => <BranchRow key={b.id} branch={b} />) : <div style={{ fontSize: 12, color: "var(--ink-faint)", padding: "6px 0" }}>No branches yet.</div>}

        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 2fr auto", marginTop: 10 }}>
          <input type="text" placeholder="Code, e.g. DOWNTOWN" value={code} onChange={(e) => setCode(e.target.value)} />
          <input type="text" placeholder="Name, e.g. Downtown Branch" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn accent" disabled={pending || !code.trim() || !name.trim()} onClick={handleAdd}>
            {pending ? "Adding…" : "+ Add Branch"}
          </button>
        </div>
        {error && <div className="login-error" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkAuthUser } from "@/server/actions/permissions";

const BRANCHES = ["NAMAYOSO", "THG"] as const;

type UnlinkedUser = { id: string; email: string };
type Role = { id: string; name: string };

export function LinkUserForm({ unlinkedUsers, roles }: { unlinkedUsers: UnlinkedUser[]; roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const [authUserId, setAuthUserId] = useState(unlinkedUsers[0]?.id ?? "");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [branches, setBranches] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleBranch(b: string) {
    setBranches((bs) => (bs.includes(b) ? bs.filter((x) => x !== b) : [...bs, b]));
  }

  if (unlinkedUsers.length === 0) return null;

  if (!open) {
    return (
      <button className="btn ghost" style={{ marginBottom: 16 }} onClick={() => setOpen(true)}>
        + Link an Existing Login
      </button>
    );
  }

  const selected = unlinkedUsers.find((u) => u.id === authUserId);

  function handleSave() {
    setError(null);
    if (!selected) return;
    startTransition(async () => {
      const result = await linkAuthUser({ authUserId, email: selected.email, name, roleId, branches });
      if (result.error) setError(result.error);
      else {
        router.refresh();
        setOpen(false);
        setName("");
        setBranches([]);
      }
    });
  }

  return (
    <div className="panel" style={{ border: "2px solid var(--accent)", marginBottom: 16, maxWidth: 600 }}>
      <div className="panel-head"><h3>Link an Existing Login</h3></div>
      <div className="panel-body">
        <div className="callout">
          Attaches a role and branch access to a Supabase Auth account that already exists — this does not create a login or set a
          password. Create the account itself first (Supabase dashboard, or the person&apos;s own sign-up), then link it here.
        </div>
        <div className="form-row">
          <label>Account email</label>
          <select value={authUserId} onChange={(e) => setAuthUserId(e.target.value)}>
            {unlinkedUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Display name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amara Osei" />
        </div>
        <div className="form-row">
          <label>Role</label>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Branch Access</label>
          <div style={{ display: "flex", gap: 14, alignItems: "center", paddingTop: 6 }}>
            {BRANCHES.map((b) => (
              <label key={b} style={{ fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={branches.includes(b)} onChange={() => toggleBranch(b)} /> {b}
              </label>
            ))}
          </div>
        </div>
        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          <button className="btn accent" onClick={handleSave} disabled={pending}>
            {pending ? "Linking…" : "Link Account"}
          </button>
          <button className="btn ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

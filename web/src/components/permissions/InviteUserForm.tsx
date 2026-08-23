"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteUser } from "@/server/actions/permissions";

const BRANCHES = ["NAMAYOSO", "THG"] as const;

type Role = { id: string; name: string };

export function InviteUserForm({ roles }: { roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [branches, setBranches] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleBranch(b: string) {
    setBranches((bs) => (bs.includes(b) ? bs.filter((x) => x !== b) : [...bs, b]));
  }

  if (!open) {
    return (
      <button className="btn accent" style={{ marginBottom: 16, marginRight: 8 }} onClick={() => setOpen(true)}>
        + Invite User
      </button>
    );
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const result = await inviteUser({ email, name, roleId, branches });
      if (result.error) setError(result.error);
      else {
        setSent(email);
        router.refresh();
        setEmail("");
        setName("");
        setBranches([]);
      }
    });
  }

  return (
    <div className="panel" style={{ border: "2px solid var(--accent)", marginBottom: 16, maxWidth: 600 }}>
      <div className="panel-head"><h3>Invite User</h3></div>
      <div className="panel-body">
        <div className="callout">
          Emails the person a link to set their own password — this app never sees or sets it. They land with the role and branch
          access you pick here already assigned, so they&apos;re ready to go the moment they accept.
        </div>
        {sent && <div className="callout" style={{ borderColor: "var(--good)", color: "var(--good)" }}>Invite sent to {sent}.</div>}
        <div className="form-row">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. amara@company.com" />
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
            <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>(none checked = all branches)</span>
          </div>
        </div>
        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          <button className="btn accent" onClick={handleSend} disabled={pending || !email.trim() || !name.trim()}>
            {pending ? "Sending…" : "Send Invite"}
          </button>
          <button className="btn ghost" onClick={() => setOpen(false)} disabled={pending}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

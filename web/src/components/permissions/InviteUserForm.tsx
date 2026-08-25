"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteUser, createUserWithPassword } from "@/server/actions/permissions";

const BRANCHES = ["NAMAYOSO MIRDIFF", "NAMAYOSO MARSA"] as const;

type Role = { id: string; name: string };
type Mode = "email" | "password";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function InviteUserForm({ roles }: { roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [branches, setBranches] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; password?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleBranch(b: string) {
    setBranches((bs) => (bs.includes(b) ? bs.filter((x) => x !== b) : [...bs, b]));
  }

  function reset() {
    setEmail("");
    setName("");
    setBranches([]);
    setPassword("");
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
    if (mode === "password" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      const result =
        mode === "email"
          ? await inviteUser({ email, name, roleId, branches })
          : await createUserWithPassword({ email, name, roleId, branches, password });
      if (result.error) setError(result.error);
      else {
        setSent({ email, password: mode === "password" ? password : undefined });
        router.refresh();
        reset();
      }
    });
  }

  return (
    <div className="panel" style={{ border: "2px solid var(--accent)", marginBottom: 16, maxWidth: 600 }}>
      <div className="panel-head"><h3>Invite User</h3></div>
      <div className="panel-body">
        <div className="pill-tabs" style={{ marginBottom: 10 }}>
          <button className={`btn ${mode === "email" ? "" : "ghost"}`} style={{ borderRadius: 20 }} onClick={() => setMode("email")}>
            Email Invite
          </button>
          <button className={`btn ${mode === "password" ? "" : "ghost"}`} style={{ borderRadius: 20 }} onClick={() => setMode("password")}>
            Set Password Directly
          </button>
        </div>
        {mode === "email" ? (
          <div className="callout">
            Emails the person a link to set their own password — this app never sees or sets it. They land with the role and branch
            access you pick here already assigned, so they&apos;re ready to go the moment they accept. Requires email sending to be
            configured and able to reach their address.
          </div>
        ) : (
          <div className="callout">
            Creates their login with the password you set here — no email involved. You&apos;ll need to share this password with
            them yourself (message, call, etc.). They can change it to their own once logged in.
          </div>
        )}
        {sent && (
          <div className="callout" style={{ borderColor: "var(--good)", color: "var(--good)" }}>
            {sent.password ? (
              <>
                Account created for {sent.email}. Password: <b style={{ fontFamily: "monospace" }}>{sent.password}</b> — share this
                with them now, it won&apos;t be shown again.
              </>
            ) : (
              <>Invite sent to {sent.email}.</>
            )}
          </div>
        )}
        <div className="form-row">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. amara@company.com" />
        </div>
        <div className="form-row">
          <label>Display name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amara Osei" />
        </div>
        {mode === "password" && (
          <div className="form-row">
            <label>Password</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" style={{ flex: 1 }} />
              <button type="button" className="btn ghost" onClick={() => setPassword(generatePassword())}>
                Generate
              </button>
            </div>
          </div>
        )}
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
          <button
            className="btn accent"
            onClick={handleSend}
            disabled={pending || !email.trim() || !name.trim() || (mode === "password" && password.length < 8)}
          >
            {pending ? (mode === "email" ? "Sending…" : "Creating…") : mode === "email" ? "Send Invite" : "Create User"}
          </button>
          <button className="btn ghost" onClick={() => setOpen(false)} disabled={pending}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

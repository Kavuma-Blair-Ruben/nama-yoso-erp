"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile, setUserPassword } from "@/server/actions/permissions";

const BRANCHES = ["NAMAYOSO MIRDIFF", "NAMAYOSO MARSA"] as const;

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

type Profile = { id: string; name: string; email: string; branches: string[]; active: boolean; roleId: string; roleName: string };
type Role = { id: string; name: string };

function UserActiveToggle({ profile, canEdit }: { profile: Profile; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await updateProfile(profile.id, { name: profile.name, roleId: profile.roleId, branches: profile.branches, active: !profile.active });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <button
        className="switch-row"
        disabled={!canEdit || pending}
        onClick={toggle}
        title={!canEdit ? undefined : profile.active ? "Click to deactivate" : "Click to activate"}
      >
        <span className={`switch-track ${profile.active ? "on" : ""}`}>
          <span className="switch-knob" />
        </span>
        <span className={`switch-label ${profile.active ? "on" : ""}`}>{pending ? "…" : profile.active ? "Active" : "Inactive"}</span>
      </button>
      {error && <div className="login-error" style={{ marginTop: 4, fontSize: 11 }}>{error}</div>}
    </div>
  );
}

function UserEditor({ profile, roles, onDone }: { profile: Profile; roles: Role[]; onDone: () => void }) {
  const [name, setName] = useState(profile.name);
  const [roleId, setRoleId] = useState(profile.roleId);
  const [branches, setBranches] = useState<string[]>(profile.branches);
  const [active, setActive] = useState(profile.active);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [newPassword, setNewPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState<string | null>(null);
  const [passwordPending, startPasswordTransition] = useTransition();
  const router = useRouter();

  function handleSetPassword() {
    setError(null);
    setPasswordSet(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    startPasswordTransition(async () => {
      const result = await setUserPassword(profile.id, newPassword);
      if (result.error) setError(result.error);
      else {
        setPasswordSet(newPassword);
        setNewPassword("");
      }
    });
  }

  function toggleBranch(b: string) {
    setBranches((bs) => (bs.includes(b) ? bs.filter((x) => x !== b) : [...bs, b]));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateProfile(profile.id, { name, roleId, branches, active });
      if (result.error) setError(result.error);
      else {
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <div className="panel" style={{ border: "2px solid var(--accent)", marginBottom: 16, maxWidth: 600 }}>
      <div className="panel-head"><h3>Edit User — {profile.email}</h3></div>
      <div className="panel-body">
        <div className="form-row">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
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
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, margin: "10px 0 12px" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          <button className="btn accent" onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save User"}
          </button>
          <button className="btn ghost" onClick={onDone} disabled={pending}>
            Cancel
          </button>
        </div>

        <div className="form-row" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <label>Set / Reset Password</label>
          {passwordSet && (
            <div className="callout" style={{ borderColor: "var(--good)", color: "var(--good)" }}>
              Password set: <b style={{ fontFamily: "monospace" }}>{passwordSet}</b> — share this with {profile.name} now, it won&apos;t be shown again.
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 6 }}>
            Use this if an invite email never arrived — sets a real password on their account directly, no email involved.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" style={{ flex: 1 }} />
            <button type="button" className="btn ghost" onClick={() => setNewPassword(generatePassword())}>
              Generate
            </button>
            <button type="button" className="btn accent" disabled={passwordPending || newPassword.length < 8} onClick={handleSetPassword}>
              {passwordPending ? "Setting…" : "Set Password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UsersList({ profiles, roles, canEdit, currentUserId }: { profiles: Profile[]; roles: Role[]; canEdit: boolean; currentUserId: string }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingProfile = profiles.find((p) => p.id === editingId);

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <h3>Users</h3>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {editingProfile && (
          <div style={{ padding: 14 }}>
            <UserEditor profile={editingProfile} roles={roles} onDone={() => setEditingId(null)} />
          </div>
        )}
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Branches</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {profiles.length ? (
                profiles.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name} {p.id === currentUserId && <span className="tag neutral">you</span>}
                    </td>
                    <td>{p.email || "-"}</td>
                    <td>{p.roleName}</td>
                    <td>{p.branches.join(", ") || "-"}</td>
                    <td>
                      <UserActiveToggle profile={p} canEdit={canEdit && p.id !== currentUserId} />
                    </td>
                    <td className="right">
                      {canEdit && (
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setEditingId(p.id);
                          }}
                        >
                          edit
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row">
                  <td colSpan={6}>No users yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

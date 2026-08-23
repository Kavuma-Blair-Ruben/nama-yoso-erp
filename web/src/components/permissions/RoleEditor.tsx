"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRole } from "@/server/actions/permissions";
import { PERMISSION_SECTION_KEYS, PERMISSION_SECTION_LABELS, type PermissionSectionKey, type PermissionLevel } from "@/server/db/schema";

type Role = { id: string; name: string; permissions: Record<string, PermissionLevel> };

export function RoleEditor({ role, onDone }: { role?: Role; onDone: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [permissions, setPermissions] = useState<Record<string, PermissionLevel>>(() => {
    const init: Record<string, PermissionLevel> = {};
    for (const key of PERMISSION_SECTION_KEYS) init[key] = role?.permissions[key] ?? "none";
    return init;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveRole(role?.id ?? null, name, permissions);
      if (result.error) setError(result.error);
      else {
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <div className="panel" style={{ border: "2px solid var(--accent)", marginBottom: 16, maxWidth: 720 }}>
      <div className="panel-head"><h3>{role ? "Edit Role" : "New Role"}</h3></div>
      <div className="panel-body">
        <div className="form-row">
          <label>Role name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Front of House" />
        </div>
        <table className="data" style={{ marginTop: 6 }}>
          <thead>
            <tr>
              <th>Section</th>
              <th style={{ textAlign: "center" }}>No Access</th>
              <th style={{ textAlign: "center" }}>View Only</th>
              <th style={{ textAlign: "center" }}>Full Access</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSION_SECTION_KEYS.map((key) => (
              <tr key={key}>
                <td>{PERMISSION_SECTION_LABELS[key as PermissionSectionKey]}</td>
                {(["none", "view", "edit"] as const).map((level) => (
                  <td key={level} style={{ textAlign: "center" }}>
                    <input
                      type="radio"
                      name={`perm-${key}`}
                      checked={permissions[key] === level}
                      onChange={() => setPermissions((p) => ({ ...p, [key]: level }))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {error && <div className="login-error">{error}</div>}
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn accent" onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save Role"}
          </button>
          <button className="btn ghost" onClick={onDone} disabled={pending}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

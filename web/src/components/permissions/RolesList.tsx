"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRole } from "@/server/actions/permissions";
import { RoleEditor } from "./RoleEditor";
import type { PermissionLevel } from "@/server/db/schema";

type Role = { id: string; name: string; isSystem: boolean; userCount: number; permissions: Record<string, PermissionLevel> };

export function RolesList({ roles, canEdit }: { roles: Role[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Roles</h3>
        {canEdit && editing === null && (
          <button className="btn accent" onClick={() => setEditing("new")}>
            + New Role
          </button>
        )}
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {editing !== null && (
          <div style={{ padding: 14 }}>
            <RoleEditor role={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
          </div>
        )}
        {error && (
          <div className="login-error" style={{ margin: 14 }}>
            {error}
          </div>
        )}
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Role</th>
                <th>Users</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                const canDelete = !r.isSystem && r.userCount === 0;
                return (
                  <tr key={r.id}>
                    <td>
                      {r.name} {r.isSystem && <span className="tag neutral">system</span>}
                    </td>
                    <td>{r.userCount}</td>
                    <td className="right">
                      {canEdit && (
                        <a
                          href="#"
                          style={{ marginRight: 8 }}
                          onClick={(e) => {
                            e.preventDefault();
                            setEditing(r);
                          }}
                        >
                          edit
                        </a>
                      )}
                      {canEdit && canDelete && (
                        <a
                          href="#"
                          style={{ color: "var(--bad)" }}
                          onClick={(e) => {
                            e.preventDefault();
                            setError(null);
                            startTransition(async () => {
                              const result = await deleteRole(r.id);
                              if (result.error) setError(result.error);
                              else router.refresh();
                            });
                          }}
                        >
                          {pending ? "…" : "delete"}
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

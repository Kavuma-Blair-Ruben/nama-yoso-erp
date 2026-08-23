"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMaterialRequestStatus } from "@/server/actions/materialRequests";
import type { MrStatus } from "@/server/db/queries/materialRequests";

export function MrStatusActions({ id, nextStatuses }: { id: string; nextStatuses: MrStatus[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (nextStatuses.length === 0) return null;

  return (
    <>
      <div className="section-title">Update Status</div>
      {error && <div className="login-error">{error}</div>}
      <div className="btn-row">
        {nextStatuses.map((s) => (
          <button
            key={s}
            className={`btn ${s === "REJECTED" ? "ghost" : "accent"}`}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await updateMaterialRequestStatus(id, s);
                if (result.error) setError(result.error);
                else router.refresh();
              })
            }
          >
            Mark as {s}
          </button>
        ))}
      </div>
    </>
  );
}

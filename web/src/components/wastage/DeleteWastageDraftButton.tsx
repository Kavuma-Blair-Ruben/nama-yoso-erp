"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteWastageDraft } from "@/server/actions/wastage";

export function DeleteWastageDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ marginTop: 4 }}>
      {error && <div className="login-error">{error}</div>}
      <button
        className="btn ghost"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this draft wastage log? This can't be undone.")) return;
          startTransition(async () => {
            const result = await deleteWastageDraft(id);
            if (result.error) setError(result.error);
            else router.push("/wastage");
          });
        }}
      >
        {pending ? "Deleting…" : "🗑 Delete Draft"}
      </button>
    </div>
  );
}

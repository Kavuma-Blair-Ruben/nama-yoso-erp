"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProductionDraft } from "@/server/actions/production";

export function DeleteProductionDraftButton({ id }: { id: string }) {
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
          if (!confirm("Delete this draft production batch? This can't be undone.")) return;
          startTransition(async () => {
            const result = await deleteProductionDraft(id);
            if (result.error) setError(result.error);
            else router.push("/production");
          });
        }}
      >
        {pending ? "Deleting…" : "🗑 Delete Draft"}
      </button>
    </div>
  );
}

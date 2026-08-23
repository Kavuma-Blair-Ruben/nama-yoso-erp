"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProductionBatch } from "@/server/actions/production";

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
          if (!confirm("Discard this open production ticket? This can't be undone.")) return;
          startTransition(async () => {
            const result = await deleteProductionBatch(id);
            if (result.error) setError(result.error);
            else router.push("/production");
          });
        }}
      >
        {pending ? "Discarding…" : "🗑 Discard Ticket"}
      </button>
    </div>
  );
}

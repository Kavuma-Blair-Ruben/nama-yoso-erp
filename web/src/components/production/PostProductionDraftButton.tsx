"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postProductionDraft } from "@/server/actions/production";

export function PostProductionDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="btn-row" style={{ marginTop: 14, flexDirection: "column", alignItems: "flex-start" }}>
      {error && <div className="login-error">{error}</div>}
      <button
        className="btn accent"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await postProductionDraft(id);
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Posting…" : "Post & Update Stock"}
      </button>
    </div>
  );
}

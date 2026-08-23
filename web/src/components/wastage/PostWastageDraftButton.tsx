"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postWastageDraft } from "@/server/actions/wastage";

export function PostWastageDraftButton({ id }: { id: string }) {
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
            const result = await postWastageDraft(id);
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Posting…" : "Log All & Deduct Stock"}
      </button>
    </div>
  );
}

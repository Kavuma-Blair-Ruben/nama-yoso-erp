"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postDraftGrn } from "@/server/actions/grn";

export function PostDraftButton({ id }: { id: string }) {
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
            const result = await postDraftGrn(id);
            if (result.error) setError(result.error);
            else if (result.warning) router.push(`/grn/${id}?warning=${encodeURIComponent(result.warning)}`);
            else router.refresh();
          })
        }
      >
        {pending ? "Posting…" : "Post & Update Stock"}
      </button>
    </div>
  );
}

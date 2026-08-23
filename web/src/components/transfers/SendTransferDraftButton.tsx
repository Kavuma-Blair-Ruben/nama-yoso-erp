"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendTransferDraft } from "@/server/actions/transfers";

export function SendTransferDraftButton({ id }: { id: string }) {
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
            const result = await sendTransferDraft(id);
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Sending…" : "Send Transfer"}
      </button>
    </div>
  );
}

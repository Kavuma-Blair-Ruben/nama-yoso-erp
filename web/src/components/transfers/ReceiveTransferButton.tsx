"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receiveTransfer } from "@/server/actions/transfers";

export function ReceiveTransferButton({ id }: { id: string }) {
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
            const result = await receiveTransfer(id);
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Receiving…" : "Receive Transfer"}
      </button>
    </div>
  );
}

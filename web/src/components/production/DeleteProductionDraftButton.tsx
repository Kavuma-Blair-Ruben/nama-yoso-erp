"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProductionBatch } from "@/server/actions/production";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function DeleteProductionDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProductionBatch(id);
      if (result.error) setError(result.error);
      else router.push("/production");
    });
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button className="btn ghost" onClick={() => setConfirming(true)}>
        🗑 Discard Ticket
      </button>
      <ConfirmDialog
        open={confirming}
        title="Discard this ticket?"
        body="This open production ticket will be discarded. This can't be undone."
        error={error}
        pending={pending}
        confirmLabel="Discard Ticket"
        pendingLabel="Discarding…"
        onCancel={() => setConfirming(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

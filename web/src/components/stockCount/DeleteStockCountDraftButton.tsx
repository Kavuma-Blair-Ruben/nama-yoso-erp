"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteStockCountDraft } from "@/server/actions/stockCount";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function DeleteStockCountDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteStockCountDraft(id);
      if (result.error) setError(result.error);
      else router.push("/stock-count");
    });
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button className="btn ghost" onClick={() => setConfirming(true)}>
        🗑 Delete Draft
      </button>
      <ConfirmDialog
        open={confirming}
        title="Delete this draft?"
        body="This draft stock count will be deleted. This can't be undone."
        error={error}
        pending={pending}
        confirmLabel="Delete Draft"
        pendingLabel="Deleting…"
        onCancel={() => setConfirming(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

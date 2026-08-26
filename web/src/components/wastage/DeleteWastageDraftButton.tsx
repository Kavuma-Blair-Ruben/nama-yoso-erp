"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteWastageDraft } from "@/server/actions/wastage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function DeleteWastageDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteWastageDraft(id);
      if (result.error) setError(result.error);
      else router.push("/wastage");
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
        body="This draft wastage log will be deleted. This can't be undone."
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

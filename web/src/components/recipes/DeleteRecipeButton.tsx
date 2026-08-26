"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveRecipe } from "@/server/actions/recipes";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { RecipeType } from "@/server/db/queries/recipes";

export function DeleteRecipeButton({ type, code, name }: { type: RecipeType; code: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await archiveRecipe(type, code);
      if (result.error) setError(result.error);
      else router.push(`/recipes?tab=${type}`);
    });
  }

  return (
    <>
      <button type="button" className="btn ghost" style={{ color: "var(--bad)", borderColor: "var(--bad-soft)" }} onClick={() => setConfirming(true)}>
        🗑 Delete Recipe
      </button>
      <ConfirmDialog
        open={confirming}
        title="Delete this recipe?"
        body={`"${name}" will disappear from Recipe Costing and the Menu panel. Past production, sales, and any combo using it stay intact.`}
        error={error}
        pending={pending}
        confirmLabel="Delete Recipe"
        pendingLabel="Deleting…"
        onCancel={() => setConfirming(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}

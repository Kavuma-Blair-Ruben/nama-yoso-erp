"use client";

import { useState, useTransition } from "react";
import { unarchiveRecipe } from "@/server/actions/recipes";
import type { RecipeType } from "@/server/db/queries/recipes";

export function RestoreRecipeButton({ type, code }: { type: RecipeType; code: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) return <span style={{ fontSize: 12, color: "var(--good)" }}>Restored</span>;

  return (
    <>
      <button
        type="button"
        className="btn ghost"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await unarchiveRecipe(type, code);
            if (result.error) setError(result.error);
            else setDone(true);
          });
        }}
      >
        {pending ? "Restoring…" : "↩ Restore"}
      </button>
      {error && <div style={{ fontSize: 11, color: "var(--bad)", marginTop: 4 }}>{error}</div>}
    </>
  );
}

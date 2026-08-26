"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkImportRecipes, type RawRecipeImportGroup, type RawRecipeImportLine } from "@/server/actions/recipes";
import { parseCsv, pickField } from "@/lib/csv";
import type { RecipeType } from "@/server/db/queries/recipes";

// One CSV row is one ingredient line; consecutive-or-not rows sharing the
// same (Type, Recipe Name) belong to the same recipe — the header fields
// (Section/Yield/Selling Price) are read from whichever row has them set,
// since a hand-filled template usually only fills them on the first row of
// each recipe but repeating them on every row is also fine.
function groupRows(csvRows: Record<string, string>[]): RawRecipeImportGroup[] {
  const groups = new Map<string, RawRecipeImportGroup>();
  for (const r of csvRows) {
    const typeRaw = pickField(r, ["type", "type (main/sub)"]).trim().toLowerCase();
    const type: RecipeType = typeRaw.startsWith("sub") ? "sub" : "main";
    const name = pickField(r, ["recipe name", "name"]).trim();
    if (!name) continue;
    const key = `${type}:${name.toLowerCase()}`;

    let group = groups.get(key);
    if (!group) {
      group = { type, name, lines: [] };
      groups.set(key, group);
    }
    const section = pickField(r, ["section"]);
    if (section) group.section = section;
    const yieldQty = pickField(r, ["yield qty"]);
    if (yieldQty) group.yieldQty = Number(yieldQty);
    const yieldUnit = pickField(r, ["yield unit"]);
    if (yieldUnit) group.yieldUnit = yieldUnit;
    const sellingPrice = pickField(r, ["selling price"]);
    if (sellingPrice) group.sellingPrice = Number(sellingPrice);
    const branches = pickField(r, ["branches"]);
    if (branches) group.branches = branches.split(",").map((b) => b.trim()).filter(Boolean);

    const qtyNeeded = Number(pickField(r, ["qty needed", "qty"])) || 0;
    if (qtyNeeded <= 0) continue; // header-only row with no ingredient
    const line: RawRecipeImportLine = {
      ingredientCode: pickField(r, ["ingredient code"]) || undefined,
      ingredientName: pickField(r, ["ingredient name"]) || undefined,
      qtyNeeded,
      wastagePct: Number(pickField(r, ["wastage %", "wastage"])) || 0,
      unitLabel: pickField(r, ["unit"]),
    };
    group.lines.push(line);
  }
  return [...groups.values()];
}

export function RecipesCsvImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [failedRows, setFailedRows] = useState<{ name: string; reason: string }[]>([]);

  function handleFile(file: File) {
    setError(null);
    setInfo(null);
    setFailedRows([]);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const csvRows = parseCsv(String(evt.target?.result ?? ""));
      const groups = groupRows(csvRows);
      if (groups.length === 0) {
        setError("No valid rows found — expecting Type, Recipe Name, and ingredient columns.");
        return;
      }
      startTransition(async () => {
        const result = await bulkImportRecipes(groups);
        if (result.error) setError(result.error);
        else {
          const updatedMsg = result.updated?.length ? `, ${result.updated.length} updated (matched by name)` : "";
          const failedMsg = result.failed?.length ? `, ${result.failed.length} failed` : "";
          setInfo(`Imported ${result.imported?.length ?? 0} new recipe(s)${updatedMsg}${failedMsg}.`);
          setFailedRows(result.failed ?? []);
          router.refresh();
        }
      });
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div className="btn-row" style={{ margin: 0 }}>
        <a href="/recipes/import-template" className="btn ghost">Download Template</a>
        <button type="button" className="btn ghost" disabled={pending} onClick={() => fileRef.current?.click()}>
          {pending ? "Importing…" : "Import CSV"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {info && <div className="callout" style={{ fontSize: 12, maxWidth: 420 }}>{info}</div>}
      {failedRows.length > 0 && (
        <div className="callout" style={{ borderColor: "var(--bad)", color: "var(--bad)", fontSize: 12, maxWidth: 420 }}>
          {failedRows.map((f) => (
            <div key={f.name}>
              <b>{f.name}</b>: {f.reason}
            </div>
          ))}
        </div>
      )}
      {error && <div className="login-error" style={{ fontSize: 12, maxWidth: 420 }}>{error}</div>}
    </div>
  );
}

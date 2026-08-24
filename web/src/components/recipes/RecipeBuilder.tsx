"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRecipe, updateRecipe, uploadRecipePhoto, type RecipeInput } from "@/server/actions/recipes";
import type { RecipeType } from "@/server/db/queries/recipes";
import { fmt, money, num } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";

type PickerItem = { kind: "stock" | "recipe"; id: string; legacyCode: string; name: string; issueUnit: string | null; ratePerKgL: number | null; sourceType: string };
// A line's ingredient is either a stock item (product/sub-recipe) or —
// main recipes only — another main recipe used as a "combo" component;
// exactly one of stockItemId/ingredientMainRecipeId is set, mirroring the
// server's check constraint. qtyNeeded/wastagePct are raw strings while
// editing — see num() in @/lib/format for why.
type Line = { stockItemId: string | null; ingredientMainRecipeId: string | null; unitLabel: string; qtyNeeded: string; wastagePct: string };

function pickerValue(l: Line): string {
  return l.ingredientMainRecipeId ? `recipe:${l.ingredientMainRecipeId}` : `stock:${l.stockItemId}`;
}
function findPickerItem(items: PickerItem[], l: Line): PickerItem | undefined {
  return l.ingredientMainRecipeId
    ? items.find((x) => x.kind === "recipe" && x.id === l.ingredientMainRecipeId)
    : items.find((x) => x.kind === "stock" && x.id === l.stockItemId);
}

// Qty to Buy is the bigger, wastage-inflated number actually charged for —
// same relationship as index.html's computeFinalWt (peel/trim/cook loss adds
// back onto what you need). Guard divide-by-zero the same way it does.
function qtyToBuy(l: Line): number {
  const loss = num(l.wastagePct) / 100;
  const qtyNeeded = num(l.qtyNeeded);
  if (loss >= 1) return qtyNeeded;
  return qtyNeeded / (1 - loss);
}

type BranchOption = { id: string; code: string; name: string };

export function RecipeBuilder({
  type,
  code,
  items,
  branchOptions,
  initial,
}: {
  type: RecipeType;
  code?: string; // present in edit mode
  items: PickerItem[];
  branchOptions: BranchOption[];
  initial?: {
    name: string;
    section: string;
    yieldQty: number | null;
    yieldUnit: string;
    cookBookText: string;
    sellingPrice: number | null;
    targetFoodCostPct: number | null;
    photoUrl: string | null;
    stockable: boolean;
    shelfLifeDays: number | null;
    storageInstructions: string | null;
    branches: string[];
    branchPrices: { branchId: string; sellingPrice: number }[];
    lines: { stockItemId: string | null; ingredientMainRecipeId: string | null; unitLabel: string; qty: number; wastagePct: number }[];
  };
}) {
  const router = useRouter();
  const isEdit = !!code;
  const [name, setName] = useState(initial?.name ?? "");
  const [section, setSection] = useState(initial?.section ?? "");
  const [yieldQty, setYieldQty] = useState(initial?.yieldQty != null ? String(initial.yieldQty) : "");
  const [yieldUnit, setYieldUnit] = useState(initial?.yieldUnit ?? "");
  const [cookBookText, setCookBookText] = useState(initial?.cookBookText ?? "");
  const [sellingPrice, setSellingPrice] = useState(initial?.sellingPrice != null ? String(initial.sellingPrice) : "");
  const [targetFoodCostPct, setTargetFoodCostPct] = useState(initial?.targetFoodCostPct != null ? String(initial.targetFoodCostPct) : "");
  const [stockable, setStockable] = useState(initial?.stockable ?? true);
  const [shelfLifeDays, setShelfLifeDays] = useState(initial?.shelfLifeDays != null ? String(initial.shelfLifeDays) : "");
  const [storageInstructions, setStorageInstructions] = useState(initial?.storageInstructions ?? "");
  const [branches, setBranches] = useState<string[]>(initial?.branches ?? []);
  function toggleBranch(b: string) {
    setBranches((bs) => (bs.includes(b) ? bs.filter((x) => x !== b) : [...bs, b]));
  }
  // Per-branch selling-price override, main recipes only — a branch left
  // blank here just uses the default sellingPrice above.
  const [branchPrices, setBranchPrices] = useState<Record<string, string>>(
    Object.fromEntries((initial?.branchPrices ?? []).map((bp) => [bp.branchId, String(bp.sellingPrice)]))
  );
  // The server stores Qty to Buy (wastage-inflated); back out Qty Needed from
  // the stored wastagePct so re-editing shows the same numbers that were
  // originally typed in, not the inflated total.
  const [lines, setLines] = useState<Line[]>(
    initial?.lines.map((l) => ({
      stockItemId: l.stockItemId,
      ingredientMainRecipeId: l.ingredientMainRecipeId,
      unitLabel: l.unitLabel,
      wastagePct: String(l.wastagePct),
      qtyNeeded: String(l.qty * (1 - (l.wastagePct || 0) / 100)),
    })) ?? []
  );
  const [photoUrl, setPhotoUrl] = useState(initial?.photoUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [photoPending, startPhotoTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function addLine() {
    const p = items[0];
    if (!p) return;
    setLines((ls) => [
      ...ls,
      {
        stockItemId: p.kind === "stock" ? p.id : null,
        ingredientMainRecipeId: p.kind === "recipe" ? p.id : null,
        unitLabel: canonicalUnitLabel(p.issueUnit),
        qtyNeeded: "1",
        wastagePct: "0",
      },
    ]);
  }
  function updateLineItem(i: number, pickerVal: string) {
    const [kind, id] = pickerVal.split(":");
    const p = items.find((x) => x.kind === kind && x.id === id);
    if (!p) return;
    setLines((ls) =>
      ls.map((l, idx) =>
        idx === i
          ? { ...l, stockItemId: p.kind === "stock" ? p.id : null, ingredientMainRecipeId: p.kind === "recipe" ? p.id : null, unitLabel: canonicalUnitLabel(p.issueUnit) }
          : l
      )
    );
  }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  const estimatedCost = lines.reduce((s, l) => {
    const p = findPickerItem(items, l);
    return s + qtyToBuy(l) * (p?.ratePerKgL ?? 0);
  }, 0);
  const sp = Number(sellingPrice) || 0;
  const estFoodCostPct = sp > 0 ? (estimatedCost / sp) * 100 : null;

  function handlePhotoChange() {
    const file = fileRef.current?.files?.[0];
    if (!file || !code) return;
    const fd = new FormData();
    fd.set("photo", file);
    startPhotoTransition(async () => {
      const result = await uploadRecipePhoto(type, code, fd);
      if (result.error) setError(result.error);
      else if (result.url) setPhotoUrl(result.url);
    });
  }

  function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError("Enter a recipe name.");
    if (lines.length === 0) return setError("Add at least one ingredient.");

    const input: RecipeInput = {
      type,
      name: name.trim(),
      section: section.trim(),
      yieldQty: yieldQty ? Number(yieldQty) : null,
      yieldUnit: yieldUnit.trim(),
      cookBookText,
      sellingPrice: type === "main" && sellingPrice ? Number(sellingPrice) : null,
      targetFoodCostPct: type === "main" && targetFoodCostPct ? Number(targetFoodCostPct) : null,
      stockable: type === "sub" ? stockable : undefined,
      shelfLifeDays: type === "sub" && stockable && shelfLifeDays ? Number(shelfLifeDays) : null,
      storageInstructions: type === "sub" && stockable ? storageInstructions.trim() || null : null,
      branches,
      branchPrices:
        type === "main"
          ? Object.entries(branchPrices)
              .filter(([, v]) => v.trim() !== "")
              .map(([branchId, v]) => ({ branchId, sellingPrice: Number(v) }))
          : undefined,
      lines: lines.map((l) => ({ stockItemId: l.stockItemId, ingredientMainRecipeId: l.ingredientMainRecipeId, unitLabel: l.unitLabel, qty: qtyToBuy(l), wastagePct: num(l.wastagePct) })),
    };

    startTransition(async () => {
      const result = isEdit ? await updateRecipe(code!, input) : await createRecipe(input);
      if (result.error) setError(result.error);
      else if (result.code) router.push(`/recipes/${type}/${result.code}`);
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 900 }}>
      <div className="panel-head">
        <h3>{isEdit ? `Edit ${type === "main" ? "Main Recipe" : "Sub-Recipe"}` : `New ${type === "main" ? "Main Recipe" : "Sub-Recipe"}`}</h3>
        {isEdit && <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{code}</span>}
      </div>
      <div className="panel-body">
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Name</div>
          <div>Section</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Avocado Toast" />
          <input type="text" value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Breakfast" />
        </div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Yield qty</div>
          <div>Yield unit</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
          <input type="text" inputMode="decimal" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} placeholder="e.g. 1" />
          <input type="text" value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)} placeholder="e.g. kg, ltr, portion" />
        </div>

        <div className="section-title">Branches</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 4 }}>
          {branchOptions.map((b) => (
            <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 500 }}>
              <input type="checkbox" checked={branches.includes(b.code)} onChange={() => toggleBranch(b.code)} /> {b.name}
            </label>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 16 }}>Leave all unchecked to make this recipe available to every branch.</div>

        {type === "sub" && (
          <>
            <div className="section-title">Production</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <span className={`tag ${stockable ? "good" : "neutral"}`}>{stockable ? "Stockable" : "Non-Stockable"}</span>
              <button type="button" className="btn ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setStockable((v) => !v)}>
                {stockable ? "Mark Non-Stockable" : "Mark Stockable"}
              </button>
              <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                {stockable ? "Needs a production event to replenish — tracks its own stock." : "Ingredients deplete directly wherever it's used, no production event needed."}
              </span>
            </div>
            {stockable && (
              <>
                <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div>Shelf life (days)</div>
                  <div>Storage instructions</div>
                </div>
                <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
                  <input type="text" inputMode="decimal" value={shelfLifeDays} onChange={(e) => setShelfLifeDays(e.target.value)} placeholder="e.g. 4 — used on the Receipt of Production" />
                  <input type="text" value={storageInstructions} onChange={(e) => setStorageInstructions(e.target.value)} placeholder="e.g. Fresh 0° to 5°" />
                </div>
              </>
            )}
          </>
        )}

        <div className="section-title">Ingredients</div>
        <div className="callout" style={{ fontSize: 11.5 }}>
          <b>Qty Needed</b> (how much you actually use after prep) &rarr; add back <b>Wastage %</b> (peel/trim/cook loss) &rarr; <b>Qty to Buy</b> (bigger number, what you&apos;re actually charged for) &times; Rate = <b>Line Cost</b>.
        </div>
        <div className="line-builder">
          <div className="line-builder-row head" style={{ gridTemplateColumns: "2fr 90px 80px 80px 90px 90px 32px" }}>
            <div>Ingredient</div>
            <div>Qty Needed</div>
            <div>Unit</div>
            <div>Wastage %</div>
            <div>Qty to Buy</div>
            <div>Line Cost</div>
            <div></div>
          </div>
          {lines.map((l, i) => {
            const p = findPickerItem(items, l);
            const buy = qtyToBuy(l);
            const lineCost = buy * (p?.ratePerKgL ?? 0);
            return (
              <div className="line-builder-row" key={i} style={{ gridTemplateColumns: "2fr 90px 80px 80px 90px 90px 32px" }}>
                <select value={pickerValue(l)} onChange={(e) => updateLineItem(i, e.target.value)}>
                  {items.map((it) => (
                    <option key={`${it.kind}:${it.id}`} value={`${it.kind}:${it.id}`}>
                      {it.legacyCode} — {it.name}
                      {it.sourceType === "produced" ? " (sub-recipe)" : it.kind === "recipe" ? " (recipe)" : ""}
                    </option>
                  ))}
                </select>
                <input type="text" inputMode="decimal" value={l.qtyNeeded} onChange={(e) => updateLine(i, { qtyNeeded: e.target.value })} />
                <input type="text" value={l.unitLabel} onChange={(e) => updateLine(i, { unitLabel: e.target.value })} />
                <input type="text" inputMode="decimal" value={l.wastagePct} onChange={(e) => updateLine(i, { wastagePct: e.target.value })} />
                <div className="mono-r" style={{ alignSelf: "center" }}>{fmt(buy, 2)}</div>
                <div className="mono-r" style={{ alignSelf: "center" }}>{money(lineCost, 2)}</div>
                <button className="line-remove" onClick={() => removeLine(i)}>✕</button>
              </div>
            );
          })}
        </div>
        <button className="btn ghost" style={{ marginBottom: 16 }} onClick={addLine}>+ Add ingredient</button>
        <div className="field-row"><span className="k">Estimated cost (live rates)</span><span className="v tabular">{money(estimatedCost, 3)}</span></div>

        {type === "main" && (
          <>
            <div className="section-title" style={{ marginTop: 16 }}>Pricing &amp; Food Cost</div>
            <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>Default selling price</div>
              <div>Target food cost %</div>
            </div>
            <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 6 }}>
              <input type="text" inputMode="decimal" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="e.g. 45.00" />
              <input type="text" inputMode="decimal" value={targetFoodCostPct} onChange={(e) => setTargetFoodCostPct(e.target.value)} placeholder="e.g. 30" />
            </div>
            {estFoodCostPct != null && (
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 16 }}>
                Actual food cost at this selling price: <b>{fmt(estFoodCostPct, 1)}%</b>
                {targetFoodCostPct && (
                  <span className={estFoodCostPct > Number(targetFoodCostPct) ? "tag bad" : "tag good"} style={{ marginLeft: 8 }}>
                    {estFoodCostPct > Number(targetFoodCostPct) ? "Above target" : "Within target"}
                  </span>
                )}
              </div>
            )}

            {branchOptions.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", margin: "4px 0 6px" }}>Selling price by branch</div>
                <div className="callout" style={{ fontSize: 11.5, marginBottom: 8 }}>
                  Leave a branch blank to charge the default price above there — only fill one in if this branch actually
                  sells this dish for a different price.
                </div>
                <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div>Branch</div>
                  <div>Selling price override</div>
                </div>
                {branchOptions.map((b) => (
                  <div key={b.id} className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 4 }}>
                    <div style={{ alignSelf: "center", fontSize: 13 }}>{b.name}</div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={branchPrices[b.id] ?? ""}
                      onChange={(e) => setBranchPrices((bp) => ({ ...bp, [b.id]: e.target.value }))}
                      placeholder={sellingPrice ? `Same as default (${sellingPrice})` : "Same as default"}
                    />
                  </div>
                ))}
              </>
            )}
          </>
        )}

        <div className="section-title" style={{ marginTop: 16 }}>Cook Book</div>
        <textarea
          value={cookBookText}
          onChange={(e) => setCookBookText(e.target.value)}
          rows={8}
          placeholder="Method / preparation steps..."
          style={{ width: "100%", marginBottom: 16, fontFamily: "inherit", fontSize: 13, padding: 10 }}
        />

        <div className="section-title">Photo</div>
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={name} style={{ maxWidth: 240, borderRadius: 8, marginBottom: 8, display: "block" }} />
        )}
        {isEdit ? (
          <div style={{ marginBottom: 16 }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoChange} disabled={photoPending} />
            {photoPending && <span style={{ fontSize: 11.5, marginLeft: 8, color: "var(--ink-soft)" }}>Uploading…</span>}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginBottom: 16 }}>Save the recipe first, then upload a photo from the edit page.</div>
        )}

        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          <button className="btn accent" onClick={handleSubmit} disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save Changes" : "Create Recipe"}
          </button>
        </div>
      </div>
    </div>
  );
}

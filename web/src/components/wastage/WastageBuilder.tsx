"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postWastageEvent, saveWastageDraft, updateWastageDraft, uploadWastagePhoto, deleteWastagePhoto, getRecipeWasteLines } from "@/server/actions/wastage";
import { money, todayStr, num } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";
import { ItemSearchSelect } from "@/components/ui/ItemSearchSelect";

type PickerItem = { id: string; legacyCode: string; name: string; issueUnit: string | null; ratePerKgL: number | null };
type RecipePickerItem = { legacyCode: string; name: string };
// qty is a raw string while editing — see num() in @/lib/format for why.
type Line = { stockItemId: string; unitLabel: string; qty: string; reason: string; notes: string; rate: number; photoUrl?: string };

type CostCenter = { id: string; branchId: string; name: string };

export function WastageBuilder({
  items,
  mainRecipes,
  costCenters,
  branches,
  reasons,
  existingEventId,
  initialEventDate,
  initialCostCenterId,
  initialBranchId,
  initialStaffName,
  initialLines,
}: {
  items: PickerItem[];
  mainRecipes?: RecipePickerItem[];
  costCenters: CostCenter[];
  branches: { id: string; name: string }[];
  reasons: readonly string[];
  existingEventId?: string;
  initialEventDate?: string;
  initialCostCenterId?: string;
  initialBranchId?: string;
  initialStaffName?: string;
  initialLines?: Line[];
}) {
  const router = useRouter();
  const itemOptions = useMemo(() => items.map((it) => ({ value: it.id, code: it.legacyCode, label: it.name })), [items]);
  const recipeOptions = useMemo(() => (mainRecipes ?? []).map((r) => ({ value: r.legacyCode, code: r.legacyCode, label: r.name })), [mainRecipes]);
  const [eventDate, setEventDate] = useState(initialEventDate ?? todayStr());
  const [branchId, setBranchId] = useState(initialBranchId ?? branches[0]?.id ?? "");
  const costCentersForBranch = costCenters.filter((c) => c.branchId === branchId);
  const [costCenterId, setCostCenterId] = useState(initialCostCenterId ?? costCentersForBranch[0]?.id ?? "");
  function changeBranch(newBranchId: string) {
    setBranchId(newBranchId);
    const stillValid = costCenters.some((c) => c.branchId === newBranchId && c.id === costCenterId);
    if (!stillValid) setCostCenterId(costCenters.find((c) => c.branchId === newBranchId)?.id ?? "");
  }
  const [staffName, setStaffName] = useState(initialStaffName ?? "");
  const [lines, setLines] = useState<Line[]>(initialLines ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [wasteRecipeCode, setWasteRecipeCode] = useState(mainRecipes?.[0]?.legacyCode ?? "");
  const [wastePortions, setWastePortions] = useState("1");
  const [recipeWastePending, startRecipeWasteTransition] = useTransition();

  function addRecipeWaste() {
    if (!wasteRecipeCode) return;
    setError(null);
    startRecipeWasteTransition(async () => {
      const result = await getRecipeWasteLines(wasteRecipeCode, num(wastePortions));
      if (result.error) return setError(result.error);
      const tag = `Recipe waste: ${result.recipeName} × ${wastePortions}`;
      const newLines: Line[] = (result.lines ?? []).map((l) => ({
        stockItemId: l.stockItemId,
        unitLabel: l.unitLabel ?? "",
        qty: String(l.qty),
        reason: reasons[0],
        notes: tag,
        rate: l.rate,
      }));
      setLines((ls) => [...ls, ...newLines]);
    });
  }

  function addLine() {
    const p = items[0];
    if (!p) return;
    setLines((ls) => [...ls, { stockItemId: p.id, unitLabel: canonicalUnitLabel(p.issueUnit), qty: "0", reason: reasons[0], notes: "", rate: p.ratePerKgL ?? 0, photoUrl: undefined }]);
  }

  function handlePhotoChange(i: number, file: File | undefined) {
    if (!file) return;
    setUploadingIdx(i);
    const fd = new FormData();
    fd.set("photo", file);
    startTransition(async () => {
      const result = await uploadWastagePhoto(fd);
      setUploadingIdx(null);
      if (result.error) setError(result.error);
      else if (result.url) updateLine(i, { photoUrl: result.url });
    });
  }

  function removePhoto(i: number) {
    const url = lines[i]?.photoUrl;
    updateLine(i, { photoUrl: undefined });
    if (url) startTransition(async () => { await deleteWastagePhoto(url); });
  }
  function updateLineItem(i: number, stockItemId: string) {
    const p = items.find((x) => x.id === stockItemId);
    if (!p) return;
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, stockItemId: p.id, unitLabel: canonicalUnitLabel(p.issueUnit), rate: p.ratePerKgL ?? 0 } : l)));
  }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  const totalCost = lines.reduce((s, l) => s + num(l.qty) * l.rate, 0);

  function buildInput() {
    return {
      eventDate,
      costCenterId,
      branchId,
      staffName: staffName || undefined,
      lines: lines.filter((l) => num(l.qty) > 0).map((l) => ({ stockItemId: l.stockItemId, qty: num(l.qty), unitLabel: l.unitLabel || undefined, reason: l.reason, notes: l.notes || undefined, rate: l.rate, photoUrl: l.photoUrl })),
    };
  }

  function handleSubmit(status: "draft" | "posted") {
    setError(null);
    if (!costCenterId) return setError("Choose a sector.");
    if (!branchId) return setError("Choose a branch.");
    const input = buildInput();
    if (input.lines.length === 0) return setError("Add at least one wasted item with a quantity.");

    startTransition(async () => {
      const result = existingEventId
        ? await updateWastageDraft(existingEventId, input)
        : status === "posted"
          ? await postWastageEvent(input)
          : await saveWastageDraft(input);
      if (result.error) setError(result.error);
      else router.push(`/wastage/${result.id}`);
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 1040 }}>
      <div className="panel-head">
        <h3>{existingEventId ? "Edit Draft Wastage Log" : "Daily Wastage Log"}</h3>
      </div>
      <div className="panel-body">
        <div className="callout">Open one log for the day/section, then add every item that was wasted.</div>
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>Date (can be backdated)</div>
          <div>Section</div>
          <div>Branch</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
          <input type="date" value={eventDate} max={todayStr()} onChange={(e) => setEventDate(e.target.value)} />
          <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
            {costCentersForBranch.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={branchId} onChange={(e) => changeBranch(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ maxWidth: 300 }}>
          <label>Logged by</label>
          <input type="text" value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Staff name" />
        </div>

        {mainRecipes && mainRecipes.length > 0 && (
          <>
            <div className="section-title">Waste a Finished Dish</div>
            <div className="callout" style={{ fontSize: 11.5 }}>
              Pick a recipe and how many portions were wasted — its live ingredient breakdown is added below as individual lines, ready to review before logging.
            </div>
            <div className="line-builder-row" style={{ gridTemplateColumns: "2fr 100px 140px", marginBottom: 16 }}>
              <ItemSearchSelect options={recipeOptions} value={wasteRecipeCode} onChange={setWasteRecipeCode} placeholder="Search recipe code or name…" />
              <input type="text" inputMode="decimal" value={wastePortions} onChange={(e) => setWastePortions(e.target.value)} placeholder="portions" />
              <button type="button" className="btn ghost" disabled={recipeWastePending} onClick={addRecipeWaste}>
                {recipeWastePending ? "Adding…" : "+ Add Ingredients"}
              </button>
            </div>
          </>
        )}

        <div className="section-title">Wasted Items</div>
        <div className="table-wrap" style={{ maxHeight: 400 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th className="right">Qty</th>
                <th>Unit</th>
                <th>Reason</th>
                <th>Notes</th>
                <th>Photo</th>
                <th className="right">Cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.length ? (
                lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ minWidth: 220 }}>
                        <ItemSearchSelect options={itemOptions} value={l.stockItemId} onChange={(v) => updateLineItem(i, v)} placeholder="Search item…" />
                      </div>
                    </td>
                    <td><input type="text" inputMode="decimal" style={{ width: 70 }} value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></td>
                    <td>{l.unitLabel}</td>
                    <td>
                      <select value={l.reason} onChange={(e) => updateLine(i, { reason: e.target.value })}>
                        {reasons.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td><input type="text" style={{ width: 140 }} value={l.notes} onChange={(e) => updateLine(i, { notes: e.target.value })} placeholder="optional" /></td>
                    <td>
                      {l.photoUrl ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <a href={l.photoUrl} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={l.photoUrl} alt="Wasted item" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, border: "1px solid var(--line)" }} />
                          </a>
                          <button type="button" className="line-remove" onClick={() => removePhoto(i)}>✕</button>
                        </div>
                      ) : (
                        <label className="btn ghost" style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", display: "inline-block" }}>
                          {uploadingIdx === i ? "…" : "📷 Add"}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: "none" }}
                            onChange={(e) => handlePhotoChange(i, e.target.files?.[0])}
                          />
                        </label>
                      )}
                    </td>
                    <td className="mono-r">{money(num(l.qty) * l.rate, 2)}</td>
                    <td><button className="line-remove" onClick={() => removeLine(i)}>✕</button></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={8}>No items added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <button className="btn ghost" style={{ margin: "10px 0 16px" }} onClick={addLine}>+ Add item</button>

        <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Total Cost Impact</b></span><span className="v">{money(totalCost, 2)}</span></div>

        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          {existingEventId ? (
            <button className="btn accent" disabled={pending} onClick={() => handleSubmit("draft")}>
              {pending ? "Saving…" : "Save Changes"}
            </button>
          ) : (
            <>
              <button className="btn accent" disabled={pending} onClick={() => handleSubmit("posted")}>
                {pending ? "Saving…" : "Log All & Deduct Stock"}
              </button>
              <button className="btn ghost" disabled={pending} onClick={() => handleSubmit("draft")}>
                Save as Draft
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

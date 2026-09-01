"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postStockCount, saveStockCountDraft, updateStockCountDraft, removeStockCountDraftLine, pullStockCountDraftLines } from "@/server/actions/stockCount";
import { createStockCountTemplate } from "@/server/actions/stockCountTemplates";
import { fmt, money, todayStr, num } from "@/lib/format";
import { canonicalUnitLabel, convertQtyToCanonical } from "@/lib/unitMath";
import { ScanInput } from "@/components/ui/ScanInput";
import { extractProductCode } from "@/lib/scanCode";
import { ItemSearchSelect } from "@/components/ui/ItemSearchSelect";

type PickerItem = { id: string; legacyCode: string; name: string; issueUnit: string | null; ratePerKgL: number | null; unitWeight: number | null; purchaseUnit: string | null };
// countedQty is a raw string while editing ("" = not yet counted) — see num()
// in @/lib/format for why a number can't be stored straight back into the input.
// storageQty/ingredientQty are the friendlier two-part entry behind
// countedQty (sealed purchase units + loose issue-unit qty, same split as
// GRN receiving) — countedQty is always kept in sync via recomputeCountedQty
// whenever either changes, and stays the one field actually submitted for
// the stock adjustment. Both stay "" together with countedQty when nothing's
// been entered yet.
// countedByName is who last saved a counted qty for this line — set once
// this draft has been saved at least once (see updateStockCountDraft).
type Line = {
  stockItemId: string;
  legacyCode: string;
  name: string;
  unitLabel: string;
  issueUnit: string | null;
  unitWeight: number | null;
  purchaseUnit: string | null;
  systemQty: number;
  countedQty: string;
  storageQty: string;
  ingredientQty: string;
  rate: number;
  countedByName?: string | null;
};

// storageQty (whole/sealed purchase units) * unitWeight + ingredientQty
// (loose, already in issue-unit terms) = total in issue units, then down to
// canonical KG/L — identical formula to GRN receiving. Returns "" (not yet
// counted) only when both inputs are blank.
function recomputeCountedQty(storageQty: string, ingredientQty: string, unitWeight: number | null, issueUnit: string | null): string {
  if (storageQty === "" && ingredientQty === "") return "";
  const totalIssueQty = num(storageQty) * (unitWeight ?? 1) + num(ingredientQty);
  return String(convertQtyToCanonical(totalIssueQty, issueUnit));
}
type Template = { id: string; name: string; costCenter: string | null; stockItemIds: string[] };
type CostCenter = { id: string; branchId: string; name: string };

export function StockCountBuilder({
  items,
  branches,
  costCenters,
  stockBalances,
  templates,
  blindCounts,
  existingCountId,
  initialBranchId,
  initialCostCenterId,
  initialCountDate,
  initialLines,
}: {
  items: PickerItem[];
  branches: { id: string; name: string }[];
  costCenters: CostCenter[];
  stockBalances: { stockItemId: string; branchId: string; costCenterId: string | null; qtyOnHand: number }[];
  templates: Template[];
  blindCounts: boolean;
  existingCountId?: string;
  initialBranchId?: string;
  initialCostCenterId?: string;
  initialCountDate?: string;
  initialLines?: Line[];
}) {
  const router = useRouter();
  const itemOptions = useMemo(() => items.map((it) => ({ value: it.id, code: it.legacyCode, label: it.name })), [items]);
  const [branchId, setBranchId] = useState(initialBranchId ?? branches[0]?.id ?? "");
  const costCentersForBranch = costCenters.filter((c) => c.branchId === branchId);
  const [costCenterId, setCostCenterId] = useState(initialCostCenterId ?? costCentersForBranch[0]?.id ?? "");
  const costCenterName = costCenters.find((c) => c.id === costCenterId)?.name ?? "";
  function changeBranch(newBranchId: string) {
    setBranchId(newBranchId);
    const stillValid = costCenters.some((c) => c.branchId === newBranchId && c.id === costCenterId);
    if (!stillValid) setCostCenterId(costCenters.find((c) => c.branchId === newBranchId)?.id ?? "");
  }
  const [countDate, setCountDate] = useState(initialCountDate ?? todayStr());
  const [lines, setLines] = useState<Line[]>(initialLines ?? []);
  const [pickerId, setPickerId] = useState(items[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function availableFor(stockItemId: string): number {
    return stockBalances.find((b) => b.stockItemId === stockItemId && b.branchId === branchId && b.costCenterId === costCenterId)?.qtyOnHand ?? 0;
  }

  function lineFor(p: PickerItem): Line {
    return {
      stockItemId: p.id,
      legacyCode: p.legacyCode,
      name: `${p.legacyCode} — ${p.name}`,
      unitLabel: canonicalUnitLabel(p.issueUnit),
      issueUnit: p.issueUnit,
      unitWeight: p.unitWeight,
      purchaseUnit: p.purchaseUnit,
      systemQty: availableFor(p.id),
      countedQty: "",
      storageQty: "",
      ingredientQty: "",
      rate: p.ratePerKgL ?? 0,
    };
  }
  function addLine() {
    const p = items.find((x) => x.id === pickerId);
    if (!p) return;
    if (lines.some((l) => l.stockItemId === p.id)) return;
    setLines((ls) => [...ls, lineFor(p)]);
  }
  function addLineByScan(scanned: string) {
    const code = extractProductCode(scanned).trim().toLowerCase();
    const p = items.find((x) => x.legacyCode.toLowerCase() === code);
    if (!p) return setError(`No item found with code "${extractProductCode(scanned)}".`);
    setError(null);
    if (lines.some((l) => l.stockItemId === p.id)) return setInfo(`${p.name} is already in this count.`);
    setInfo(null);
    setLines((ls) => [...ls, lineFor(p)]);
  }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  // Storage/ingredient inputs always write together with the recomputed
  // countedQty so every existing consumer (variance, buildInput, posting)
  // keeps reading one number without knowing about the two-part entry.
  function updateBreakdown(i: number, field: "storageQty" | "ingredientQty", value: string) {
    setLines((ls) =>
      ls.map((l, idx) => {
        if (idx !== i) return l;
        const next = { ...l, [field]: value };
        return { ...next, countedQty: recomputeCountedQty(next.storageQty, next.ingredientQty, next.unitWeight, next.issueUnit) };
      })
    );
  }
  // For an existing (already-saved) draft, a line the user removes locally
  // has to be deleted server-side immediately too — now that saves upsert
  // rather than replace (see updateStockCountDraft), simply leaving it out
  // of the next save would no longer delete it. A brand-new, not-yet-saved
  // count has nothing in the DB yet, so local-only removal is correct there.
  function removeLine(i: number) {
    const line = lines[i];
    setLines((ls) => ls.filter((_, idx) => idx !== i));
    if (existingCountId) {
      startTransition(async () => {
        const result = await removeStockCountDraftLine(existingCountId, line.stockItemId);
        if (result.error) setError(result.error);
      });
    }
  }
  function zeroUncounted() {
    const n = lines.filter((l) => l.countedQty === "").length;
    setLines(lines.map((l) => (l.countedQty === "" ? { ...l, countedQty: "0", storageQty: "0", ingredientQty: "0" } : l)));
    setInfo(`Set ${n} uncounted item(s) to zero.`);
  }
  // Merges in lines that exist in the DB but not locally yet (added by
  // another counter working the same draft since this page loaded) —
  // deliberately never overwrites a line already present locally, so it
  // can't clobber something the current counter is mid-typing.
  function pullOthersCounts() {
    if (!existingCountId) return;
    setError(null);
    startTransition(async () => {
      const fresh = await pullStockCountDraftLines(existingCountId);
      const existingIds = new Set(lines.map((l) => l.stockItemId));
      const added = fresh.filter((f) => !existingIds.has(f.stockItemId));
      if (added.length === 0) {
        setInfo("Nothing new — you already have every item that's been counted so far.");
        return;
      }
      setLines((ls) => [
        ...ls,
        ...added.map((f) => {
          const p = items.find((x) => x.id === f.stockItemId);
          return {
            stockItemId: f.stockItemId,
            legacyCode: f.legacyCode,
            name: `${f.legacyCode} — ${f.name}`,
            unitLabel: f.unitLabel ?? "",
            issueUnit: p?.issueUnit ?? null,
            unitWeight: p?.unitWeight ?? null,
            purchaseUnit: p?.purchaseUnit ?? null,
            systemQty: f.systemQty,
            countedQty: f.countedQty != null ? String(f.countedQty) : "",
            storageQty: f.storageQty != null ? String(f.storageQty) : "",
            ingredientQty: f.ingredientQty != null ? String(f.ingredientQty) : "",
            rate: f.rateAtCount ?? 0,
            countedByName: f.countedByName,
          };
        }),
      ]);
      setInfo(`Pulled in ${added.length} item(s) counted by someone else.`);
    });
  }

  const countedLines = lines.filter((l) => l.countedQty !== "");
  const totalVariance = countedLines.reduce((s, l) => s + (num(l.countedQty) - l.systemQty) * l.rate, 0);

  const templatesForCostCenter = templates.filter((t) => !t.costCenter || t.costCenter === costCenterName);

  function loadTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setError(null);
    const existingIds = new Set(lines.map((l) => l.stockItemId));
    const next = [...lines];
    let added = 0;
    for (const stockItemId of t.stockItemIds) {
      if (existingIds.has(stockItemId)) continue;
      const p = items.find((x) => x.id === stockItemId);
      if (!p) continue;
      next.push(lineFor(p));
      added++;
    }
    setLines(next);
    setInfo(added > 0 ? `Loaded ${added} item(s) from "${t.name}".` : `All items from "${t.name}" are already in the count.`);
  }

  function saveAsTemplate() {
    if (lines.length === 0) {
      setError("Add items to the count first.");
      return;
    }
    const name = templateName.trim() || `${costCenterName || "Count"} Template`;
    startTransition(async () => {
      const result = await createStockCountTemplate(name, costCenterName || null, lines.map((l) => l.stockItemId));
      if (result.error) setError(result.error);
      else {
        setInfo(`Saved as template: ${name}`);
        setTemplateName("");
        setSavingTemplate(false);
        router.refresh();
      }
    });
  }

  function exportCsv() {
    if (lines.length === 0) {
      setError("Add items to the count first, then export a blank sheet.");
      return;
    }
    const header = ["Item", "Code", "Purchase Unit", "Storage Qty", "Ingredient Unit", "Ingredient Qty", "Unit", "System Qty", "Counted Qty"];
    const rows = lines.map((l) => [l.name.replace(/^.*? — /, ""), l.legacyCode, l.purchaseUnit ?? "", "", l.issueUnit ?? "", "", l.unitLabel, blindCounts ? "" : String(l.systemQty), ""]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `StockCount_${(costCenterName || "sheet").replace(/[^a-z0-9]/gi, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function parseCsv(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length === 0) return [];
    const splitRow = (row: string) => row.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)!.map((c) => c.replace(/^,/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
    const header = splitRow(lines[0]);
    return lines.slice(1).map((row) => {
      const cells = splitRow(row);
      const obj: Record<string, string> = {};
      header.forEach((h, i) => (obj[h] = cells[i] ?? ""));
      return obj;
    });
  }

  function handleImportFile(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const rows = parseCsv(String(evt.target?.result ?? ""));
        let imported = 0;
        setLines((ls) => {
          const next = [...ls];
          for (const row of rows) {
            const code = row["Code"] ?? row["code"];
            const storageStr = row["Storage Qty"] ?? row["storage qty"];
            const ingredientStr = row["Ingredient Qty"] ?? row["ingredient qty"];
            const legacyQtyStr = row["Counted Qty"] ?? row["counted qty"];
            const hasBreakdown = (storageStr && storageStr !== "" && !Number.isNaN(Number(storageStr))) || (ingredientStr && ingredientStr !== "" && !Number.isNaN(Number(ingredientStr)));
            const hasLegacyQty = legacyQtyStr !== undefined && legacyQtyStr !== "" && !Number.isNaN(Number(legacyQtyStr));
            if (!code || (!hasBreakdown && !hasLegacyQty)) continue;
            const p = items.find((x) => x.legacyCode === code);
            if (!p) continue;
            const storageQty = hasBreakdown ? (storageStr && storageStr !== "" ? storageStr : "0") : "";
            const ingredientQty = hasBreakdown ? (ingredientStr && ingredientStr !== "" ? ingredientStr : "0") : "";
            const countedQty = hasBreakdown ? recomputeCountedQty(storageQty, ingredientQty, p.unitWeight, p.issueUnit) : legacyQtyStr;
            const existing = next.find((l) => l.stockItemId === p.id);
            if (existing) {
              existing.storageQty = storageQty;
              existing.ingredientQty = ingredientQty;
              existing.countedQty = countedQty;
            } else {
              next.push({ ...lineFor(p), storageQty, ingredientQty, countedQty });
            }
            imported++;
          }
          return next;
        });
        setInfo(`Imported ${imported} counted line(s) from the sheet.`);
      } catch {
        setError("Could not read that file — expecting the exported CSV format (Item, Code, Purchase Unit, Storage Qty, Ingredient Unit, Ingredient Qty, Unit, System Qty, Counted Qty).");
      }
    };
    reader.readAsText(file);
  }

  function buildInput() {
    return {
      branchId,
      costCenterId,
      countDate,
      lines: lines.map((l) => ({
        stockItemId: l.stockItemId,
        systemQty: l.systemQty,
        countedQty: l.countedQty === "" ? null : num(l.countedQty),
        storageQty: l.storageQty === "" ? null : num(l.storageQty),
        ingredientQty: l.ingredientQty === "" ? null : num(l.ingredientQty),
        unitLabel: l.unitLabel || undefined,
        rate: l.rate,
      })),
    };
  }

  function handleSubmit(status: "draft" | "posted") {
    setError(null);
    if (!branchId) return setError("Choose a branch.");
    if (!costCenterId) return setError("Choose a sector.");
    const input = buildInput();
    if (input.lines.length === 0) return setError("Add at least one item to the count.");
    if (status === "posted" && !input.lines.some((l) => l.countedQty != null)) return setError("Enter a counted quantity for at least one item before posting.");

    startTransition(async () => {
      const result = existingCountId
        ? await updateStockCountDraft(existingCountId, input)
        : status === "posted"
          ? await postStockCount(input)
          : await saveStockCountDraft(input);
      if (result.error) setError(result.error);
      else router.push(`/stock-count/${result.id}`);
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 1080 }}>
      <div className="panel-head">
        <h3>{existingCountId ? "Edit Draft Stock Count" : "New Stock Count"}</h3>
      </div>
      <div className="panel-body">
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>Branch</div>
          <div>Cost center</div>
          <div>Count date</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
          <select value={branchId} disabled={!!existingCountId} onChange={(e) => changeBranch(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
            {costCentersForBranch.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input type="date" value={countDate} max={todayStr()} onChange={(e) => setCountDate(e.target.value)} />
        </div>

        <div className="section-title">Items Counted</div>
        <div style={{ maxWidth: 480, marginBottom: 10 }}>
          <ScanInput placeholder="Scan an item barcode/QR to add it…" onScan={addLineByScan} autoFocus={false} />
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr auto", marginBottom: 10 }}>
          <ItemSearchSelect options={itemOptions} value={pickerId} onChange={setPickerId} placeholder="Search item…" />
          <button className="btn ghost" onClick={addLine}>+ Add item</button>
        </div>

        <div className="btn-row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <select value={templateId} onChange={(e) => loadTemplate(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">Load a template…</option>
            {templatesForCostCenter.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.stockItemIds.length})</option>
            ))}
          </select>
          {savingTemplate ? (
            <>
              <input
                type="text"
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                style={{ maxWidth: 180 }}
              />
              <button className="btn ghost" disabled={pending} onClick={saveAsTemplate}>Save</button>
              <button className="btn ghost" onClick={() => setSavingTemplate(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn ghost" onClick={() => setSavingTemplate(true)}>Save as Template</button>
          )}
          <button className="btn ghost" onClick={exportCsv}>Export Blank Sheet (CSV)</button>
          <button className="btn ghost" onClick={() => fileInputRef.current?.click()}>Import Filled Sheet</button>
          <button className="btn ghost" disabled={lines.length === 0} onClick={zeroUncounted}>Set Uncounted Items to Zero</button>
          {existingCountId && (
            <button className="btn ghost" disabled={pending} onClick={pullOthersCounts} title="Fetch items someone else added to this same draft since you opened it">
              🔄 Pull in Others&apos; Counts
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {blindCounts && (
          <div className="callout" style={{ marginBottom: 10 }}>
            Blind counting is on — System Qty and Variance are hidden while you count. They&apos;re still recorded and become visible once this count is posted.
          </div>
        )}

        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                {!blindCounts && <th className="right">System</th>}
                <th className="right">Storage Qty</th>
                <th className="right">Ingredient Qty</th>
                <th className="right">Total</th>
                <th>Unit</th>
                {!blindCounts && <th className="right">Variance</th>}
                {!blindCounts && <th className="right">Value</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.length ? (
                lines.map((l, i) => {
                  const variance = l.countedQty !== "" ? num(l.countedQty) - l.systemQty : null;
                  const varianceValue = variance != null ? variance * l.rate : null;
                  return (
                    <tr key={l.stockItemId}>
                      <td>
                        {l.name}
                        {l.countedByName && <span className="tag neutral" style={{ marginLeft: 6, fontSize: 9.5 }} title="Who last saved a count for this item">👤 {l.countedByName}</span>}
                      </td>
                      {!blindCounts && <td className="mono-r">{fmt(l.systemQty, 2)}</td>}
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          style={{ width: 70 }}
                          value={l.storageQty}
                          placeholder="—"
                          title={l.purchaseUnit ? `Whole/sealed units, e.g. unopened ${l.purchaseUnit}` : "Whole/sealed units"}
                          onChange={(e) => updateBreakdown(i, "storageQty", e.target.value)}
                        />
                        {l.purchaseUnit && <div style={{ fontSize: 9.5, color: "var(--ink-faint)" }}>{l.purchaseUnit}</div>}
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          style={{ width: 70 }}
                          value={l.ingredientQty}
                          placeholder="—"
                          title={l.issueUnit ? `Loose/opened qty already in ${l.issueUnit}` : "Loose/opened qty"}
                          onChange={(e) => updateBreakdown(i, "ingredientQty", e.target.value)}
                        />
                        {l.issueUnit && <div style={{ fontSize: 9.5, color: "var(--ink-faint)" }}>{l.issueUnit}</div>}
                      </td>
                      <td className="mono-r">{l.countedQty === "" ? "—" : fmt(num(l.countedQty), 3)}</td>
                      <td>{l.unitLabel}</td>
                      {!blindCounts && (
                        <td className="mono-r" style={{ color: variance == null ? undefined : variance === 0 ? undefined : variance > 0 ? "var(--good)" : "var(--bad)" }}>
                          {variance == null ? "—" : `${variance >= 0 ? "+" : ""}${fmt(variance, 2)}`}
                        </td>
                      )}
                      {!blindCounts && <td className="mono-r">{varianceValue == null ? "—" : money(varianceValue, 2)}</td>}
                      <td><button className="line-remove" onClick={() => removeLine(i)}>✕</button></td>
                    </tr>
                  );
                })
              ) : (
                <tr className="empty-row"><td colSpan={blindCounts ? 6 : 9}>No items added yet — use the dropdown above.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 11, color: "var(--ink-faint)", margin: "8px 0 16px" }}>
          {countedLines.length} of {lines.length} counted
        </div>

        <div className="field-row" style={{ fontSize: 14 }}>
          <span className="k"><b>Total Variance Value</b></span>
          <span className="v">{blindCounts ? "Hidden until submitted" : money(totalVariance, 2)}</span>
        </div>

        {info && <div className="callout" style={{ marginTop: 10 }}>{info}</div>}
        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          {existingCountId ? (
            <button className="btn accent" disabled={pending} onClick={() => handleSubmit("draft")}>
              {pending ? "Saving…" : "Save Changes"}
            </button>
          ) : (
            <>
              <button className="btn accent" disabled={pending} onClick={() => handleSubmit("posted")}>
                {pending ? "Posting…" : "Post & Adjust Stock"}
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

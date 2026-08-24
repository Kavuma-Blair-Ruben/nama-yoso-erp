"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postStockCount, saveStockCountDraft, updateStockCountDraft } from "@/server/actions/stockCount";
import { createStockCountTemplate } from "@/server/actions/stockCountTemplates";
import { fmt, money, todayStr, num } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";
import { ScanInput } from "@/components/ui/ScanInput";
import { extractProductCode } from "@/lib/scanCode";

type PickerItem = { id: string; legacyCode: string; name: string; issueUnit: string | null; ratePerKgL: number | null };
// countedQty is a raw string while editing ("" = not yet counted) — see num()
// in @/lib/format for why a number can't be stored straight back into the input.
type Line = { stockItemId: string; legacyCode: string; name: string; unitLabel: string; systemQty: number; countedQty: string; rate: number };
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

  function addLine() {
    const p = items.find((x) => x.id === pickerId);
    if (!p) return;
    if (lines.some((l) => l.stockItemId === p.id)) return;
    setLines((ls) => [...ls, { stockItemId: p.id, legacyCode: p.legacyCode, name: `${p.legacyCode} — ${p.name}`, unitLabel: canonicalUnitLabel(p.issueUnit), systemQty: availableFor(p.id), countedQty: "", rate: p.ratePerKgL ?? 0 }]);
  }
  function addLineByScan(scanned: string) {
    const code = extractProductCode(scanned).trim().toLowerCase();
    const p = items.find((x) => x.legacyCode.toLowerCase() === code);
    if (!p) return setError(`No item found with code "${extractProductCode(scanned)}".`);
    setError(null);
    if (lines.some((l) => l.stockItemId === p.id)) return setInfo(`${p.name} is already in this count.`);
    setInfo(null);
    setLines((ls) => [...ls, { stockItemId: p.id, legacyCode: p.legacyCode, name: `${p.legacyCode} — ${p.name}`, unitLabel: canonicalUnitLabel(p.issueUnit), systemQty: availableFor(p.id), countedQty: "", rate: p.ratePerKgL ?? 0 }]);
  }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }
  function zeroUncounted() {
    const n = lines.filter((l) => l.countedQty === "").length;
    setLines(lines.map((l) => (l.countedQty === "" ? { ...l, countedQty: "0" } : l)));
    setInfo(`Set ${n} uncounted item(s) to zero.`);
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
      next.push({ stockItemId: p.id, legacyCode: p.legacyCode, name: `${p.legacyCode} — ${p.name}`, unitLabel: canonicalUnitLabel(p.issueUnit), systemQty: availableFor(p.id), countedQty: "", rate: p.ratePerKgL ?? 0 });
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
    const header = ["Item", "Code", "Unit", "System Qty", "Counted Qty"];
    const rows = lines.map((l) => [l.name.replace(/^.*? — /, ""), l.legacyCode, l.unitLabel, blindCounts ? "" : String(l.systemQty), ""]);
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
            const qtyStr = row["Counted Qty"] ?? row["counted qty"];
            if (!code || qtyStr === undefined || qtyStr === "" || Number.isNaN(Number(qtyStr))) continue;
            const p = items.find((x) => x.legacyCode === code);
            if (!p) continue;
            const existing = next.find((l) => l.stockItemId === p.id);
            if (existing) existing.countedQty = qtyStr;
            else next.push({ stockItemId: p.id, legacyCode: p.legacyCode, name: `${p.legacyCode} — ${p.name}`, unitLabel: canonicalUnitLabel(p.issueUnit), systemQty: availableFor(p.id), countedQty: qtyStr, rate: p.ratePerKgL ?? 0 });
            imported++;
          }
          return next;
        });
        setInfo(`Imported ${imported} counted line(s) from the sheet.`);
      } catch {
        setError("Could not read that file — expecting the exported CSV format (Item, Code, Unit, System Qty, Counted Qty).");
      }
    };
    reader.readAsText(file);
  }

  function buildInput() {
    return {
      branchId,
      costCenterId,
      countDate,
      lines: lines.map((l) => ({ stockItemId: l.stockItemId, systemQty: l.systemQty, countedQty: l.countedQty === "" ? null : num(l.countedQty), unitLabel: l.unitLabel || undefined, rate: l.rate })),
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
          <select value={pickerId} onChange={(e) => setPickerId(e.target.value)} style={{ minWidth: 260 }}>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.legacyCode} — {it.name}</option>
            ))}
          </select>
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
                <th className="right">Counted</th>
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
                      <td>{l.name}</td>
                      {!blindCounts && <td className="mono-r">{fmt(l.systemQty, 2)}</td>}
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          style={{ width: 80 }}
                          value={l.countedQty}
                          placeholder="—"
                          onChange={(e) => updateLine(i, { countedQty: e.target.value })}
                        />
                      </td>
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
                <tr className="empty-row"><td colSpan={blindCounts ? 4 : 7}>No items added yet — use the dropdown above.</td></tr>
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

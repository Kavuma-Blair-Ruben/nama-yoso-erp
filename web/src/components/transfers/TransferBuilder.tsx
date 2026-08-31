"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendTransfer, saveTransferDraft, updateTransferDraft } from "@/server/actions/transfers";
import { money, todayStr, num } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";
import { ItemSearchSelect } from "@/components/ui/ItemSearchSelect";

type PickerItem = { id: string; legacyCode: string; name: string; issueUnit: string | null; ratePerKgL: number | null };
type CostCenter = { id: string; branchId: string; name: string };
// qty/rate are raw strings while editing — see num() in @/lib/format for why.
type Line = { stockItemId: string; unitLabel: string; qty: string; rate: string };

export function TransferBuilder({
  items,
  branches,
  costCenters,
  existingTransferId,
  initialFromBranchId,
  initialToBranchId,
  initialFromCostCenterId,
  initialToCostCenterId,
  initialTransferDate,
  initialStaffName,
  initialNotes,
  initialLines,
}: {
  items: PickerItem[];
  branches: { id: string; name: string }[];
  costCenters: CostCenter[];
  existingTransferId?: string;
  initialFromBranchId?: string;
  initialToBranchId?: string;
  initialFromCostCenterId?: string;
  initialToCostCenterId?: string;
  initialTransferDate?: string;
  initialStaffName?: string;
  initialNotes?: string;
  initialLines?: Line[];
}) {
  const router = useRouter();
  const itemOptions = useMemo(() => items.map((it) => ({ value: it.id, code: it.legacyCode, label: it.name })), [items]);
  const [fromBranchId, setFromBranchId] = useState(initialFromBranchId ?? branches[0]?.id ?? "");
  const [toBranchId, setToBranchId] = useState(initialToBranchId ?? branches[1]?.id ?? branches[0]?.id ?? "");
  const fromCostCentersForBranch = costCenters.filter((c) => c.branchId === fromBranchId);
  const toCostCentersForBranch = costCenters.filter((c) => c.branchId === toBranchId);
  const [fromCostCenterId, setFromCostCenterId] = useState(initialFromCostCenterId ?? fromCostCentersForBranch[0]?.id ?? "");
  const [toCostCenterId, setToCostCenterId] = useState(initialToCostCenterId ?? toCostCentersForBranch[0]?.id ?? "");
  function changeFromBranch(newBranchId: string) {
    setFromBranchId(newBranchId);
    const stillValid = costCenters.some((c) => c.branchId === newBranchId && c.id === fromCostCenterId);
    if (!stillValid) setFromCostCenterId(costCenters.find((c) => c.branchId === newBranchId)?.id ?? "");
  }
  function changeToBranch(newBranchId: string) {
    setToBranchId(newBranchId);
    const stillValid = costCenters.some((c) => c.branchId === newBranchId && c.id === toCostCenterId);
    if (!stillValid) setToCostCenterId(costCenters.find((c) => c.branchId === newBranchId)?.id ?? "");
  }
  const [transferDate, setTransferDate] = useState(initialTransferDate ?? todayStr());
  const [staffName, setStaffName] = useState(initialStaffName ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [lines, setLines] = useState<Line[]>(initialLines ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addLine() {
    const p = items[0];
    if (!p) return;
    setLines((ls) => [...ls, { stockItemId: p.id, unitLabel: canonicalUnitLabel(p.issueUnit), qty: "0", rate: String(p.ratePerKgL ?? 0) }]);
  }
  function updateLineItem(i: number, stockItemId: string) {
    const p = items.find((x) => x.id === stockItemId);
    if (!p) return;
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, stockItemId: p.id, unitLabel: canonicalUnitLabel(p.issueUnit), rate: String(p.ratePerKgL ?? 0) } : l)));
  }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  const totalValue = lines.reduce((s, l) => s + num(l.qty) * num(l.rate), 0);

  function buildInput() {
    return {
      fromBranchId,
      toBranchId,
      fromCostCenterId,
      toCostCenterId,
      transferDate,
      staffName: staffName || undefined,
      notes: notes || undefined,
      lines: lines.filter((l) => num(l.qty) > 0).map((l) => ({ stockItemId: l.stockItemId, qty: num(l.qty), unitLabel: l.unitLabel || undefined, rate: num(l.rate) })),
    };
  }

  function handleSubmit(status: "draft" | "sent") {
    setError(null);
    if (fromBranchId === toBranchId) return setError("From and To branch must be different.");
    if (!fromCostCenterId || !toCostCenterId) return setError("Choose a sector on both sides.");
    const input = buildInput();
    if (input.lines.length === 0) return setError("Add at least one item with a quantity.");

    startTransition(async () => {
      const result = existingTransferId
        ? await updateTransferDraft(existingTransferId, input)
        : status === "sent"
          ? await sendTransfer(input)
          : await saveTransferDraft(input);
      if (result.error) setError(result.error);
      else router.push(`/transfers/${result.id}`);
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 1040 }}>
      <div className="panel-head">
        <h3>{existingTransferId ? "Edit Draft Stock Transfer" : "New Stock Transfer"}</h3>
      </div>
      <div className="panel-body">
        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>From</div>
          <div>To</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 4 }}>
          <select value={fromBranchId} onChange={(e) => changeFromBranch(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select value={toBranchId} onChange={(e) => changeToBranch(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
          <select value={fromCostCenterId} onChange={(e) => setFromCostCenterId(e.target.value)}>
            {fromCostCentersForBranch.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={toCostCenterId} onChange={(e) => setToCostCenterId(e.target.value)}>
            {toCostCentersForBranch.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Date</div>
          <div>Staff</div>
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
          <input type="date" value={transferDate} max={todayStr()} onChange={(e) => setTransferDate(e.target.value)} />
          <input type="text" value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Staff name" />
        </div>

        <div className="section-title">Items</div>
        <div className="table-wrap" style={{ maxHeight: 400 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th className="right">Qty</th>
                <th>Unit</th>
                <th className="right">Rate</th>
                <th className="right">Value</th>
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
                    <td><input type="text" inputMode="decimal" style={{ width: 80 }} value={l.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} /></td>
                    <td className="mono-r">{money(num(l.qty) * num(l.rate), 2)}</td>
                    <td><button className="line-remove" onClick={() => removeLine(i)}>✕</button></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No items added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <button className="btn ghost" style={{ margin: "10px 0 16px" }} onClick={addLine}>+ Add item</button>

        <div className="form-row">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Estimated Value</b></span><span className="v">{money(totalValue, 2)}</span></div>

        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          {existingTransferId ? (
            <button className="btn accent" disabled={pending} onClick={() => handleSubmit("draft")}>
              {pending ? "Saving…" : "Save Changes"}
            </button>
          ) : (
            <>
              <button className="btn accent" disabled={pending} onClick={() => handleSubmit("sent")}>
                {pending ? "Sending…" : "Send Transfer"}
              </button>
              <button className="btn ghost" disabled={pending} onClick={() => handleSubmit("draft")}>
                Save as Draft
              </button>
            </>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 8 }}>
          Sending deducts stock from the source branch immediately. The destination branch isn&apos;t credited until someone
          confirms receipt on the transfer&apos;s page.
        </div>
      </div>
    </div>
  );
}

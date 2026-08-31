"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postGRN, saveGrnDraft, updateGrnDraft, uploadGrnInvoice, deleteGrnInvoice } from "@/server/actions/grn";
import { extractGrnInvoice, type ExtractedInvoice } from "@/server/actions/invoiceOcr";
import { InvoicePreview } from "@/components/ui/InvoicePreview";
import { ScanInput } from "@/components/ui/ScanInput";
import { fmt, money, todayStr, num } from "@/lib/format";
import { bestTextMatch } from "@/lib/textMatch";
import { extractProductCode } from "@/lib/scanCode";
import { ItemSearchSelect } from "@/components/ui/ItemSearchSelect";

type Product = { id: string; legacyCode: string; name: string; purchaseUnit: string | null; purchaseRate: number | null };
type CostCenter = { id: string; branchId: string; name: string };

type Line = {
  stockItemId: string;
  purchaseOrderLineId: string | null;
  name: string;
  unitLabel: string;
  orderedQty: number | null;
  alreadyReceived: number;
  receivedQty: number;
  rate: number;
  discountPct: number;
  taxRate: number;
  isFoc: boolean;
  expiryDate: string;
  condition: "ACCEPTED" | "DAMAGED" | "REJECTED";
  // The item's live master rate (stock_items.purchase_rate) as of page load —
  // compared against the typed rate to flag a price change. Never itself edited.
  currentRate?: number | null;
};

// Editable numeric fields are kept as raw strings while the line is being
// edited — e.g. "2." while the user is still typing "2.5" — and only parsed
// to a number where a value is actually needed (totals, submission). Storing
// the parsed Number() straight back into a controlled input's value strips
// an in-progress decimal point on every keystroke (Number("2.") === 2), so a
// number-typed field can never actually reach "2.5" one character at a time.
type EditLine = Omit<Line, "receivedQty" | "rate" | "discountPct" | "taxRate"> & {
  receivedQty: string;
  rate: string;
  discountPct: string;
  taxRate: string;
  // Whether a detected price change should be written back to the item's
  // master rate (stock_items.purchase_rate + price_history) on submit —
  // defaults on so existing behavior doesn't silently change, but it's now
  // visible and the user can opt a specific line out (e.g. a one-off rush
  // surcharge that shouldn't become the new standard cost).
  updatePrice: boolean;
  // Set only on lines populated by AI invoice extraction that couldn't be
  // confidently matched to a catalog item — flags the row for a manual
  // product pick instead of silently defaulting to whatever items[0] is.
  unmatchedFromOcr?: boolean;
};

function toEditLine(l: Line): EditLine {
  return { ...l, receivedQty: String(l.receivedQty), rate: String(l.rate), discountPct: String(l.discountPct), taxRate: String(l.taxRate), updatePrice: true };
}

function lineAmount(l: EditLine) {
  if (l.isFoc) return 0;
  return num(l.receivedQty) * num(l.rate) * (1 - num(l.discountPct) / 100);
}

export function GRNBuilder({
  mode,
  poId,
  poNumber,
  supplierId,
  supplierName,
  branchId,
  costCenterName,
  initialLines,
  suppliers,
  products,
  branches,
  costCenters,
  initialCostCenterId,
  existingGrnId,
  initialInvoiceNumber,
  initialReceivedDate,
  initialInvoiceDueDate,
  initialAttachmentUrl,
  initialDocumentType,
  cashSupplierId,
  initialPaymentMethod,
}: {
  mode: "po" | "direct";
  poId: string | null;
  poNumber?: string;
  supplierId?: string;
  supplierName?: string;
  branchId?: string;
  // mode "po" only — the LPO's own sector, shown read-only.
  costCenterName?: string;
  initialLines: Line[];
  suppliers: { id: string; name: string }[];
  products: Product[];
  branches?: { id: string; name: string }[];
  // mode "direct" only — the sector picker's options.
  costCenters: CostCenter[];
  initialCostCenterId?: string;
  existingGrnId?: string;
  initialInvoiceNumber?: string;
  initialReceivedDate?: string;
  initialInvoiceDueDate?: string;
  initialAttachmentUrl?: string;
  initialDocumentType?: "TAX_INVOICE" | "DELIVERY_NOTE" | "";
  // mode "direct" only — the resolved id of the shared "Petty Cash" system
  // supplier, auto-used (in place of a real supplier pick) when Payment
  // Method is set to Petty Cash.
  cashSupplierId?: string;
  initialPaymentMethod?: "INVOICE" | "PETTY_CASH";
}) {
  const router = useRouter();
  const productOptions = useMemo(() => products.map((p) => ({ value: p.id, code: p.legacyCode, label: p.name })), [products]);
  const [lines, setLines] = useState<EditLine[]>(() => initialLines.map(toEditLine));
  const [paymentMethod, setPaymentMethod] = useState<"INVOICE" | "PETTY_CASH">(initialPaymentMethod ?? "INVOICE");
  const [directSupplierId, setDirectSupplierId] = useState(
    paymentMethod === "PETTY_CASH" ? cashSupplierId ?? "" : supplierId ?? suppliers[0]?.id ?? ""
  );
  function changePaymentMethod(next: "INVOICE" | "PETTY_CASH") {
    setPaymentMethod(next);
    if (next === "PETTY_CASH") {
      if (cashSupplierId) setDirectSupplierId(cashSupplierId);
    } else if (directSupplierId === cashSupplierId) {
      setDirectSupplierId(suppliers[0]?.id ?? "");
    }
  }
  const [directBranchId, setDirectBranchId] = useState(branchId ?? branches?.[0]?.id ?? "");
  const directCostCentersForBranch = costCenters.filter((c) => c.branchId === directBranchId);
  const [directCostCenterId, setDirectCostCenterId] = useState(initialCostCenterId ?? directCostCentersForBranch[0]?.id ?? "");
  function changeDirectBranch(newBranchId: string) {
    setDirectBranchId(newBranchId);
    const stillValid = costCenters.some((c) => c.branchId === newBranchId && c.id === directCostCenterId);
    if (!stillValid) setDirectCostCenterId(costCenters.find((c) => c.branchId === newBranchId)?.id ?? "");
  }
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoiceNumber ?? "");
  const [receivedDate, setReceivedDate] = useState(initialReceivedDate ?? todayStr());
  const [invoiceDueDate, setInvoiceDueDate] = useState(initialInvoiceDueDate ?? "");
  const [documentType, setDocumentType] = useState<"TAX_INVOICE" | "DELIVERY_NOTE" | "">(initialDocumentType ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState(initialAttachmentUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploadPending, startUploadTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [ocrPending, startOcrTransition] = useTransition();
  const [ocrSummary, setOcrSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleDeleteInvoice() {
    const oldUrl = attachmentUrl;
    setAttachmentUrl("");
    startDeleteTransition(async () => {
      const result = await deleteGrnInvoice(oldUrl);
      if (result.error) setError(result.error);
    });
  }

  function handleInvoiceFileChange() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("invoice", file);
    startUploadTransition(async () => {
      const result = await uploadGrnInvoice(fd);
      if (result.error) setError(result.error);
      else if (result.url) setAttachmentUrl(result.url);
    });
  }

  function applyExtractedInvoice(data: ExtractedInvoice) {
    if (data.supplierName) {
      const matchedSupplier = bestTextMatch(data.supplierName, suppliers, (s) => s.name);
      if (matchedSupplier) setDirectSupplierId(matchedSupplier.id);
    }
    if (data.invoiceNumber && !invoiceNumber) setInvoiceNumber(data.invoiceNumber);

    let matchedCount = 0;
    const newLines: EditLine[] = data.lines.map((el) => {
      const p = bestTextMatch(el.description, products, (x) => x.name);
      if (p) matchedCount++;
      const chosen = p ?? products[0];
      return {
        stockItemId: chosen?.id ?? "",
        purchaseOrderLineId: null,
        name: chosen?.name ?? el.description,
        unitLabel: el.unitLabel || chosen?.purchaseUnit || "",
        orderedQty: null,
        alreadyReceived: 0,
        receivedQty: String(el.qty),
        rate: String(el.rate || chosen?.purchaseRate || 0),
        discountPct: "0",
        taxRate: String(el.taxRatePct),
        isFoc: false,
        expiryDate: "",
        condition: "ACCEPTED",
        currentRate: chosen?.purchaseRate,
        updatePrice: true,
        unmatchedFromOcr: !p,
      };
    });
    setLines(newLines);
    const unmatchedCount = data.lines.length - matchedCount;
    setOcrSummary(
      `Extracted ${data.lines.length} item(s) from the invoice — ${matchedCount} matched automatically` +
        (unmatchedCount > 0 ? `, ${unmatchedCount} need manual selection (marked "no match").` : ".")
    );
  }

  function handleExtractInvoice() {
    if (!attachmentUrl) return;
    setError(null);
    setOcrSummary(null);
    startOcrTransition(async () => {
      const result = await extractGrnInvoice(attachmentUrl);
      if (result.error) setError(result.error);
      else if (result.data) applyExtractedInvoice(result.data);
    });
  }

  function updateLine(i: number, patch: Partial<EditLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addDirectLine() {
    const p = products[0];
    if (!p) return;
    setLines((ls) => [
      ...ls,
      {
        stockItemId: p.id,
        purchaseOrderLineId: null,
        name: p.name,
        unitLabel: p.purchaseUnit ?? "",
        orderedQty: null,
        alreadyReceived: 0,
        receivedQty: "0",
        rate: String(p.purchaseRate ?? 0),
        discountPct: "0",
        taxRate: "5",
        isFoc: false,
        expiryDate: "",
        condition: "ACCEPTED",
        currentRate: p.purchaseRate,
        updatePrice: true,
      },
    ]);
  }
  function updateDirectProduct(i: number, stockItemId: string) {
    const p = products.find((x) => x.id === stockItemId);
    if (!p) return;
    updateLine(i, { stockItemId: p.id, name: p.name, unitLabel: p.purchaseUnit ?? "", rate: String(p.purchaseRate ?? 0), currentRate: p.purchaseRate, updatePrice: true, unmatchedFromOcr: false });
  }
  function addDirectLineByScan(scanned: string) {
    const code = extractProductCode(scanned).trim().toLowerCase();
    const p = products.find((x) => x.legacyCode.toLowerCase() === code);
    if (!p) return setError(`No item found with code "${extractProductCode(scanned)}".`);
    setError(null);
    setLines((ls) => [
      ...ls,
      {
        stockItemId: p.id,
        purchaseOrderLineId: null,
        name: p.name,
        unitLabel: p.purchaseUnit ?? "",
        orderedQty: null,
        alreadyReceived: 0,
        receivedQty: "0",
        rate: String(p.purchaseRate ?? 0),
        discountPct: "0",
        taxRate: "5",
        isFoc: false,
        expiryDate: "",
        condition: "ACCEPTED",
        currentRate: p.purchaseRate,
        updatePrice: true,
      },
    ]);
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  const grossBeforeDiscount = lines.reduce((s, l) => s + (l.isFoc ? 0 : num(l.receivedQty) * num(l.rate)), 0);
  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);
  const discountTotal = grossBeforeDiscount - subtotal;
  const taxAmount = lines.reduce((s, l) => s + lineAmount(l) * (num(l.taxRate) / 100), 0);
  const total = subtotal + taxAmount;

  function buildInput() {
    const resolvedSupplierId = mode === "po" ? supplierId! : directSupplierId;
    return {
      purchaseOrderId: poId,
      supplierId: resolvedSupplierId,
      branchId: mode === "po" ? branchId ?? "" : directBranchId,
      costCenterId: mode === "direct" ? directCostCenterId : undefined,
      receivedDate,
      invoiceNumber,
      invoiceDueDate,
      documentType: documentType || undefined,
      attachmentUrl,
      paymentMethod: mode === "direct" ? paymentMethod : "INVOICE",
      lines: lines
        .filter((l) => num(l.receivedQty) > 0 || l.isFoc)
        .map((l) => ({
          stockItemId: l.stockItemId,
          purchaseOrderLineId: l.purchaseOrderLineId,
          unitLabel: l.unitLabel,
          orderedQty: l.orderedQty,
          receivedQty: num(l.receivedQty),
          rate: num(l.rate),
          discountPct: num(l.discountPct),
          taxRate: num(l.taxRate),
          isFoc: l.isFoc,
          expiryDate: l.expiryDate || undefined,
          condition: l.condition,
          updatePrice: l.updatePrice,
        })),
    };
  }

  function handleSubmit(status: "draft" | "posted") {
    setError(null);
    if (mode === "direct" && !directSupplierId) {
      setError("Choose a supplier for this direct GRN.");
      return;
    }
    if (mode === "direct" && !directCostCenterId) {
      setError("Choose a sector for this direct GRN.");
      return;
    }
    const input = buildInput();
    if (input.lines.length === 0) {
      setError("Enter a received quantity for at least one item.");
      return;
    }
    startTransition(async () => {
      const result = existingGrnId
        ? await updateGrnDraft(existingGrnId, input)
        : status === "posted"
          ? await postGRN(input)
          : await saveGrnDraft(input);
      if (result.error) setError(result.error);
      else router.push(result.warning ? `/grn/${result.id}?warning=${encodeURIComponent(result.warning)}` : `/grn/${result.id}`);
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 1160 }}>
      <div className="panel-head">
        <h3>{existingGrnId ? "Edit Draft GRN" : mode === "po" ? `Receive Stock — ${poNumber}` : "Receive Stock — Direct GRN (no LPO)"}</h3>
      </div>
      <div className="panel-body">
        {mode === "direct" && (
          <>
            <div className="callout">No Purchase Order behind this receipt — use this when stock genuinely arrived without one.</div>
            <div className="form-row">
              <label>Payment Method</label>
              <div className="pill-tabs" style={{ marginTop: 4 }}>
                <button type="button" className={`btn ${paymentMethod === "INVOICE" ? "" : "ghost"}`} style={{ borderRadius: 20 }} onClick={() => changePaymentMethod("INVOICE")}>
                  Supplier Invoice
                </button>
                <button type="button" className={`btn ${paymentMethod === "PETTY_CASH" ? "" : "ghost"}`} style={{ borderRadius: 20 }} onClick={() => changePaymentMethod("PETTY_CASH")}>
                  Petty Cash
                </button>
              </div>
              {paymentMethod === "PETTY_CASH" && (
                <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>
                  For an informal cash purchase with no formal supplier invoice — a receipt photo is optional, and this is marked paid immediately.
                </div>
              )}
            </div>
            <div className="line-builder-row head" style={{ gridTemplateColumns: paymentMethod === "PETTY_CASH" ? "1fr 1fr" : "1fr 1fr 1fr" }}>
              {paymentMethod === "INVOICE" && <div>Supplier</div>}
              <div>Receiving branch</div>
              <div>Sector</div>
            </div>
            <div className="line-builder-row" style={{ gridTemplateColumns: paymentMethod === "PETTY_CASH" ? "1fr 1fr" : "1fr 1fr 1fr", marginBottom: 10 }}>
              {paymentMethod === "INVOICE" && (
                <select value={directSupplierId} onChange={(e) => setDirectSupplierId(e.target.value)}>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              <select value={directBranchId} onChange={(e) => changeDirectBranch(e.target.value)}>
                {(branches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select value={directCostCenterId} onChange={(e) => setDirectCostCenterId(e.target.value)}>
                {directCostCentersForBranch.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </>
        )}
        {mode === "po" && (
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
            {supplierName}
            {costCenterName && <> · Sector: <b>{costCenterName}</b></>}
          </div>
        )}

        {!(mode === "direct" && paymentMethod === "PETTY_CASH") && (
          <>
            <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
              <div>Document type</div>
              <div>Supplier invoice / document number</div>
              <div>Received date</div>
              <div>Invoice due date</div>
            </div>
            <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr", marginBottom: 10 }}>
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value as "TAX_INVOICE" | "DELIVERY_NOTE" | "")}>
                <option value="">Unspecified</option>
                <option value="TAX_INVOICE">Tax Invoice</option>
                <option value="DELIVERY_NOTE">Delivery Note</option>
              </select>
              <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Number printed on the document..." />
              <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
              <input type="date" value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} />
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: -6, marginBottom: 10 }}>
              Use the exact number printed on the supplier&apos;s document — this is what shows on the printed GRN and in AP reconciliation, not a system-generated number.
            </div>
          </>
        )}
        {mode === "direct" && paymentMethod === "PETTY_CASH" && (
          <div className="form-row">
            <label>Received date</label>
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </div>
        )}
        <div className="form-row">
          <label>
            {mode === "direct" && paymentMethod === "PETTY_CASH" ? "Receipt photo — optional" : "Supplier invoice — upload or scan (required to post)"}
          </label>
          {attachmentUrl ? (
            <div>
              <InvoicePreview url={attachmentUrl} />
              <button type="button" className="btn ghost" disabled={deletePending} onClick={handleDeleteInvoice}>
                {deletePending ? "Removing…" : "🗑 Delete & Upload Different File"}
              </button>
            </div>
          ) : (
            <>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleInvoiceFileChange} disabled={uploadPending} />
              {uploadPending && <span style={{ fontSize: 11.5, marginLeft: 8, color: "var(--ink-soft)" }}>Uploading…</span>}
            </>
          )}
          <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>
            {mode === "direct" && paymentMethod === "PETTY_CASH"
              ? "A cash receipt has no formal invoice — this is optional, but attach a photo if you have one."
              : "A photo or scan of the physical/emailed invoice. A GRN cannot be posted (stock updated) without one."}
          </div>
          {mode === "direct" && attachmentUrl && (
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn ghost" disabled={ocrPending} onClick={handleExtractInvoice}>
                {ocrPending ? "Reading invoice…" : "✨ Extract Items with AI"}
              </button>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>
                Reads the uploaded file and fills in the items below — always review before posting. Replaces the current item list.
              </div>
              {ocrSummary && <div className="callout" style={{ marginTop: 8 }}>{ocrSummary}</div>}
            </div>
          )}
        </div>

        <div className="section-title">Items</div>
        <div className="callout">Batch and lot numbers are generated automatically on save. Edit the price if it differs from the LPO, apply a discount, adjust tax per item, or mark a line Free of Charge (FOC).</div>
        {mode === "direct" && (
          <div style={{ maxWidth: 480, marginBottom: 10 }}>
            <ScanInput placeholder="Scan an item barcode/QR to add it…" onScan={addDirectLineByScan} autoFocus={false} />
          </div>
        )}
        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Description</th>
                <th className="right">Ordered</th>
                <th className="right">Received</th>
                <th className="right">Price</th>
                <th className="right">Disc %</th>
                <th className="right">Tax %</th>
                <th>FOC</th>
                <th>Expiry</th>
                <th>Condition</th>
                <th className="right">Amount</th>
                {mode === "direct" && <th></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    {mode === "direct" ? (
                      <>
                        <div style={{ minWidth: 220 }}>
                          <ItemSearchSelect options={productOptions} value={l.stockItemId} onChange={(v) => updateDirectProduct(i, v)} placeholder="Search item…" />
                        </div>
                        {l.unmatchedFromOcr && (
                          <div style={{ fontSize: 10, color: "var(--bad)", marginTop: 3 }}>⚠ no confident match — check this item</div>
                        )}
                      </>
                    ) : (
                      <>
                        {l.name}
                        <div style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>already received: {fmt(l.alreadyReceived, 2)} {l.unitLabel}</div>
                      </>
                    )}
                  </td>
                  <td className="mono-r">{mode === "direct" ? "—" : fmt(l.orderedQty, 2)}</td>
                  <td>
                    <input type="text" inputMode="decimal" style={{ width: 70 }} value={l.receivedQty} onChange={(e) => updateLine(i, { receivedQty: e.target.value })} />
                  </td>
                  <td>
                    <input type="text" inputMode="decimal" style={{ width: 70 }} value={l.rate} disabled={l.isFoc} onChange={(e) => updateLine(i, { rate: e.target.value })} />
                    {l.currentRate != null && !l.isFoc && num(l.rate) !== l.currentRate && (
                      <div style={{ fontSize: 10, color: "var(--accent)", marginTop: 3, whiteSpace: "nowrap" }}>
                        <div>was {fmt(l.currentRate, 2)}</div>
                        <label style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontWeight: 600 }}>
                          <input type="checkbox" checked={l.updatePrice} onChange={(e) => updateLine(i, { updatePrice: e.target.checked })} style={{ margin: 0 }} />
                          update price
                        </label>
                      </div>
                    )}
                  </td>
                  <td>
                    <input type="text" inputMode="decimal" style={{ width: 60 }} value={l.discountPct} disabled={l.isFoc} onChange={(e) => updateLine(i, { discountPct: e.target.value })} />
                  </td>
                  <td>
                    <input type="text" inputMode="decimal" style={{ width: 50 }} value={l.taxRate} onChange={(e) => updateLine(i, { taxRate: e.target.value })} />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={l.isFoc} onChange={(e) => updateLine(i, { isFoc: e.target.checked })} />
                  </td>
                  <td>
                    <input type="date" style={{ width: 140 }} value={l.expiryDate} onChange={(e) => updateLine(i, { expiryDate: e.target.value })} />
                  </td>
                  <td>
                    <select value={l.condition} onChange={(e) => updateLine(i, { condition: e.target.value as Line["condition"] })}>
                      <option value="ACCEPTED">ACCEPTED</option>
                      <option value="DAMAGED">DAMAGED</option>
                      <option value="REJECTED">REJECTED</option>
                    </select>
                  </td>
                  <td className="mono-r">{fmt(lineAmount(l), 2)}</td>
                  {mode === "direct" && (
                    <td>
                      <button className="line-remove" onClick={() => removeLine(i)}>✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mode === "direct" && (
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={addDirectLine}>
            + Add item
          </button>
        )}

        <div style={{ height: 14 }} />
        <div className="field-row"><span className="k">Subtotal</span><span className="v tabular">{fmt(grossBeforeDiscount, 2)}</span></div>
        {discountTotal > 0 && (
          <div className="field-row"><span className="k">Discount</span><span className="v tabular">-{fmt(discountTotal, 2)}</span></div>
        )}
        <div className="field-row"><span className="k">Tax Amount</span><span className="v tabular">{fmt(taxAmount, 2)}</span></div>
        <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Total</b></span><span className="v">{money(total, 2)}</span></div>

        {error && <div className="login-error">{error}</div>}
        <div className="btn-row">
          {existingGrnId ? (
            <button className="btn accent" disabled={pending} onClick={() => handleSubmit("draft")}>
              {pending ? "Saving…" : "Save Changes"}
            </button>
          ) : (
            <>
              <button className="btn accent" disabled={pending} onClick={() => handleSubmit("posted")}>
                {pending ? "Saving…" : "Confirm Receipt (Update Stock)"}
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

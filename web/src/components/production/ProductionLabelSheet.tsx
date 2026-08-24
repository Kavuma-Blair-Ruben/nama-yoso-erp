"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { fmt } from "@/lib/format";

export type Batch = {
  id: string;
  batchNo: string;
  lotNo: string;
  name: string;
  legacyCode: string;
  scaleMultiplier: number;
  yieldQty: number;
  yieldUnit: string | null;
  producedDate: string;
  expiryDate: string | null;
  storageInstructions: string | null;
  branchName: string | null;
  staffName?: string | null;
};

// Matches index.html's "Receipt of Production" ticket format from its old
// Odoo system: header, item + unit count, a scannable receipt number,
// batch/lot, expiration, storage instructions, and where it was made.
export function ProductionReceipt({ batch }: { batch: Batch }) {
  const ref = useRef<SVGSVGElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    setTimeStr(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
  }, []);

  useEffect(() => {
    if (ref.current) {
      JsBarcode(ref.current, batch.lotNo, { format: "CODE128", displayValue: false, width: 1.4, height: 36, margin: 0 });
    }
  }, [batch.lotNo]);

  useEffect(() => {
    const url = `${window.location.origin}/lots/${encodeURIComponent(batch.lotNo)}`;
    QRCode.toDataURL(url, { width: 64, margin: 0 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [batch.lotNo]);

  const perBatchQty = batch.scaleMultiplier ? batch.yieldQty / batch.scaleMultiplier : batch.yieldQty;

  return (
    <div className="receipt-card">
      <div className="rtitle">RECEIPT OF PRODUCTION</div>
      <div className="rmeta">{batch.producedDate} {timeStr}</div>
      <div className="rname">{batch.name} — {fmt(batch.yieldQty, 0)} {batch.yieldUnit || "Unit(s)"}</div>
      <div className="rsub">{fmt(batch.scaleMultiplier, 2)} batch(es) × {fmt(perBatchQty, 2)} {batch.yieldUnit ?? ""} per batch</div>
      <div className="rscan">-- SCAN TO SEE RECORD --</div>
      <div className="rcode">
        <svg ref={ref} />
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="Scan for batch details" width={56} height={56} />
        )}
        <div className="rnum">{batch.batchNo}</div>
      </div>
      <div className="lrow"><span>BATCH SIZE</span><span>{fmt(perBatchQty, 2)} {batch.yieldUnit ?? ""} / batch</span></div>
      <div className="lrow"><span>BATCHES PRODUCED</span><span>{fmt(batch.scaleMultiplier, 2)}</span></div>
      <div className="lrow"><span>TOTAL YIELD</span><span>{fmt(batch.yieldQty, 2)} {batch.yieldUnit ?? ""}</span></div>
      <div style={{ height: 6 }} />
      <div className="lrow"><span>LOT #</span><span>{batch.lotNo || "-"}</span></div>
      <div className="lrow"><span>EXPIRATION DATE</span><span>{batch.expiryDate || "-"}</span></div>
      <div className="lrow"><span>STAFF</span><span>{batch.staffName || "-"}</span></div>
      <div style={{ height: 6 }} />
      <div className="lrow"><span>STORAGE</span><span>{batch.storageInstructions || "-"}</span></div>
      <div className="rfoot">MADE IN {(batch.branchName || "NAMAYOSO").toUpperCase()}</div>
    </div>
  );
}

// Copies default to 1 (most batches need just one receipt), but a batch/lot
// that stays OPEN through an ongoing vacuum-sealing run needs to reprint
// this same lot's ticket for every pack sealed — same lot/batch number on
// every copy, since it's still one production run, not a new batch each time.
export function ProductionLabelSheet({ batch }: { batch: Batch }) {
  const [copies, setCopies] = useState(1);

  return (
    <>
      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12.5, fontWeight: 600 }}>Copies</label>
        <input
          type="number"
          min={1}
          max={200}
          value={copies}
          onChange={(e) => setCopies(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
          style={{ width: 80 }}
        />
        <button className="btn accent" onClick={() => window.print()}>Print Receipt{copies > 1 ? `s (${copies})` : ""}</button>
        <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
          Barcode/QR encode the lot number — scan to open its traceability page. Print more copies anytime while this ticket is still
          open, e.g. one per vacuum-sealed pack under the same lot.
        </span>
      </div>
      <div className="receipt-sheet">
        {Array.from({ length: copies }).map((_, i) => (
          <ProductionReceipt key={i} batch={batch} />
        ))}
      </div>
    </>
  );
}

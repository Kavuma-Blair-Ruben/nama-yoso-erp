"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { fmt } from "@/lib/format";

export type Line = {
  id: string;
  name: string;
  legacyCode: string;
  unitLabel: string | null;
  receivedQty: number;
  batchNo: string | null;
  lotNo: string | null;
  expiryDate: string | null;
  condition: string;
};

export function LotLabel({ line }: { line: Line }) {
  const ref = useRef<SVGSVGElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (ref.current && line.lotNo) {
      JsBarcode(ref.current, line.lotNo, { format: "CODE128", displayValue: false, width: 1.2, height: 26, margin: 0 });
    }
  }, [line.lotNo]);

  useEffect(() => {
    if (!line.lotNo) return;
    const url = `${window.location.origin}/lots/${encodeURIComponent(line.lotNo)}`;
    QRCode.toDataURL(url, { width: 100, margin: 0 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [line.lotNo]);

  return (
    <div className="label-cell" style={{ height: "auto", minHeight: "38mm", gap: 1 }}>
      <div className="label-name">{line.name}</div>
      <div style={{ fontSize: 9, color: "var(--ink-soft)" }}>{line.legacyCode}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg ref={ref} style={{ flex: 1, minWidth: 0 }} />
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="Scan for batch details" width={28} height={28} style={{ flex: "none" }} />
        )}
      </div>
      <div className="label-code">Batch {line.batchNo ?? "-"} · Lot {line.lotNo ?? "-"}</div>
      <div className="label-code" style={{ fontWeight: 700 }}>Exp: {line.expiryDate ?? "N/A"}</div>
      <div className="label-code">{fmt(line.receivedQty, 2)} {line.unitLabel ?? ""} · {line.condition}</div>
    </div>
  );
}

const LABEL_SIZES = {
  sheet: null,
  "50x30": { width: "50mm", height: "30mm" },
  "50x40": { width: "50mm", height: "40mm" },
  "4x6": { width: "4in", height: "6in" },
} as const;
type PrintMode = keyof typeof LABEL_SIZES;

export function LotLabelSheet({ lines }: { lines: Line[] }) {
  const [printMode, setPrintMode] = useState<PrintMode>("sheet");
  const rollSize = LABEL_SIZES[printMode];

  return (
    <>
      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12.5, fontWeight: 600 }}>Printer</label>
        <select value={printMode} onChange={(e) => setPrintMode(e.target.value as PrintMode)} style={{ width: 220 }}>
          <option value="sheet">Office printer (multi-up sheet)</option>
          <option value="50x30">Label/sticker printer — 50×30mm</option>
          <option value="50x40">Label/sticker printer — 50×40mm</option>
          <option value="4x6">Label/sticker printer — 4×6in</option>
        </select>
        <button className="btn accent" onClick={() => window.print()}>Print Labels</button>
        <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>One label per received line — barcode encodes the lot number, QR code opens its traceability page.</span>
      </div>
      {rollSize && <style>{`@media print { @page { size: ${rollSize.width} ${rollSize.height}; margin: 0; } }`}</style>}
      <div className={rollSize ? "label-sheet roll" : "label-sheet"} style={rollSize ? { ["--label-w" as string]: rollSize.width, ["--label-h" as string]: rollSize.height } : undefined}>
        {lines.map((l) => (
          <LotLabel key={l.id} line={l} />
        ))}
      </div>
    </>
  );
}

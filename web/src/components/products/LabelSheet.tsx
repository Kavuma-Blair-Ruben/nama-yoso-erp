"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { money } from "@/lib/format";

type Product = { legacyCode: string; name: string; purchaseRate: number | null; purchaseUnit: string | null };

function Label({ product, qrDataUrl }: { product: Product; qrDataUrl: string | null }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) {
      JsBarcode(ref.current, product.legacyCode, { format: "CODE128", displayValue: false, width: 1.4, height: 30, margin: 0 });
    }
  }, [product.legacyCode]);
  return (
    <div className="label-cell">
      <div className="label-name">{product.name}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg ref={ref} style={{ flex: 1, minWidth: 0 }} />
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="Scan for product details" width={30} height={30} style={{ flex: "none" }} />
        )}
      </div>
      <div className="label-code">{product.legacyCode}{product.purchaseUnit ? " · " + product.purchaseUnit : ""}</div>
      {product.purchaseRate != null && <div className="label-price">{money(product.purchaseRate, 2)}</div>}
    </div>
  );
}

const LABEL_SIZES = {
  sheet: null, // multi-up grid on plain A4/Letter paper — existing behavior
  "50x30": { width: "50mm", height: "30mm" },
  "40x30": { width: "40mm", height: "30mm" },
  "4x6": { width: "4in", height: "6in" },
} as const;
type PrintMode = keyof typeof LABEL_SIZES;

export function LabelSheet({ product }: { product: Product }) {
  const [copies, setCopies] = useState(12);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>("sheet");

  useEffect(() => {
    const url = `${window.location.origin}/products/${product.legacyCode}`;
    QRCode.toDataURL(url, { width: 120, margin: 0 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [product.legacyCode]);

  const rollSize = LABEL_SIZES[printMode];

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
        <label style={{ fontSize: 12.5, fontWeight: 600 }}>Printer</label>
        <select value={printMode} onChange={(e) => setPrintMode(e.target.value as PrintMode)} style={{ width: 220 }}>
          <option value="sheet">Office printer (multi-up sheet)</option>
          <option value="50x30">Label/sticker printer — 50×30mm</option>
          <option value="40x30">Label/sticker printer — 40×30mm</option>
          <option value="4x6">Label/sticker printer — 4×6in</option>
        </select>
        <button className="btn accent" onClick={() => window.print()}>Print Labels</button>
        <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>Barcode for scanner guns · QR code opens this product&apos;s page when scanned with a phone camera</span>
      </div>
      {rollSize && (
        <style>{`@media print { @page { size: ${rollSize.width} ${rollSize.height}; margin: 0; } }`}</style>
      )}
      <div className={rollSize ? "label-sheet roll" : "label-sheet"} style={rollSize ? { ["--label-w" as string]: rollSize.width, ["--label-h" as string]: rollSize.height } : undefined}>
        {Array.from({ length: copies }).map((_, i) => (
          <Label key={i} product={product} qrDataUrl={qrDataUrl} />
        ))}
      </div>
    </>
  );
}

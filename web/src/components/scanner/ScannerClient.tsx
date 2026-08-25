"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ScanInput } from "@/components/ui/ScanInput";
import { scanLookup, type ScanResult } from "@/server/actions/scanner";
import { closeProductionBatchByLot } from "@/server/actions/production";
import { LotDetailCard } from "@/components/scanner/LotDetailCard";
import { fmt, money } from "@/lib/format";
import { canonicalUnitLabel } from "@/lib/unitMath";

export function ScannerClient() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closeMsg, setCloseMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [closePending, startCloseTransition] = useTransition();

  function handleScan(code: string) {
    setError(null);
    setCloseMsg(null);
    startTransition(async () => {
      const r = await scanLookup(code);
      setResult(r);
    });
  }

  function handleClose(lotNo: string) {
    setCloseMsg(null);
    startCloseTransition(async () => {
      const r = await closeProductionBatchByLot(lotNo);
      if (r.error) setError(r.error);
      else {
        setCloseMsg(`${r.batchNo} closed${r.durationMinutes != null ? ` — turnaround ${r.durationMinutes} min` : ""}.`);
        // Re-fetch so the card reflects the now-CLOSED status.
        const fresh = await scanLookup(lotNo);
        setResult(fresh);
      }
    });
  }

  return (
    <>
      <div className="panel" style={{ maxWidth: 640, marginBottom: 16 }}>
        <div className="panel-body">
          <ScanInput placeholder="Scan a product, batch, or lot barcode/QR…" onScan={handleScan} />
          {pending && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>Looking up…</div>}
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}
      {closeMsg && <div className="callout" style={{ borderColor: "var(--good)", color: "var(--good)" }}>{closeMsg}</div>}

      {result?.type === "product" && (
        <div className="panel" style={{ maxWidth: 640 }}>
          <div className="panel-head"><h3>{result.data.item.name}</h3></div>
          <div className="panel-body">
            <div className="field-row"><span className="k">Code</span><span className="v mono-r">{result.data.item.legacyCode}</span></div>
            <div className="field-row"><span className="k">Category</span><span className="v">{result.data.item.category ?? "-"}{result.data.item.subcategory ? ` / ${result.data.item.subcategory}` : ""}</span></div>
            <div className="field-row"><span className="k">Rate</span><span className="v tabular">{result.data.item.purchaseRate != null ? money(result.data.item.purchaseRate, 2) : "-"}</span></div>
            {result.data.stockByBranch.map((b) => (
              <div className="field-row" key={b.branchId}>
                <span className="k">Stock — {b.branchName}</span>
                <span className="v tabular">{fmt(b.qtyOnHand, 2)} {canonicalUnitLabel(result.data.item.issueUnit)}</span>
              </div>
            ))}
            <div style={{ marginTop: 10 }}>
              <Link href={`/products/${result.data.item.legacyCode}`} className="btn ghost">Open Full Product Page</Link>
            </div>
          </div>
        </div>
      )}

      {result?.type === "lot" && (
        <div style={{ maxWidth: 640 }}>
          <LotDetailCard lot={result.data} />
          {result.data.source === "production" && result.data.status === "OPEN" && (
            <div className="panel" style={{ marginTop: 16 }}>
              <div className="panel-body">
                <button className="btn accent" disabled={closePending} onClick={() => handleClose(result.data.lotNo!)}>
                  {closePending ? "Closing…" : "Close Production Ticket"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {result?.type === "unknown" && (
        <div className="callout" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad)" }}>
          No product or lot found for &quot;{result.code}&quot;.
        </div>
      )}
    </>
  );
}

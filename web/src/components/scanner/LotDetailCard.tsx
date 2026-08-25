import Link from "next/link";
import { fmt } from "@/lib/format";
import type { getLotDetail } from "@/server/db/queries/grn";

export type LotDetail = NonNullable<Awaited<ReturnType<typeof getLotDetail>>>;

// Shared by the /lots/[lotNo] traceability page and the Scanner page — same
// card either way, whether you arrived by scanning a QR/barcode or by URL.
export function LotDetailCard({ lot }: { lot: LotDetail }) {
  const today = new Date().toISOString().slice(0, 10);
  const isExpired = !!lot.expiryDate && lot.expiryDate < today;
  const daysToExpiry = lot.expiryDate ? Math.ceil((new Date(lot.expiryDate).getTime() - new Date(today).getTime()) / 86400000) : null;
  const isExpiringSoon = !isExpired && daysToExpiry != null && daysToExpiry <= 7;

  return (
    <>
      {isExpired && (
        <div className="callout" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad)" }}>
          <b>This batch has expired</b> — expiry date was {lot.expiryDate}. Do not use.
        </div>
      )}
      {isExpiringSoon && (
        <div className="callout" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad)" }}>
          <b>Expires in {daysToExpiry} day{daysToExpiry === 1 ? "" : "s"}</b> — {lot.expiryDate}. Use first / rotate stock.
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h3>Batch &amp; Lot Details</h3></div>
        <div className="panel-body">
          <div className="field-row"><span className="k">Product</span><span className="v">{lot.name} ({lot.legacyCode})</span></div>
          <div className="field-row"><span className="k">Batch No.</span><span className="v mono-r">{lot.batchNo ?? "-"}</span></div>
          <div className="field-row"><span className="k">Lot No.</span><span className="v mono-r">{lot.lotNo ?? "-"}</span></div>
          <div className="field-row">
            <span className="k">Expiry Date</span>
            <span className="v">
              {lot.expiryDate ?? "Not recorded"}
              {isExpired && <span className="tag bad" style={{ marginLeft: 6 }}>EXPIRED</span>}
              {isExpiringSoon && <span className="tag bad" style={{ marginLeft: 6 }}>EXPIRES SOON</span>}
            </span>
          </div>
          {lot.source === "grn" ? (
            <>
              <div className="field-row"><span className="k">Manufacture Date</span><span className="v">{lot.mfgDate ?? "Not recorded"}</span></div>
              <div className="field-row"><span className="k">Qty Received</span><span className="v tabular">{fmt(lot.receivedQty, 2)} {lot.unitLabel ?? ""}</span></div>
              <div className="field-row"><span className="k">Condition</span><span className="v"><span className={`tag ${lot.condition === "ACCEPTED" ? "good" : "bad"}`}>{lot.condition}</span></span></div>
            </>
          ) : (
            <>
              <div className="field-row"><span className="k">Produced Date</span><span className="v">{lot.producedDate}</span></div>
              <div className="field-row"><span className="k">Qty Produced</span><span className="v tabular">{fmt(lot.yieldQty, 2)} {lot.unitLabel ?? ""}</span></div>
            </>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        {lot.source === "grn" ? (
          <>
            <div className="panel-head"><h3>Receiving Record</h3></div>
            <div className="panel-body">
              <div className="field-row"><span className="k">Supplier</span><span className="v">{lot.supplier}</span></div>
              <div className="field-row"><span className="k">GRN</span><span className="v"><Link href={`/grn/${lot.grnId}`}>{lot.grnNumber}</Link></span></div>
              <div className="field-row"><span className="k">Received Date</span><span className="v">{lot.receivedDate}</span></div>
              <div className="field-row"><span className="k">GRN Status</span><span className="v">{lot.grnStatus}</span></div>
            </div>
          </>
        ) : (
          <>
            <div className="panel-head"><h3>Production Record</h3></div>
            <div className="panel-body">
              <div className="field-row"><span className="k">Branch</span><span className="v">{lot.branchName ?? "-"}</span></div>
              <div className="field-row"><span className="k">Production Batch</span><span className="v"><Link href={`/production/${lot.productionBatchId}`}>{lot.batchNo}</Link></span></div>
              <div className="field-row"><span className="k">Status</span><span className="v">{lot.status}</span></div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

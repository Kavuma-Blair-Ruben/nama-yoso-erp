"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { markExpiryTicketsPrinted, type ExpirySource } from "@/server/actions/expiry";

export type TicketItem = {
  id: string;
  source: ExpirySource;
  name: string;
  code: string;
  batchNo: string | null;
  lotNo: string | null;
  expiryDate: string;
  daysLeft: number;
  reference: string;
};

// Auto-fires the browser print dialog once, on page load, for any batch/lot
// that has just crossed into EXPIRED and hasn't had a ticket printed yet —
// there's no background-job/cron infrastructure in this app, so "automatic"
// means "the moment someone opens Expiry Tracking", not a true unattended
// schedule. Marking a ticket printed (so it never re-fires) happens only
// after the browser actually reports the print dialog closed.
export function ExpiryTicketAutoPrint({ items }: { items: TicketItem[] }) {
  const router = useRouter();
  const firedRef = useRef(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (items.length === 0 || firedRef.current) return;
    firedRef.current = true;
    setPrinting(true);

    function handleAfterPrint() {
      window.removeEventListener("afterprint", handleAfterPrint);
      markExpiryTicketsPrinted(items.map((i) => ({ source: i.source, id: i.id }))).finally(() => {
        setPrinting(false);
        router.refresh();
      });
    }
    window.addEventListener("afterprint", handleAfterPrint);
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [items, router]);

  if (items.length === 0) return null;

  return (
    <>
      {printing && (
        <div className="no-print callout" style={{ marginBottom: 12 }}>
          Printing {items.length} expiry alert ticket{items.length === 1 ? "" : "s"} — check the print dialog.
        </div>
      )}
      <div className="print-only receipt-sheet">
        {items.map((item) => (
          <div key={item.id} className="receipt-card expiry-ticket">
            <div className="rtitle">⚠ EXPIRED — CHECK &amp; REMOVE</div>
            <div className="rmeta">{item.reference}</div>
            <div className="rname">{item.name}</div>
            <div className="rsub">{item.code}</div>
            <div className="lrow"><span>Batch</span><span>{item.batchNo ?? "-"}</span></div>
            <div className="lrow"><span>Lot</span><span>{item.lotNo ?? "-"}</span></div>
            <div className="lrow"><span>Expiry Date</span><span>{item.expiryDate}</span></div>
            <div className="lrow"><span>Expired</span><span>{Math.abs(item.daysLeft)}d ago</span></div>
            <div className="rfoot">Pull this item from stock and confirm disposal or wastage entry.</div>
          </div>
        ))}
      </div>
    </>
  );
}

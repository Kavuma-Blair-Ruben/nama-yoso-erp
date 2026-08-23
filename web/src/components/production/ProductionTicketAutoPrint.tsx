"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { markProductionTicketPrinted } from "@/server/actions/production";
import { ProductionReceipt, type Batch } from "./ProductionLabelSheet";

// Fires the moment a production ticket is opened — this print IS the
// "staff started production" signal the printed ticket represents. Same
// no-cron, page-load-triggered pattern as ExpiryTicketAutoPrint (there's no
// background-job infrastructure in this app). The ticket's barcode encodes
// the lot number, which a scanner reads later to close production — see
// closeProductionBatchByLot.
export function ProductionTicketAutoPrint({ batch, alreadyPrinted }: { batch: Batch; alreadyPrinted: boolean }) {
  const router = useRouter();
  const firedRef = useRef(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (alreadyPrinted || firedRef.current) return;
    firedRef.current = true;
    setPrinting(true);

    function handleAfterPrint() {
      window.removeEventListener("afterprint", handleAfterPrint);
      markProductionTicketPrinted(batch.id).finally(() => {
        setPrinting(false);
        router.refresh();
      });
    }
    window.addEventListener("afterprint", handleAfterPrint);
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [alreadyPrinted, batch.id, router]);

  if (alreadyPrinted) return null;

  return (
    <>
      {printing && (
        <div className="no-print callout" style={{ marginBottom: 12 }}>
          Printing production ticket {batch.batchNo} — check the print dialog. Scan its barcode later to close production.
        </div>
      )}
      <div className="print-only receipt-sheet">
        <ProductionReceipt batch={batch} />
      </div>
    </>
  );
}

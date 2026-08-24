"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { markGrnStickersPrinted } from "@/server/actions/grn";
import { LotLabel, type Line } from "./LotLabelSheet";

// Fires the moment a GRN is posted — the received stock's batch/lot
// stickers print immediately, no one has to remember to open Lot Labels
// and click print. Same page-load-triggered pattern as
// ExpiryTicketAutoPrint/ProductionTicketAutoPrint (no cron/background-job
// infrastructure in this app).
export function GrnStickerAutoPrint({ grnId, lines }: { grnId: string; lines: Line[] }) {
  const router = useRouter();
  const firedRef = useRef(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (lines.length === 0 || firedRef.current) return;
    firedRef.current = true;
    setPrinting(true);

    function handleAfterPrint() {
      window.removeEventListener("afterprint", handleAfterPrint);
      markGrnStickersPrinted(grnId, lines.map((l) => l.id)).finally(() => {
        setPrinting(false);
        router.refresh();
      });
    }
    window.addEventListener("afterprint", handleAfterPrint);
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [lines, grnId, router]);

  if (lines.length === 0) return null;

  return (
    <>
      {printing && (
        <div className="no-print callout" style={{ marginBottom: 12 }}>
          Printing {lines.length} batch/lot sticker{lines.length === 1 ? "" : "s"} — check the print dialog.
        </div>
      )}
      <div className="print-only label-sheet">
        {lines.map((l) => (
          <LotLabel key={l.id} line={l} />
        ))}
      </div>
    </>
  );
}

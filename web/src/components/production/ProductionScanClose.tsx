"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScanInput } from "@/components/ui/ScanInput";
import { closeProductionBatchByLot } from "@/server/actions/production";
import { formatDurationMinutes } from "@/lib/format";

// Scans the barcode printed on a production ticket (encodes the lot number)
// to close that ticket without navigating to its page first — the physical
// workflow this supports: staff opened production (ticket auto-printed),
// worked the batch, then scans that same printed ticket when done.
export function ProductionScanClose() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function handleScan(code: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await closeProductionBatchByLot(code);
      if (result.error) {
        setIsError(true);
        setMessage(result.error);
      } else {
        setIsError(false);
        setMessage(`${result.batchNo} closed — turnaround ${formatDurationMinutes(result.durationMinutes)}.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Scan to Close Production</h3></div>
      <div className="panel-body">
        <div className="callout">Scan the barcode on a printed production ticket to close that batch and record its turnaround time.</div>
        <ScanInput placeholder="Scan a production ticket…" onScan={handleScan} autoFocus={false} />
        {pending && <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 8 }}>Closing…</div>}
        {message && (
          <div style={{ fontSize: 12, color: isError ? "var(--bad)" : "var(--good)", marginTop: 8 }}>{message}</div>
        )}
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { getTransferDetail } from "@/server/db/queries/transfers";
import { fmt, money } from "@/lib/format";
import { Logo } from "@/components/ui/Logo";
import { PrintButton } from "@/components/ui/PrintButton";
import { withTimeout } from "@/lib/withTimeout";

export default async function TransferPrintPage({ params }: PageProps<"/transfers/[id]/print">) {
  await requireSection("transfers", "view");
  const { id } = await params;
  const data = await withTimeout(getTransferDetail(id), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { transfer, lines } = data;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }} className="no-print">
        <PrintButton label="Print Transfer Note" />
      </div>

      <div className="print-doc" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 16, marginBottom: 20 }}>
          <Logo height={48} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: ".04em" }}>STOCK TRANSFER NOTE</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{transfer.transferNo}</div>
            <div style={{ fontSize: 11.5, color: "#666" }}>Date: {transfer.transferDate}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24, fontSize: 12.5 }}>
          <div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 4 }}>From</div>
            <div style={{ fontWeight: 700 }}>{transfer.fromBranchName}</div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 4 }}>To</div>
            <div style={{ fontWeight: 700 }}>{transfer.toBranchName}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24, fontSize: 12.5 }}>
          <div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 4 }}>Staff</div>
            <div style={{ fontWeight: 700 }}>{transfer.staffName ?? "-"}</div>
            {transfer.notes && <div style={{ marginTop: 4 }}>{transfer.notes}</div>}
          </div>
          <div>
            <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888" }}>Status: </span>
            <b>{transfer.status.replace("_", " ")}</b>
            {transfer.sentByName && <div>Sent by {transfer.sentByName}{transfer.sentAt ? ` · ${transfer.sentAt.toISOString().slice(0, 10)}` : ""}</div>}
            {transfer.postedByName && <div>Received by {transfer.postedByName}{transfer.postedAt ? ` · ${transfer.postedAt.toISOString().slice(0, 10)}` : ""}</div>}
          </div>
        </div>

        <div className="print-table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, marginBottom: 16, minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid #111" }}>
                <th style={{ textAlign: "left", padding: "6px 3px", width: 20 }}>#</th>
                <th style={{ textAlign: "left", padding: "6px 3px" }}>Item</th>
                <th style={{ textAlign: "right", padding: "6px 3px" }}>Qty</th>
                <th style={{ textAlign: "left", padding: "6px 3px" }}>Unit</th>
                <th style={{ textAlign: "right", padding: "6px 3px" }}>Rate</th>
                <th style={{ textAlign: "right", padding: "6px 3px" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id} style={{ borderBottom: "1px solid #e5e5e5" }}>
                  <td style={{ padding: "6px 3px", color: "#888" }}>{i + 1}</td>
                  <td style={{ padding: "6px 3px" }}>{l.legacyCode} — {l.name}</td>
                  <td style={{ textAlign: "right", padding: "6px 3px" }}>{fmt(l.qty, 2)}</td>
                  <td style={{ padding: "6px 3px" }}>{l.unitLabel ?? "-"}</td>
                  <td style={{ textAlign: "right", padding: "6px 3px" }}>{fmt(l.rateAtTransfer ?? 0, 2)}</td>
                  <td style={{ textAlign: "right", padding: "6px 3px" }}>{fmt(l.amountAtTransfer, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
          <table style={{ fontSize: 12.5, minWidth: 240 }}>
            <tbody>
              <tr style={{ borderTop: "1.5px solid #111", fontWeight: 700 }}>
                <td style={{ padding: "6px 12px 3px 0" }}>Estimated Value</td>
                <td style={{ textAlign: "right", padding: "6px 0 3px" }}>{money(transfer.totalCost, 2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 40, fontSize: 11.5 }}>
          <div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 6 }}>Sent By</div>
          </div>
          <div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 6 }}>Received By</div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { getGrnDetail } from "@/server/db/queries/grn";
import { fmt, money } from "@/lib/format";
import { Logo } from "@/components/ui/Logo";
import { PrintButton } from "@/components/ui/PrintButton";

export default async function GrnPrintPage({ params }: PageProps<"/grn/[id]/print">) {
  await requireSection("grn", "view");
  const { id } = await params;
  const data = await getGrnDetail(id);
  if (!data) notFound();
  const { grn, lines, net, vat, total } = data;
  const grossBeforeDiscount = lines.reduce((s, l) => s + (l.isFoc ? 0 : l.receivedQty * l.rate), 0);
  const discountTotal = grossBeforeDiscount - net;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }} className="no-print">
        <PrintButton label="Print GRN" />
      </div>

      <div className="print-doc" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 16, marginBottom: 20 }}>
          <Logo height={48} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: ".04em" }}>GOODS RECEIVED NOTE</div>
            {grn.documentType && (
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: "#666", marginTop: 2 }}>
                {grn.documentType === "TAX_INVOICE" ? "TAX INVOICE" : "DELIVERY NOTE"}
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>
              {grn.invoiceNumber ? grn.invoiceNumber : grn.grnNumber}
            </div>
            {grn.invoiceNumber && <div style={{ fontSize: 10.5, color: "#888" }}>Internal ref: {grn.grnNumber}</div>}
            <div style={{ fontSize: 11.5, color: "#666" }}>Date: {grn.receivedDate}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24, fontSize: 12.5 }}>
          <div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 4 }}>Supplier</div>
            <div style={{ fontWeight: 700 }}>{grn.supplier}</div>
            {grn.supplierContactName && <div>Attn: {grn.supplierContactName}</div>}
            {grn.supplierPhone && <div>Tel: {grn.supplierPhone}</div>}
            {grn.supplierEmail && <div>{grn.supplierEmail}</div>}
            {grn.supplierTrn && <div>TRN: {grn.supplierTrn}</div>}
          </div>
          <div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 4 }}>Received At</div>
            <div style={{ fontWeight: 700 }}>{grn.branchName ?? "-"}</div>
            {grn.poNumber && <div>Against LPO: {grn.poNumber}</div>}
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888" }}>Status: </span>
              <b>{grn.status}</b>
            </div>
          </div>
        </div>

        <div className="print-table-wrap">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, marginBottom: 16, minWidth: 640 }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid #111" }}>
              <th style={{ textAlign: "left", padding: "6px 3px", width: 20 }}>#</th>
              <th style={{ textAlign: "left", padding: "6px 3px" }}>Description</th>
              <th style={{ textAlign: "right", padding: "6px 3px" }}>Qty</th>
              <th style={{ textAlign: "left", padding: "6px 3px" }}>Unit</th>
              <th style={{ textAlign: "right", padding: "6px 3px" }}>Rate</th>
              <th style={{ textAlign: "left", padding: "6px 3px" }}>Batch / Lot</th>
              <th style={{ textAlign: "left", padding: "6px 3px" }}>Expiry</th>
              <th style={{ textAlign: "left", padding: "6px 3px" }}>Cond.</th>
              <th style={{ textAlign: "right", padding: "6px 3px" }}>Subtotal</th>
              <th style={{ textAlign: "right", padding: "6px 3px" }}>Tax Amt</th>
              <th style={{ textAlign: "right", padding: "6px 3px" }}>Total Amt</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const taxAmount = l.lineAmount * (l.taxRate / 100);
              return (
                <tr key={l.id} style={{ borderBottom: "1px solid #e5e5e5" }}>
                  <td style={{ padding: "6px 3px", color: "#888" }}>{i + 1}</td>
                  <td style={{ padding: "6px 3px" }}>{l.name}</td>
                  <td style={{ textAlign: "right", padding: "6px 3px" }}>{fmt(l.receivedQty, 2)}</td>
                  <td style={{ padding: "6px 3px" }}>{l.unitLabel ?? "-"}</td>
                  <td style={{ textAlign: "right", padding: "6px 3px" }}>{l.isFoc ? "FOC" : fmt(l.rate, 2)}</td>
                  <td style={{ padding: "6px 3px" }}>{l.batchNo ?? "-"} / {l.lotNo ?? "-"}</td>
                  <td style={{ padding: "6px 3px" }}>{l.expiryDate ?? "-"}</td>
                  <td style={{ padding: "6px 3px" }}>{l.condition}</td>
                  <td style={{ textAlign: "right", padding: "6px 3px" }}>{fmt(l.lineAmount, 2)}</td>
                  <td style={{ textAlign: "right", padding: "6px 3px" }}>{fmt(taxAmount, 2)}</td>
                  <td style={{ textAlign: "right", padding: "6px 3px" }}>{fmt(l.lineAmount + taxAmount, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
          <table style={{ fontSize: 12.5, minWidth: 240 }}>
            <tbody>
              <tr><td style={{ padding: "3px 12px 3px 0" }}>Subtotal</td><td style={{ textAlign: "right", padding: "3px 0" }}>{fmt(grossBeforeDiscount, 2)}</td></tr>
              {discountTotal > 0.004 && (
                <tr><td style={{ padding: "3px 12px 3px 0" }}>Discount</td><td style={{ textAlign: "right", padding: "3px 0" }}>-{fmt(discountTotal, 2)}</td></tr>
              )}
              <tr><td style={{ padding: "3px 12px 3px 0" }}>Tax Amount</td><td style={{ textAlign: "right", padding: "3px 0" }}>{fmt(vat, 2)}</td></tr>
              <tr style={{ borderTop: "1.5px solid #111", fontWeight: 700 }}><td style={{ padding: "6px 12px 3px 0" }}>Total</td><td style={{ textAlign: "right", padding: "6px 0 3px" }}>{money(total, 2)}</td></tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 40, fontSize: 11.5 }}>
          <div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 6 }}>Received By</div>
          </div>
          <div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 6 }}>Delivered By</div>
          </div>
        </div>
      </div>
    </div>
  );
}

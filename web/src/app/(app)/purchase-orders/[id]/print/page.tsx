import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { getPurchaseOrderDetail } from "@/server/db/queries/purchaseOrders";
import { fmt, money } from "@/lib/format";
import { Logo } from "@/components/ui/Logo";
import { PrintButton } from "@/components/ui/PrintButton";
import { withTimeout } from "@/lib/withTimeout";

export default async function PurchaseOrderPrintPage({ params }: PageProps<"/purchase-orders/[id]/print">) {
  await requireSection("orders", "view");
  const { id } = await params;
  const data = await withTimeout(getPurchaseOrderDetail(id), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { po, lines, net, vat, total } = data;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }} className="no-print">
        <PrintButton label="Print LPO" />
      </div>

      <div className="print-doc" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 16, marginBottom: 20 }}>
          <Logo height={48} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: ".04em" }}>LOCAL PURCHASE ORDER</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{po.poNumber}</div>
            <div style={{ fontSize: 11.5, color: "#666" }}>Date: {po.createdDate}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24, fontSize: 12.5 }}>
          <div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 4 }}>Supplier</div>
            <div style={{ fontWeight: 700 }}>{po.supplier}</div>
            {po.supplierContactName && <div>Attn: {po.supplierContactName}</div>}
            {po.supplierPhone && <div>Tel: {po.supplierPhone}</div>}
            {po.supplierEmail && <div>{po.supplierEmail}</div>}
            {po.supplierTrn && <div>TRN: {po.supplierTrn}</div>}
          </div>
          <div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 4 }}>Deliver To</div>
            <div style={{ fontWeight: 700 }}>{po.branchName ?? po.deliverTo ?? "-"}</div>
            {po.supplierPaymentTerms && <div>Payment Terms: {po.supplierPaymentTerms}</div>}
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888" }}>Status: </span>
              <b>{po.status}</b>
            </div>
          </div>
        </div>

        <div className="print-table-wrap">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16, minWidth: 560 }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid #111" }}>
              <th style={{ textAlign: "left", padding: "6px 4px", width: 28 }}>#</th>
              <th style={{ textAlign: "left", padding: "6px 4px" }}>Description</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Qty</th>
              <th style={{ textAlign: "left", padding: "6px 4px" }}>Unit</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Rate</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Subtotal</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Tax Amount</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const taxableAmount = l.qty * l.rate;
              const taxAmount = taxableAmount * (l.taxRate / 100);
              return (
                <tr key={l.id} style={{ borderBottom: "1px solid #e5e5e5" }}>
                  <td style={{ padding: "6px 4px", color: "#888" }}>{i + 1}</td>
                  <td style={{ padding: "6px 4px" }}>{l.name}</td>
                  <td style={{ textAlign: "right", padding: "6px 4px" }}>{fmt(l.qty, 2)}</td>
                  <td style={{ padding: "6px 4px" }}>{l.unitLabel ?? "-"}</td>
                  <td style={{ textAlign: "right", padding: "6px 4px" }}>{fmt(l.rate, 2)}</td>
                  <td style={{ textAlign: "right", padding: "6px 4px" }}>{fmt(taxableAmount, 2)}</td>
                  <td style={{ textAlign: "right", padding: "6px 4px" }}>{fmt(taxAmount, 2)}</td>
                  <td style={{ textAlign: "right", padding: "6px 4px" }}>{fmt(taxableAmount + taxAmount, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
          <table style={{ fontSize: 12.5, minWidth: 240 }}>
            <tbody>
              <tr><td style={{ padding: "3px 12px 3px 0" }}>Subtotal</td><td style={{ textAlign: "right", padding: "3px 0" }}>{fmt(net, 2)}</td></tr>
              <tr><td style={{ padding: "3px 12px 3px 0" }}>Tax Amount</td><td style={{ textAlign: "right", padding: "3px 0" }}>{fmt(vat, 2)}</td></tr>
              <tr style={{ borderTop: "1.5px solid #111", fontWeight: 700 }}><td style={{ padding: "6px 12px 3px 0" }}>Total</td><td style={{ textAlign: "right", padding: "6px 0 3px" }}>{money(total, 2)}</td></tr>
            </tbody>
          </table>
        </div>

        {po.notes && (
          <div style={{ fontSize: 12, marginBottom: 24 }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 4 }}>Notes</div>
            {po.notes}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 40, fontSize: 11.5 }}>
          <div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 6 }}>Authorized Signature</div>
          </div>
          <div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 6 }}>Supplier Acknowledgement</div>
          </div>
        </div>
      </div>
    </div>
  );
}

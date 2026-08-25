import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPurchaseOrderDetail } from "@/server/db/queries/purchaseOrders";
import { POStatusActions } from "@/components/purchase-orders/POStatusActions";
import { SendDocumentButtons } from "@/components/ui/SendDocumentButtons";
import { sendPurchaseOrderEmail, sendPurchaseOrderWhatsApp } from "@/server/actions/purchaseOrders";
import { isWhatsAppBusinessConfigured } from "@/lib/whatsappBusiness";
import { fmt, money } from "@/lib/format";

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "status-draft",
  APPROVED: "status-approved",
  ORDERED: "status-ordered",
  "PARTIALLY RECEIVED": "status-partial",
  "FULLY RECEIVED": "status-received",
  CANCELLED: "status-cancelled",
};

export default async function PurchaseOrderDetailPage({ params }: PageProps<"/purchase-orders/[id]">) {
  const session = await requireSection("orders", "view");
  const { id } = await params;
  const data = await getPurchaseOrderDetail(id);
  if (!data) notFound();
  const { po, lines, net, vat, total } = data;
  const canEdit = hasAccess(session, "orders", "edit");
  const canReceive = po.status === "ORDERED" || po.status === "PARTIALLY RECEIVED";

  const waDigitsOnly = po.supplierPhone?.replace(/[^0-9]/g, "") ?? "";
  const waText = encodeURIComponent(
    `Please find our order ${po.poNumber} for ${po.supplier}.\n\n` +
      lines.map((l) => `${l.name} — ${fmt(l.qty, 2)} ${l.unitLabel ?? ""} @ ${fmt(l.rate, 2)}`).join("\n") +
      `\n\nTotal: ${money(total, 2)}`
  );

  return (
    <>
      <PageHeader
        title={po.poNumber}
        subtitle={`${po.supplier} · ${po.createdDate}${po.deliverTo ? " · Deliver to " + po.deliverTo : ""}`}
        backHref="/purchase-orders"
        backLabel="Purchase Orders"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {canEdit && (
              <SendDocumentButtons
                documentLabel="PO"
                hasEmail={!!po.supplierEmail}
                whatsappConfigured={isWhatsAppBusinessConfigured()}
                waTextHref={waDigitsOnly ? `https://wa.me/${waDigitsOnly}?text=${waText}` : null}
                pdfHref={`/api/purchase-orders/${po.id}/pdf`}
                sendEmailAction={sendPurchaseOrderEmail.bind(null, po.id)}
                sendWhatsAppAction={sendPurchaseOrderWhatsApp.bind(null, po.id)}
              />
            )}
            <Link href={`/purchase-orders/${po.id}/print`} className="btn ghost">Print LPO</Link>
          </div>
        }
      />

      <div style={{ marginBottom: 14 }}>
        <span className={`status-badge ${STATUS_CLASS[po.status] ?? "status-draft"}`}>{po.status}</span>
      </div>

      <div className="section-title">Items</div>
      <div className="ledger" style={{ marginBottom: 16 }}>
        <div className="ledger-row head" style={{ gridTemplateColumns: "1fr 60px 70px 80px 90px 90px 90px" }}>
          <div>Description</div>
          <div>Qty</div>
          <div>Unit</div>
          <div>Rate</div>
          <div>Subtotal</div>
          <div>Tax Amount</div>
          <div>Total Amount</div>
        </div>
        {lines.map((l) => {
          const taxableAmount = l.qty * l.rate;
          const taxAmount = taxableAmount * (l.taxRate / 100);
          return (
            <div className="ledger-row" key={l.id} style={{ gridTemplateColumns: "1fr 60px 70px 80px 90px 90px 90px" }}>
              <div className="n">{l.name}</div>
              <div className="mono-r">{fmt(l.qty, 2)}</div>
              <div className="mono-r">{l.unitLabel ?? ""}</div>
              <div className="mono-r">{fmt(l.rate, 2)}</div>
              <div className="mono-r">{money(taxableAmount, 2)}</div>
              <div className="mono-r">{money(taxAmount, 2)}</div>
              <div className="mono-r">{money(taxableAmount + taxAmount, 2)}</div>
            </div>
          );
        })}
        <div className="ledger-row" style={{ gridTemplateColumns: "1fr 60px 70px 80px 90px 90px 90px", background: "var(--bg-panel-alt)", fontWeight: 600 }}>
          <div>Subtotal</div><div></div><div></div><div></div><div></div><div></div><div className="mono-r">{fmt(net, 2)}</div>
        </div>
        <div className="ledger-row" style={{ gridTemplateColumns: "1fr 60px 70px 80px 90px 90px 90px", background: "var(--bg-panel-alt)", fontWeight: 600 }}>
          <div>Tax Amount</div><div></div><div></div><div></div><div></div><div></div><div className="mono-r">{fmt(vat, 2)}</div>
        </div>
        <div className="ledger-total" style={{ gridTemplateColumns: "1fr 60px 70px 80px 90px 90px 90px" }}>
          <div>Total</div><div></div><div></div><div></div><div></div><div></div><div>{money(total, 2)}</div>
        </div>
      </div>

      {po.notes && (
        <div className="field-row"><span className="k">Notes</span><span className="v">{po.notes}</span></div>
      )}

      {canEdit && <POStatusActions id={po.id} status={po.status} />}

      {canEdit && canReceive && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title">Receiving</div>
          <Link className="btn accent" href={`/grn/new?poId=${po.id}`}>
            Receive Stock (create GRN)
          </Link>
        </div>
      )}
    </>
  );
}

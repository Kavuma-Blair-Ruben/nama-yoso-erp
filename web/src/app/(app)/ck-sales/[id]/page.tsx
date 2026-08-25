import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDeliveryNoteDetail } from "@/server/db/queries/ckSales";
import { SendDocumentButtons } from "@/components/ui/SendDocumentButtons";
import { sendDeliveryNoteEmail, sendDeliveryNoteWhatsApp } from "@/server/actions/ckSales";
import { isWhatsAppBusinessConfigured } from "@/lib/whatsappBusiness";
import { fmt, money } from "@/lib/format";

export default async function CkSaleDetailPage({ params }: PageProps<"/ck-sales/[id]">) {
  const session = await requireSection("ckwarehouse", "view");
  const { id } = await params;
  const data = await getDeliveryNoteDetail(id);
  if (!data) notFound();
  const { dn, lines } = data;
  const canEdit = hasAccess(session, "ckwarehouse", "edit");
  const hasReturnable = lines.some((l) => l.returnedQty < l.qty);
  const docLabel = dn.docType === "PRO" ? "Pro Forma / Invoice" : "Delivery Note";

  const waDigitsOnly = dn.customerPhone?.replace(/[^0-9]/g, "") ?? "";
  const waText = encodeURIComponent(
    `Please find your ${docLabel.toLowerCase()} ${dn.number} from ${dn.branchName}.\n\n` +
      lines.map((l) => `${l.name} — ${fmt(l.qty, 2)} ${l.unitLabel ?? ""} @ ${fmt(l.price, 2)}`).join("\n") +
      `\n\nTotal: ${money(dn.total, 2)}`
  );

  return (
    <>
      <PageHeader
        title={dn.number}
        subtitle={`${docLabel} · ${dn.customerName} · ${dn.branchName} · ${dn.deliveryDate}`}
        backHref="/ck-sales"
        backLabel="CK Sales"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {canEdit && (
              <SendDocumentButtons
                documentLabel={dn.docType === "PRO" ? "Invoice" : "DN"}
                hasEmail={!!dn.customerEmail}
                whatsappConfigured={isWhatsAppBusinessConfigured()}
                waTextHref={waDigitsOnly ? `https://wa.me/${waDigitsOnly}?text=${waText}` : null}
                pdfHref={`/api/ck-sales/${dn.id}/pdf`}
                sendEmailAction={sendDeliveryNoteEmail.bind(null, dn.id)}
                sendWhatsAppAction={sendDeliveryNoteWhatsApp.bind(null, dn.id)}
              />
            )}
            {canEdit && hasReturnable && <Link href={`/ck-sales/${dn.id}/return`} className="btn ghost">Create Return</Link>}
          </div>
        }
      />

      <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 12 }}>
        Delivery notes are posted immediately — stock was deducted the moment this was created.
      </div>

      <div className="section-title">Items</div>
      {lines.map((l) => (
        <div className="field-row" key={l.id}>
          <span className="k">
            {l.legacyCode} — {l.name}
            {l.returnedQty > 0 && <span className="tag neutral" style={{ marginLeft: 6 }}>{l.returnedQty >= l.qty ? "fully returned" : "partially returned"}</span>}
          </span>
          <span className="v tabular">{fmt(l.qty, 2)} {l.unitLabel ?? ""} · {money(l.amount, 2)}</span>
        </div>
      ))}

      <div className="section-title">Value</div>
      <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Total</b></span><span className="v">{money(dn.total, 2)}</span></div>
    </>
  );
}

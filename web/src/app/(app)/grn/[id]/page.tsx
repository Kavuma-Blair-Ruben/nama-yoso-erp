import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGrnDetail, getGrnLinesForLabels, listCreditNotesForGrn, listSupplierReturnsForGrn } from "@/server/db/queries/grn";
import { PostDraftButton } from "@/components/grn/PostDraftButton";
import { PaymentStatusToggle } from "@/components/grn/PaymentStatusToggle";
import { CreditNoteSection } from "@/components/grn/CreditNoteSection";
import { SupplierReturnSection } from "@/components/grn/SupplierReturnSection";
import { GrnStickerAutoPrint } from "@/components/grn/GrnStickerAutoPrint";
import { InvoicePreview } from "@/components/ui/InvoicePreview";
import { fmt, money } from "@/lib/format";

export default async function GrnDetailPage({ params, searchParams }: PageProps<"/grn/[id]">) {
  const session = await requireSection("grn", "view");
  const { id } = await params;
  const sp = await searchParams;
  const warning = typeof sp.warning === "string" ? sp.warning : undefined;
  const [data, creditNotes, supplierReturns, labelData] = await Promise.all([
    getGrnDetail(id),
    listCreditNotesForGrn(id),
    listSupplierReturnsForGrn(id),
    getGrnLinesForLabels(id),
  ]);
  if (!data) notFound();
  const { grn, lines, net, vat, total } = data;
  const canEdit = hasAccess(session, "grn", "edit");
  const unstickeredLines = (labelData?.lines ?? []).filter((l) => l.lotNo && !l.stickerPrintedAt);

  return (
    <>
      {grn.status === "POSTED" && <GrnStickerAutoPrint grnId={grn.id} lines={unstickeredLines} />}
      <PageHeader
        title={grn.grnNumber}
        subtitle={`${grn.supplier} · ${grn.receivedDate}${grn.poNumber ? " · LPO " + grn.poNumber : " · Direct GRN"}`}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href={`/grn/${grn.id}/print`} className="btn ghost">Print GRN</Link>
            {lines.length > 0 && <Link href={`/grn/${grn.id}/lot-labels`} className="btn ghost">Print Batch/Lot Labels</Link>}
            {canEdit && grn.status === "POSTED" && <Link href={`/grn/${grn.id}/return`} className="btn ghost">Return to Supplier</Link>}
            {canEdit && grn.status === "DRAFT" && <Link href={`/grn/${grn.id}/edit`} className="btn accent">Edit Draft</Link>}
          </div>
        }
      />

      {warning && (
        <div className="callout" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad)", marginBottom: 14 }}>
          ⚠ {warning}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <span className={`status-badge ${grn.status === "DRAFT" ? "status-draft" : "status-received"}`}>{grn.status}</span>
      </div>
      {grn.status === "DRAFT" ? (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          Stock has not been updated yet — post this GRN to update stock levels and lock it in.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 12 }}>
          Posted GRNs are locked — stock and PO status have already been updated and this record can&apos;t be edited. Batch/lot
          stickers auto-print the moment a GRN is posted; print more copies anytime from Print Batch/Lot Labels.
        </div>
      )}

      <div className="section-title">Supplier Invoice</div>
      {grn.attachmentUrl ? (
        <InvoicePreview url={grn.attachmentUrl} />
      ) : grn.status === "DRAFT" ? (
        <div className="callout" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad)" }}>
          No invoice uploaded or scanned yet — this is required before the GRN can be posted.{" "}
          {canEdit && <Link href={`/grn/${grn.id}/edit`}>Upload it now</Link>}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 8 }}>No invoice document on file.</div>
      )}

      {grn.documentType && (
        <div className="field-row">
          <span className="k">Document type</span>
          <span className="v"><span className="tag neutral">{grn.documentType === "TAX_INVOICE" ? "Tax Invoice" : "Delivery Note"}</span></span>
        </div>
      )}
      {grn.invoiceNumber && <div className="field-row"><span className="k">Document number</span><span className="v">{grn.invoiceNumber}</span></div>}
      {grn.invoiceDueDate && <div className="field-row"><span className="k">Invoice due date</span><span className="v">{grn.invoiceDueDate}</span></div>}

      {grn.status === "POSTED" && grn.invoiceNumber && (
        <div className="panel" style={{ marginTop: 16, marginBottom: 16 }}>
          <div className="panel-head"><h3>Payment Status</h3></div>
          <div className="panel-body">
            <div className="field-row">
              <span className="k">Status</span>
              <span className="v">
                <span className={`tag ${grn.paymentStatus === "PAID" ? "good" : "bad"}`}>{grn.paymentStatus === "PAID" ? "PAID" : "OUTSTANDING"}</span>
              </span>
            </div>
            {grn.paymentStatus === "PAID" && grn.paidAt && (
              <div className="field-row"><span className="k">Paid on</span><span className="v">{grn.paidAt.toISOString().slice(0, 10)}</span></div>
            )}
            {canEdit && <PaymentStatusToggle id={grn.id} status={grn.paymentStatus === "PAID" ? "PAID" : "OUTSTANDING"} />}
          </div>
        </div>
      )}

      <div className="section-title">Received Lines</div>
      {lines.map((l) => {
        const taxAmount = l.lineAmount * (l.taxRate / 100);
        return (
          <div className="field-row" key={l.id} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <b>{l.name}</b>
              <span>
                {fmt(l.receivedQty, 2)} {l.unitLabel}{" "}
                {l.isFoc ? <span className="tag neutral">FOC</span> : l.discountPct ? <span className="tag good">{fmt(l.discountPct, 0)}% off</span> : null}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
              Batch {l.batchNo ?? "-"} · Lot {l.lotNo ?? "-"} · Exp {l.expiryDate ?? "-"} ·{" "}
              <span className={`tag ${l.condition === "ACCEPTED" ? "good" : "bad"}`}>{l.condition}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
              Subtotal: {fmt(l.lineAmount, 2)} · Tax Amount: {fmt(taxAmount, 2)} · Total Amount: {fmt(l.lineAmount + taxAmount, 2)}
            </div>
          </div>
        );
      })}

      <div className="section-title">Value</div>
      {(() => {
        const grossBeforeDiscount = lines.reduce((s, l) => s + (l.isFoc ? 0 : l.receivedQty * l.rate), 0);
        const discountTotal = grossBeforeDiscount - net;
        return (
          <>
            <div className="field-row"><span className="k">Subtotal</span><span className="v tabular">{fmt(grossBeforeDiscount, 2)}</span></div>
            {discountTotal > 0.004 && (
              <div className="field-row"><span className="k">Discount</span><span className="v tabular">-{fmt(discountTotal, 2)}</span></div>
            )}
            <div className="field-row"><span className="k">Tax Amount</span><span className="v tabular">{fmt(vat, 2)}</span></div>
          </>
        );
      })()}
      <div className="field-row"><span className="k"><b>Total</b></span><span className="v tabular">{money(total, 2)}</span></div>

      {grn.status === "POSTED" && (
        <>
          <SupplierReturnSection returns={supplierReturns} />
          <CreditNoteSection grnId={grn.id} notes={creditNotes} canEdit={canEdit} canRequest={canEdit} />
        </>
      )}

      {canEdit && grn.status === "DRAFT" && <PostDraftButton id={grn.id} />}
    </>
  );
}

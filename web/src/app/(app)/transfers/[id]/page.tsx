import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getTransferDetail } from "@/server/db/queries/transfers";
import { SendTransferDraftButton } from "@/components/transfers/SendTransferDraftButton";
import { ReceiveTransferButton } from "@/components/transfers/ReceiveTransferButton";
import { DeleteTransferDraftButton } from "@/components/transfers/DeleteTransferDraftButton";
import { fmt, money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

const STATUS_BADGE_CLASS: Record<string, string> = { DRAFT: "status-draft", IN_TRANSIT: "status-ordered", POSTED: "status-received" };

export default async function TransferDetailPage({ params }: PageProps<"/transfers/[id]">) {
  const session = await requireSection("transfers", "view");
  const { id } = await params;
  const data = await withTimeout(getTransferDetail(id), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { transfer, lines } = data;
  const canEdit = hasAccess(session, "transfers", "edit");

  return (
    <>
      <PageHeader
        title={transfer.transferNo}
        subtitle={`${transfer.fromBranchName} → ${transfer.toBranchName} · ${transfer.transferDate}`}
        backHref="/transfers"
        backLabel="Stock Transfers"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href={`/transfers/${transfer.id}/print`} className="btn ghost">Print</Link>
            {canEdit && <Link href={`/transfers/${transfer.id}/clone`} className="btn ghost">Repeat</Link>}
            {canEdit && transfer.status === "DRAFT" && <Link href={`/transfers/${transfer.id}/edit`} className="btn accent">Edit Draft</Link>}
          </div>
        }
      />

      <div style={{ marginBottom: 14 }}>
        <span className={`status-badge ${STATUS_BADGE_CLASS[transfer.status] ?? "status-draft"}`}>{transfer.status.replace("_", " ")}</span>
      </div>
      {transfer.status === "DRAFT" && (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          Stock has not been updated yet — send this transfer to deduct it from {transfer.fromBranchName}.
        </div>
      )}
      {transfer.status === "IN_TRANSIT" && (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          Sent — stock has been deducted from {transfer.fromBranchName} but not yet credited to {transfer.toBranchName}.
          Confirm receipt below once the goods actually arrive.
        </div>
      )}
      {transfer.status === "POSTED" && (
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 12 }}>
          Received — stock has moved into {transfer.toBranchName} and this record can&apos;t be edited further.
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h3>Transfer Details</h3></div>
        <div className="panel-body">
          <div className="field-row"><span className="k">Staff</span><span className="v">{transfer.staffName ?? "-"}</span></div>
          {transfer.notes && <div className="field-row"><span className="k">Notes</span><span className="v">{transfer.notes}</span></div>}
          {(transfer.status === "IN_TRANSIT" || transfer.status === "POSTED") && (
            <div className="field-row"><span className="k">Sent by</span><span className="v">{transfer.sentByName ?? "-"} · {transfer.sentAt?.toISOString().slice(0, 10)}</span></div>
          )}
          {transfer.status === "POSTED" && (
            <div className="field-row"><span className="k">Received by</span><span className="v">{transfer.postedByName ?? "-"} · {transfer.postedAt?.toISOString().slice(0, 10)}</span></div>
          )}
        </div>
      </div>

      <div className="section-title">Items</div>
      {lines.map((l) => (
        <div className="field-row" key={l.id}>
          <span className="k">{l.legacyCode} — {l.name}</span>
          <span className="v tabular">{fmt(l.qty, 2)} {l.unitLabel ?? ""} · {money(l.amountAtTransfer, 2)}</span>
        </div>
      ))}

      <div className="section-title">Value</div>
      <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Estimated Value</b></span><span className="v">{money(transfer.totalCost, 2)}</span></div>

      {canEdit && transfer.status === "DRAFT" && (
        <>
          <SendTransferDraftButton id={transfer.id} />
          <DeleteTransferDraftButton id={transfer.id} />
        </>
      )}
      {canEdit && transfer.status === "IN_TRANSIT" && <ReceiveTransferButton id={transfer.id} />}
    </>
  );
}

import { notFound } from "next/navigation";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getMaterialRequestDetail, MR_NEXT_STATUSES, type MrStatus } from "@/server/db/queries/materialRequests";
import { MrStatusActions } from "@/components/materialRequests/MrStatusActions";
import { fmt } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

const STATUS_CLASS: Record<string, string> = {
  "PENDING APPROVAL": "status-ordered",
  APPROVED: "status-approved",
  REJECTED: "status-cancelled",
  FULFILLED: "status-received",
};

export default async function MaterialRequestDetailPage({ params }: PageProps<"/material-requests/[id]">) {
  const session = await requireSection("orders", "view");
  const { id } = await params;
  const data = await withTimeout(getMaterialRequestDetail(id), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { request, lines } = data;
  const canEdit = hasAccess(session, "orders", "edit");

  return (
    <>
      <PageHeader title={request.mrNumber} subtitle={`${request.fromLocation} → ${request.toLocation} · ${request.createdAt.toISOString().slice(0, 10)}`} backHref="/material-requests" backLabel="Material Requests" />

      <div style={{ marginBottom: 14 }}>
        <span className={`status-badge ${STATUS_CLASS[request.status] ?? "status-draft"}`}>{request.status}</span>
      </div>

      <div className="field-row"><span className="k">Required date</span><span className="v">{request.requiredDate}</span></div>
      <div className="field-row"><span className="k">Requested by</span><span className="v">{request.createdByName ?? "-"}</span></div>
      {request.notes && <div className="field-row"><span className="k">Notes</span><span className="v">{request.notes}</span></div>}

      <div className="section-title">Items Requested</div>
      {lines.map((l) => (
        <div className="field-row" key={l.id}>
          <span className="k">{l.legacyCode} — {l.name}</span>
          <span className="v tabular">{fmt(l.qty, 2)} {l.unitLabel ?? ""}</span>
        </div>
      ))}

      {canEdit && <MrStatusActions id={request.id} nextStatuses={MR_NEXT_STATUSES[request.status as MrStatus] ?? []} />}
    </>
  );
}

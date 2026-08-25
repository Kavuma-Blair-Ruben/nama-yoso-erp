import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getWastageEventDetail } from "@/server/db/queries/wastage";
import { PostWastageDraftButton } from "@/components/wastage/PostWastageDraftButton";
import { DeleteWastageDraftButton } from "@/components/wastage/DeleteWastageDraftButton";
import { fmt, money } from "@/lib/format";

export default async function WastageDetailPage({ params }: PageProps<"/wastage/[id]">) {
  const session = await requireSection("wastage", "view");
  const { id } = await params;
  const data = await getWastageEventDetail(id);
  if (!data) notFound();
  const { event, lines } = data;
  const canEdit = hasAccess(session, "wastage", "edit");

  return (
    <>
      <PageHeader
        title={event.wastageNo}
        subtitle={`${event.costCenter} · ${event.branchName ?? "-"} · ${event.eventDate}`}
        backHref="/wastage"
        backLabel="Wastage Tracking"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {canEdit && <Link href={`/wastage/${event.id}/clone`} className="btn ghost">Repeat</Link>}
            {canEdit && event.status === "DRAFT" && <Link href={`/wastage/${event.id}/edit`} className="btn accent">Edit Draft</Link>}
          </div>
        }
      />

      <div style={{ marginBottom: 14 }}>
        <span className={`status-badge ${event.status === "DRAFT" ? "status-draft" : "status-received"}`}>{event.status}</span>
      </div>
      {event.status === "DRAFT" ? (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          Stock has not been updated yet — post this log to deduct wasted quantities from stock.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 12 }}>
          Posted wastage logs are locked — stock has already been deducted and this record can&apos;t be edited.
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h3>Log Details</h3></div>
        <div className="panel-body">
          <div className="field-row"><span className="k">Staff</span><span className="v">{event.staffName ?? "-"}</span></div>
          {event.status === "POSTED" && (
            <div className="field-row"><span className="k">Posted by</span><span className="v">{event.postedByName ?? "-"} · {event.postedAt?.toISOString().slice(0, 10)}</span></div>
          )}
        </div>
      </div>

      <div className="section-title">Wasted Items</div>
      {lines.map((l) => (
        <div className="field-row" key={l.id}>
          <span className="k" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {l.photoUrl && (
              <a href={l.photoUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.photoUrl} alt="Wasted item" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4, border: "1px solid var(--line)" }} />
              </a>
            )}
            {l.legacyCode} — {l.name} <span className="tag neutral" style={{ marginLeft: 6 }}>{l.reason}</span>
          </span>
          <span className="v tabular">{fmt(l.qty, 2)} {l.unitLabel ?? ""} · {money(l.amountAtWaste, 2)}</span>
        </div>
      ))}

      <div className="section-title">Value</div>
      <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Total Cost Impact</b></span><span className="v">{money(event.totalCost, 2)}</span></div>

      {canEdit && event.status === "DRAFT" && (
        <>
          <PostWastageDraftButton id={event.id} />
          <DeleteWastageDraftButton id={event.id} />
        </>
      )}
    </>
  );
}

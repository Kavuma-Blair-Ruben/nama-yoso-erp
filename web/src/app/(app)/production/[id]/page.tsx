import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProductionBatchDetail } from "@/server/db/queries/production";
import { CloseProductionButton } from "@/components/production/CloseProductionButton";
import { DeleteProductionDraftButton } from "@/components/production/DeleteProductionDraftButton";
import { ProductionTicketAutoPrint } from "@/components/production/ProductionTicketAutoPrint";
import { fmt, money, formatDurationMinutes } from "@/lib/format";

export default async function ProductionDetailPage({ params }: PageProps<"/production/[id]">) {
  const session = await requireSection("subrecipes", "view");
  const { id } = await params;
  const data = await getProductionBatchDetail(id);
  if (!data) notFound();
  const { batch, ingredients } = data;
  const canEdit = hasAccess(session, "subrecipes", "edit");
  const durationMinutes =
    batch.status === "CLOSED" && batch.postedAt ? Math.round((batch.postedAt.getTime() - batch.createdAt.getTime()) / 60000) : null;

  return (
    <>
      {batch.status === "OPEN" && (
        <ProductionTicketAutoPrint
          batch={{
            id: batch.id,
            batchNo: batch.batchNo,
            lotNo: batch.lotNo,
            name: batch.subRecipeName,
            legacyCode: batch.subRecipeCode,
            scaleMultiplier: batch.scaleMultiplier,
            yieldQty: batch.yieldQty,
            yieldUnit: batch.yieldUnit,
            producedDate: batch.producedDate,
            expiryDate: batch.expiryDate,
            storageInstructions: batch.storageInstructions,
            branchName: batch.branchName,
          }}
          alreadyPrinted={!!batch.openTicketPrintedAt}
        />
      )}
      <PageHeader
        title={batch.batchNo}
        subtitle={`${batch.subRecipeCode} — ${batch.subRecipeName} · ${batch.branchName ?? "-"} · ${batch.producedDate}`}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href={`/production/${batch.id}/labels`} className="btn ghost">Print Batch/Lot Labels</Link>
            {canEdit && <Link href={`/production/${batch.id}/clone`} className="btn ghost">Repeat</Link>}
            {canEdit && batch.status === "OPEN" && <Link href={`/production/${batch.id}/edit`} className="btn accent">Edit Ticket</Link>}
          </div>
        }
      />

      <div style={{ marginBottom: 14 }}>
        <span className={`status-badge ${batch.status === "OPEN" ? "status-draft" : "status-received"}`}>{batch.status}</span>
      </div>
      {batch.status === "OPEN" ? (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          Open — stock has not been updated yet. A ticket auto-printed when this was opened; scan its barcode anytime to close
          production, or print more copies from Batch/Lot Labels while producing (e.g. one per vacuum-sealed pack), then close this
          ticket to consume ingredient stock and credit the finished item&apos;s stock.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 12 }}>
          Closed batches are locked — ingredient and finished-item stock have already been updated and this record can&apos;t be edited.
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h3>Batch Details</h3></div>
        <div className="panel-body">
          <div className="field-row"><span className="k">Batch No.</span><span className="v mono-r">{batch.batchNo}</span></div>
          <div className="field-row"><span className="k">Lot No.</span><span className="v mono-r"><Link href={`/lots/${encodeURIComponent(batch.lotNo)}`}>{batch.lotNo}</Link></span></div>
          <div className="field-row"><span className="k">Scale multiplier</span><span className="v tabular">×{fmt(batch.scaleMultiplier, 2)}</span></div>
          <div className="field-row"><span className="k">Yield</span><span className="v tabular">{fmt(batch.yieldQty, 2)} {batch.yieldUnit ?? ""}</span></div>
          <div className="field-row"><span className="k">Expiry Date</span><span className="v">{batch.expiryDate ?? "Not recorded"}</span></div>
          {batch.storageInstructions && <div className="field-row"><span className="k">Storage</span><span className="v">{batch.storageInstructions}</span></div>}
          {batch.notes && <div className="field-row"><span className="k">Notes</span><span className="v">{batch.notes}</span></div>}
          {batch.status === "CLOSED" && (
            <>
              <div className="field-row"><span className="k">Closed by</span><span className="v">{batch.postedByName ?? "-"} · {batch.postedAt?.toISOString().slice(0, 10)}</span></div>
              <div className="field-row"><span className="k">Turnaround Time</span><span className="v tabular">{formatDurationMinutes(durationMinutes)} (open → close)</span></div>
            </>
          )}
        </div>
      </div>

      <div className="section-title">Ingredients Consumed</div>
      {ingredients.map((i) => (
        <div className="field-row" key={i.id}>
          <span className="k">{i.legacyCode} — {i.name}</span>
          <span className="v tabular">{fmt(i.qty, 2)} {i.unitLabel ?? ""} · {money(i.amountAtProduction, 2)}</span>
        </div>
      ))}

      <div className="section-title">Cost</div>
      <div className="field-row"><span className="k">Total Cost</span><span className="v tabular">{money(batch.totalCost, 2)}</span></div>
      <div className="field-row" style={{ fontSize: 14 }}><span className="k"><b>Cost per {batch.yieldUnit || "unit"}</b></span><span className="v">{money(batch.costPerUnit, 4)}</span></div>

      {canEdit && batch.status === "OPEN" && (
        <>
          <CloseProductionButton id={batch.id} />
          <DeleteProductionDraftButton id={batch.id} />
        </>
      )}
    </>
  );
}

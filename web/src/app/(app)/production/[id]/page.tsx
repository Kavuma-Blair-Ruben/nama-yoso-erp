import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProductionBatchDetail } from "@/server/db/queries/production";
import { PostProductionDraftButton } from "@/components/production/PostProductionDraftButton";
import { DeleteProductionDraftButton } from "@/components/production/DeleteProductionDraftButton";
import { fmt, money } from "@/lib/format";

export default async function ProductionDetailPage({ params }: PageProps<"/production/[id]">) {
  const session = await requireSection("subrecipes", "view");
  const { id } = await params;
  const data = await getProductionBatchDetail(id);
  if (!data) notFound();
  const { batch, ingredients } = data;
  const canEdit = hasAccess(session, "subrecipes", "edit");

  return (
    <>
      <PageHeader
        title={batch.batchNo}
        subtitle={`${batch.subRecipeCode} — ${batch.subRecipeName} · ${batch.branchName ?? "-"} · ${batch.producedDate}`}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href={`/production/${batch.id}/labels`} className="btn ghost">Print Receipt of Production</Link>
            {canEdit && <Link href={`/production/${batch.id}/clone`} className="btn ghost">Repeat</Link>}
            {canEdit && batch.status === "DRAFT" && <Link href={`/production/${batch.id}/edit`} className="btn accent">Edit Draft</Link>}
          </div>
        }
      />

      <div style={{ marginBottom: 14 }}>
        <span className={`status-badge ${batch.status === "DRAFT" ? "status-draft" : "status-received"}`}>{batch.status}</span>
      </div>
      {batch.status === "DRAFT" ? (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          Stock has not been updated yet — post this batch to consume ingredient stock and credit the finished item&apos;s stock.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 12 }}>
          Posted batches are locked — ingredient and finished-item stock have already been updated and this record can&apos;t be edited.
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
          {batch.status === "POSTED" && (
            <div className="field-row"><span className="k">Posted by</span><span className="v">{batch.postedByName ?? "-"} · {batch.postedAt?.toISOString().slice(0, 10)}</span></div>
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

      {canEdit && batch.status === "DRAFT" && (
        <>
          <PostProductionDraftButton id={batch.id} />
          <DeleteProductionDraftButton id={batch.id} />
        </>
      )}
    </>
  );
}

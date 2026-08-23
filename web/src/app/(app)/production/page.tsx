import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listProductionBatches } from "@/server/db/queries/production";
import { fmt, money } from "@/lib/format";

export default async function ProductionPage({ searchParams }: PageProps<"/production">) {
  const session = await requireSection("subrecipes", "view");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const rows = await listProductionBatches({ status });
  const canEdit = hasAccess(session, "subrecipes", "edit");
  const draftCount = rows.filter((b) => b.status === "DRAFT").length;

  return (
    <>
      <PageHeader
        title="Production"
        subtitle="Batch-produce stockable sub-recipes — consumes ingredient stock, credits the finished item's stock."
        action={canEdit ? <Link href="/production/new" className="btn accent">+ New Production Batch</Link> : undefined}
      />
      {draftCount > 0 && (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          {draftCount} batch(es) saved as draft — stock hasn&apos;t been updated for these yet. Open one to post it.
        </div>
      )}
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Batch No.</th>
                <th>Sub-Recipe</th>
                <th>Branch</th>
                <th>Produced Date</th>
                <th className="right">Yield</th>
                <th className="right">Total Cost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((b) => (
                  <tr key={b.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}>
                      <Link href={`/production/${b.id}`}>{b.batchNo}</Link>
                    </td>
                    <td>{b.subRecipeCode} — {b.subRecipeName}</td>
                    <td>{b.branchName ?? "-"}</td>
                    <td>{b.producedDate}</td>
                    <td className="mono-r">{fmt(b.yieldQty, 2)} {b.yieldUnit ?? ""}</td>
                    <td className="mono-r">{money(b.totalCost, 2)}</td>
                    <td><span className={`status-badge ${b.status === "DRAFT" ? "status-draft" : "status-received"}`}>{b.status}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={7}>No production batches yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

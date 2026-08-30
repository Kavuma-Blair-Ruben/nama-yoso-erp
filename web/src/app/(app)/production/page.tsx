import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listProductionBatches } from "@/server/db/queries/production";
import { ProductionScanClose } from "@/components/production/ProductionScanClose";
import { fmt, money, formatDurationMinutes } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

export default async function ProductionPage({ searchParams }: PageProps<"/production">) {
  const session = await requireSection("subrecipes", "view");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const rows = await withTimeout(listProductionBatches({ status }), 20000, "This is taking longer than expected — please try again in a moment.");
  const canEdit = hasAccess(session, "subrecipes", "edit");
  const openCount = rows.filter((b) => b.status === "OPEN").length;

  return (
    <>
      <PageHeader
        title="Production"
        subtitle="Batch-produce stockable sub-recipes — consumes ingredient stock, credits the finished item's stock."
        action={
          canEdit ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/production/suggestions" className="btn ghost">🍳 Auto Production</Link>
              <Link href="/production/new" className="btn accent">+ New Production Ticket</Link>
            </div>
          ) : undefined
        }
      />
      {openCount > 0 && (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          {openCount} ticket(s) still open — stock hasn&apos;t been updated for these yet. Open one to close it.
        </div>
      )}
      {canEdit && <ProductionScanClose />}
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Batch No.</th>
                <th>Sub-Recipe</th>
                <th>Branch</th>
                <th>Staff</th>
                <th>Produced Date</th>
                <th className="right">Yield</th>
                <th className="right">Total Cost</th>
                <th>Status</th>
                <th className="right">Turnaround</th>
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
                    <td>{b.staffName || "-"}</td>
                    <td>{b.producedDate}</td>
                    <td className="mono-r">{fmt(b.yieldQty, 2)} {b.yieldUnit ?? ""}</td>
                    <td className="mono-r">{money(b.totalCost, 2)}</td>
                    <td><span className={`status-badge ${b.status === "OPEN" ? "status-draft" : "status-received"}`}>{b.status}</span></td>
                    <td className="mono-r">
                      {b.status === "CLOSED" && b.postedAt ? formatDurationMinutes((b.postedAt.getTime() - b.createdAt.getTime()) / 60000) : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={9}>No production batches yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

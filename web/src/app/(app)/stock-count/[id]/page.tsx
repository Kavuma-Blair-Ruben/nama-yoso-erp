import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getStockCountDetail } from "@/server/db/queries/stockCount";
import { PostStockCountDraftButton } from "@/components/stockCount/PostStockCountDraftButton";
import { DeleteStockCountDraftButton } from "@/components/stockCount/DeleteStockCountDraftButton";
import { fmt, money } from "@/lib/format";

export default async function StockCountDetailPage({ params }: PageProps<"/stock-count/[id]">) {
  const session = await requireSection("stockcount", "view");
  const { id } = await params;
  const data = await getStockCountDetail(id);
  if (!data) notFound();
  const { stockCount, lines } = data;
  const canEdit = hasAccess(session, "stockcount", "edit");

  return (
    <>
      <PageHeader
        title={stockCount.countNo}
        subtitle={`${stockCount.costCenter ?? "-"} · ${stockCount.branchName ?? "-"} · ${stockCount.countDate}`}
        action={canEdit && stockCount.status === "DRAFT" ? <Link href={`/stock-count/${stockCount.id}/edit`} className="btn accent">Edit Draft</Link> : undefined}
      />

      <div style={{ marginBottom: 14 }}>
        <span className={`status-badge ${stockCount.status === "DRAFT" ? "status-draft" : "status-received"}`}>{stockCount.status}</span>
      </div>
      {stockCount.status === "DRAFT" ? (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          Stock has not been adjusted yet — post this count to apply variances to the ledger.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 12 }}>
          Posted stock counts are locked — variances have already been applied and this record can&apos;t be edited.
        </div>
      )}

      <div className="field-row">
        <span className="k">Total Variance Value</span>
        <span className="v">
          <span className={`tag ${Math.abs(stockCount.totalVarianceValue) < 0.01 ? "neutral" : stockCount.totalVarianceValue >= 0 ? "good" : "bad"}`}>{money(stockCount.totalVarianceValue, 2)}</span>
        </span>
      </div>
      {stockCount.status === "POSTED" && (
        <div className="field-row"><span className="k">Posted by</span><span className="v">{stockCount.postedByName ?? "-"} · {stockCount.postedAt?.toISOString().slice(0, 10)}</span></div>
      )}

      <div className="section-title">Items Counted</div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Item</th>
              <th className="right">System</th>
              <th className="right">Counted</th>
              <th className="right">Variance</th>
              <th className="right">Value</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const variance = l.countedQty != null ? l.countedQty - l.systemQty : null;
              const varianceValue = variance != null ? variance * (l.rateAtCount ?? 0) : null;
              return (
                <tr key={l.id}>
                  <td>{l.legacyCode} — {l.name}</td>
                  <td className="mono-r">{fmt(l.systemQty, 2)} {l.unitLabel ?? ""}</td>
                  <td className="mono-r">{l.countedQty != null ? `${fmt(l.countedQty, 2)} ${l.unitLabel ?? ""}` : "—"}</td>
                  <td className="mono-r">{variance == null ? "—" : `${variance >= 0 ? "+" : ""}${fmt(variance, 2)}`}</td>
                  <td className="mono-r">{varianceValue == null ? "—" : money(varianceValue, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && stockCount.status === "DRAFT" && (
        <>
          <PostStockCountDraftButton id={stockCount.id} />
          <DeleteStockCountDraftButton id={stockCount.id} />
        </>
      )}
    </>
  );
}

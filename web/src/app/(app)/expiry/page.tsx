import Link from "next/link";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listExpiringBatches, EXPIRY_BUCKET_ORDER, EXPIRY_BUCKET_LABELS, type ExpiryBucket } from "@/server/db/queries/expiry";
import { fmt } from "@/lib/format";
import { ExpiryTicketAutoPrint } from "@/components/expiry/ExpiryTicketAutoPrint";
import { ExtendExpiryButton } from "@/components/expiry/ExtendExpiryButton";
import { withTimeout } from "@/lib/withTimeout";

export default async function ExpiryPage({ searchParams }: PageProps<"/expiry">) {
  await requireSection("items", "view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const bucket = typeof sp.bucket === "string" ? (sp.bucket as ExpiryBucket) : "";

  const all = await withTimeout(listExpiringBatches(), 20000, "This is taking longer than expected — please try again in a moment.");
  const counts: Record<ExpiryBucket, number> = { EXPIRED: 0, TODAY: 0, TOMORROW: 0, "7 DAYS": 0, "15 DAYS": 0, "30 DAYS": 0, LATER: 0 };
  all.forEach((b) => counts[b.bucket]++);

  const rows = all.filter((b) => {
    if (q && !b.name.toLowerCase().includes(q)) return false;
    if (bucket && b.bucket !== bucket) return false;
    return true;
  });

  return (
    <>
      <PageHeader title="Expiry Tracking" subtitle="Batches received via GRN and produced in-house, tracked from today through already-expired." />

      {all.length === 0 ? (
        <>
          <div className="callout">
            No batches with expiry dates yet. This view fills in automatically as you receive stock through Goods Receiving (GRN) with
            expiry dates entered, or produce a batch from a sub-recipe with a shelf life set.
          </div>
          <div className="panel">
            <div className="panel-body" style={{ textAlign: "center", padding: 40, color: "var(--ink-faint)" }}>
              Receive your first GRN with an expiry date, or produce a batch, to see it tracked here.
            </div>
          </div>
        </>
      ) : (
        <>
          <ExpiryTicketAutoPrint
            items={all
              .filter((b) => b.bucket === "EXPIRED" && !b.ticketPrintedAt)
              .map((b) => ({ id: b.id, source: b.source, name: b.name, code: b.code, batchNo: b.batchNo, lotNo: b.lotNo, expiryDate: b.expiryDate, daysLeft: b.daysLeft, reference: b.reference }))}
          />
          <div className="kpi-grid">
            {EXPIRY_BUCKET_ORDER.map((b) => (
              <div className="kpi" key={b}>
                <div className="n" style={{ color: b === "EXPIRED" || b === "TODAY" ? "var(--bad)" : b === "TOMORROW" || b === "7 DAYS" ? "#8a6416" : "inherit" }}>
                  {counts[b]}
                </div>
                <div className="l">{EXPIRY_BUCKET_LABELS[b]}</div>
              </div>
            ))}
          </div>

          <div className="pill-tabs">
            <Link href="/expiry" className={`btn ${bucket === "" ? "" : "ghost"}`} style={{ borderRadius: 20 }}>All ({all.length})</Link>
            {EXPIRY_BUCKET_ORDER.filter((b) => counts[b] > 0).map((b) => (
              <Link key={b} href={`/expiry?bucket=${encodeURIComponent(b)}`} className={`btn ${bucket === b ? "" : "ghost"}`} style={{ borderRadius: 20 }}>
                {EXPIRY_BUCKET_LABELS[b]} ({counts[b]})
              </Link>
            ))}
          </div>

          <form className="filterbar" method="get">
            {bucket && <input type="hidden" name="bucket" value={bucket} />}
            <input type="text" name="q" placeholder="Search ingredient..." defaultValue={q} />
            <button className="btn ghost" type="submit">Search</button>
            <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>
              {rows.length} of {all.length} batches
            </span>
          </form>

          <div className="panel">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Kind</th>
                    <th className="right">Qty</th>
                    <th>Batch</th>
                    <th>Lot</th>
                    <th>Expiry</th>
                    <th className="right">Days Left</th>
                    <th>Supplier</th>
                    <th>Reference</th>
                    <th>Extend</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((b, i) => (
                      <tr key={i}>
                        <td><Link href={b.linkHref}>{b.name}</Link></td>
                        <td><span className={`tag ${b.kind === "Produced" ? "neutral" : ""}`}>{b.kind}</span></td>
                        <td className="mono-r">{fmt(b.qty, 2)} {b.unit ?? ""}</td>
                        <td className="mono-r" style={{ textAlign: "left" }}>{b.batchNo ?? "-"}</td>
                        <td className="mono-r" style={{ textAlign: "left" }}>{b.lotNo ?? "-"}</td>
                        <td>{b.expiryDate}</td>
                        <td className="right">
                          <span className={`tag ${b.bucket === "EXPIRED" || b.bucket === "TODAY" ? "bad" : b.bucket === "TOMORROW" || b.bucket === "7 DAYS" ? "neutral" : "good"}`}>
                            {b.daysLeft < 0 ? `expired ${Math.abs(b.daysLeft)}d ago` : `${b.daysLeft}d`}
                          </span>
                        </td>
                        <td>{b.supplier}</td>
                        <td className="mono-r" style={{ textAlign: "left" }}><Link href={b.linkHref}>{b.reference}</Link></td>
                        <td><ExtendExpiryButton id={b.id} source={b.source} extensionsLeft={b.extensionsLeft} /></td>
                      </tr>
                    ))
                  ) : (
                    <tr className="empty-row"><td colSpan={10}>No batches match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

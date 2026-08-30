import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listWastageEvents, getWastageStats } from "@/server/db/queries/wastage";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { money } from "@/lib/format";
import { DonutChart } from "@/components/charts/DonutChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { withTimeout } from "@/lib/withTimeout";

export default async function WastagePage({ searchParams }: PageProps<"/wastage">) {
  const session = await requireSection("wastage", "view");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const costCenterId = typeof sp.costCenterId === "string" ? sp.costCenterId : undefined;
  const [rows, stats, costCenters] = await withTimeout(
    Promise.all([listWastageEvents({ status, costCenterId }), getWastageStats({ costCenterId }), listAllActiveCostCenters()]),
    20000,
    "This is taking longer than expected — please try again in a moment."
  );
  const canEdit = hasAccess(session, "wastage", "edit");
  const draftCount = rows.filter((w) => w.status === "DRAFT").length;
  const filteredCostCenter = costCenterId ? costCenters.find((c) => c.id === costCenterId) : undefined;

  return (
    <>
      <PageHeader
        title="Wastage Tracking"
        subtitle="Spoilage, trimming and waste logged by section — deducts from the real stock ledger."
        action={canEdit ? <Link href="/wastage/new" className="btn accent">+ Log Wastage</Link> : undefined}
      />
      {costCenterId && (
        <div className="callout">
          Filtered to sector: <b>{filteredCostCenter?.name ?? costCenterId}</b> — <Link href="/wastage">clear filter</Link>
        </div>
      )}
      {draftCount > 0 && (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          {draftCount} log(s) saved as draft — stock hasn&apos;t been updated for these yet. Open one to post it.
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi"><div className="n">{money(stats.totalWaste, 0)}</div><div className="l">Total Wastage Value</div><div className="d">{stats.eventCount} logged item(s)</div></div>
        <div className="kpi"><div className="n">{money(stats.avgPerDay, 2)}</div><div className="l">Average per Day Logged</div><div className="d">{stats.days} days with entries</div></div>
        <div className="kpi"><div className="n">{stats.byReason[0]?.[0] ?? "—"}</div><div className="l">Top Reason</div><div className="d">{stats.byReason[0] ? money(stats.byReason[0][1], 0) : ""}</div></div>
        <div className="kpi"><div className="n">{stats.bySection[0]?.[0] ?? "—"}</div><div className="l">Highest-Waste Section</div><div className="d">{stats.bySection[0] ? money(stats.bySection[0][1], 0) : ""}</div></div>
      </div>

      {stats.eventCount === 0 ? (
        <div className="callout">No wastage posted yet — log your first wastage event to see stats here.</div>
      ) : (
        <>
          <div className="grid-2">
            <div className="panel">
              <div className="panel-head"><h3>Wastage by Reason</h3></div>
              <div className="panel-body chart-card">
                <DonutChart data={stats.byReason.map(([label, value]) => ({ label, value }))} format="money0" centerLabel="total" />
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><h3>Wastage by Section</h3></div>
              <div className="panel-body chart-card">
                <HorizontalBarChart data={stats.bySection.map(([label, value]) => ({ label, value }))} format="money0" color="var(--chart-3)" />
              </div>
            </div>
          </div>

          <div style={{ height: 16 }} />
          <div className="grid-2">
            <div className="panel">
              <div className="panel-head"><h3>Wastage by Category</h3></div>
              <div className="panel-body chart-card">
                <DonutChart data={stats.byCategory.map(([label, value]) => ({ label, value }))} format="money0" centerLabel="total" />
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><h3>Most Wasted Items</h3></div>
              <div className="panel-body chart-card">
                <HorizontalBarChart data={stats.topItems.map(([label, value]) => ({ label, value }))} format="money0" color="var(--chart-2)" />
              </div>
            </div>
          </div>
          <div style={{ height: 20 }} />
        </>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Log No.</th>
                <th>Section</th>
                <th>Branch</th>
                <th>Date</th>
                <th>Staff</th>
                <th className="right">Total Cost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((w) => (
                  <tr key={w.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}><Link href={`/wastage/${w.id}`}>{w.wastageNo}</Link></td>
                    <td>{w.costCenter}</td>
                    <td>{w.branchName ?? "-"}</td>
                    <td>{w.eventDate}</td>
                    <td>{w.staffName ?? "-"}</td>
                    <td className="mono-r">{money(w.totalCost, 2)}</td>
                    <td><span className={`status-badge ${w.status === "DRAFT" ? "status-draft" : "status-received"}`}>{w.status}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={7}>No wastage logged yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

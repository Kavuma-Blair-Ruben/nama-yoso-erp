import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listGrns, getEligiblePOsForReceiving } from "@/server/db/queries/grn";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { ReceiveAgainstPO } from "@/components/grn/ReceiveAgainstPO";
import { fmt, money } from "@/lib/format";

export default async function GrnPage({ searchParams }: PageProps<"/grn">) {
  const session = await requireSection("grn", "view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const costCenterId = typeof sp.costCenterId === "string" ? sp.costCenterId : undefined;
  const [rows, eligible, costCenters] = await Promise.all([listGrns({ q, costCenterId }), getEligiblePOsForReceiving(), listAllActiveCostCenters()]);
  const canEdit = hasAccess(session, "grn", "edit");
  const draftCount = rows.filter((g) => g.status === "DRAFT").length;
  const filteredCostCenter = costCenterId ? costCenters.find((c) => c.id === costCenterId) : undefined;

  return (
    <>
      <PageHeader
        title="Goods Receiving (GRN)"
        subtitle="Receive stock against purchase orders — batch, lot, and expiry capture."
        action={canEdit ? <Link href="/grn/new" className="btn accent">+ New Direct GRN (no LPO)</Link> : undefined}
      />
      {costCenterId && (
        <div className="callout">
          Filtered to sector: <b>{filteredCostCenter?.name ?? costCenterId}</b> — <Link href="/grn">clear filter</Link>
        </div>
      )}
      {draftCount > 0 && (
        <div className="callout" style={{ borderColor: "var(--accent)" }}>
          {draftCount} GRN(s) saved as draft — stock hasn&apos;t been updated for these yet. Open one to post it.
        </div>
      )}
      <form className="filterbar" method="get">
        {costCenterId && <input type="hidden" name="costCenterId" value={costCenterId} />}
        <input type="text" name="q" placeholder="Search GRN, PO or supplier..." defaultValue={q ?? ""} />
        {canEdit && <ReceiveAgainstPO eligible={eligible} />}
        <button className="btn ghost" type="submit">Search</button>
      </form>
      {eligible.length === 0 && (
        <div className="callout">
          No purchase orders are ready to receive against. An LPO must be marked <b>Ordered</b> before you can create
          a GRN against it — go to Purchase Orders to move one forward, or use &quot;New Direct GRN&quot; if stock
          genuinely arrived without one.
        </div>
      )}
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>GRN Number</th>
                <th>LPO Number</th>
                <th>Supplier</th>
                <th>Received Date</th>
                <th>Invoice #</th>
                <th className="right">Net</th>
                <th className="right">VAT</th>
                <th className="right">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((g) => (
                  <tr key={g.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}>
                      <Link href={`/grn/${g.id}`}>{g.grnNumber}</Link>
                    </td>
                    <td className="mono-r" style={{ textAlign: "left" }}>{g.poNumber ?? "(no LPO)"}</td>
                    <td>{g.supplier}</td>
                    <td>{g.receivedDate}</td>
                    <td>{g.invoiceNumber ?? "-"}</td>
                    <td className="mono-r">{fmt(g.net, 2)}</td>
                    <td className="mono-r">{fmt(g.vat, 2)}</td>
                    <td className="mono-r">{money(g.total, 2)}</td>
                    <td><span className={`status-badge ${g.status === "DRAFT" ? "status-draft" : "status-received"}`}>{g.status}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={9}>No goods received yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

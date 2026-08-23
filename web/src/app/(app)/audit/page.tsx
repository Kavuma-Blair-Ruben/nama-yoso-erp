import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listAuditLog, listAuditEntityTypes } from "@/server/db/queries/audit";

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requireSection("system", "view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const entity = typeof sp.entity === "string" ? sp.entity : undefined;
  const [rows, entities] = await Promise.all([listAuditLog({ q, entity }), listAuditEntityTypes()]);

  return (
    <>
      <PageHeader title="Audit Trail" subtitle="Every price change, purchase order, goods receipt, and posted transaction — who changed what, and when." />
      <div className="callout">
        Every price change, purchase order creation/status change, goods receipt, and posted wastage/transfer/production/stock-count
        event made in this system is logged here automatically — nothing here can be edited or deleted from the UI.
      </div>
      <form className="filterbar" method="get">
        <input type="text" name="q" placeholder="Search action, item, or detail..." defaultValue={q ?? ""} />
        <select name="entity" defaultValue={entity ?? ""}>
          <option value="">All types</option>
          {entities.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <button className="btn ghost" type="submit">Search</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} event(s)</span>
      </form>
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Type</th>
                <th>Item</th>
                <th>Detail</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((a) => (
                  <tr key={a.id}>
                    <td className="mono-r" style={{ textAlign: "left", whiteSpace: "nowrap" }}>{a.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td><span className="tag neutral">{a.action}</span></td>
                    <td>{a.entity ?? "-"}</td>
                    <td>{a.entityLabel ?? "-"}</td>
                    <td style={{ color: "var(--ink-soft)" }}>{a.detail ?? ""}</td>
                    <td>{a.actorName ?? "-"}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No activity logged yet — actions like price changes, purchase orders, and goods receipts will appear here as you use the system.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

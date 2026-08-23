import Link from "next/link";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listAllSupplierReturns } from "@/server/db/queries/grn";
import { money } from "@/lib/format";

export default async function SupplierReturnsPage() {
  await requireSection("grn", "view");
  const returns = await listAllSupplierReturns();

  return (
    <>
      <PageHeader title="Supplier Returns" subtitle="Stock physically returned to a supplier against a posted GRN — open the GRN to create a new one." />
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Return</th>
                <th>GRN</th>
                <th>Supplier</th>
                <th>Reason</th>
                <th className="right">Value</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {returns.length ? (
                returns.map((r) => (
                  <tr key={r.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}>{r.number}</td>
                    <td><Link href={`/grn/${r.grnId}`}>{r.grnNumber}</Link></td>
                    <td>{r.supplierName}</td>
                    <td style={{ maxWidth: 280 }}>{r.reason}</td>
                    <td className="mono-r">{money(r.value, 2)}</td>
                    <td>{r.createdAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={6}>No supplier returns yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

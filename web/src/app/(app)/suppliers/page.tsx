import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listSuppliers } from "@/server/db/queries/suppliers";
import { Stars } from "@/components/suppliers/Stars";
import { SuppliersCsvImport } from "@/components/suppliers/SuppliersCsvImport";
import { fmt, money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

export default async function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  const session = await requireSection("suppliers", "view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const view = typeof sp.view === "string" ? sp.view : undefined;
  // Not statement_timeout — confirmed unreliable through Supabase's
  // transaction-mode pooler. Throws into (app)/error.tsx on timeout.
  const allList = await withTimeout(listSuppliers(q), 20000, "This is taking longer than expected — please try again in a moment.");
  const list =
    view === "top5"
      ? allList.filter((s) => s.totalSpend > 0).slice(0, 5)
      : view === "lowquality"
        ? allList.filter((s) => s.qualityPct != null && s.qualityPct < 90)
        : allList;
  const canEdit = hasAccess(session, "suppliers", "edit");

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="Spend, payables and item history by supplier, from your live purchase ledger."
        action={
          canEdit ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <SuppliersCsvImport />
              <Link href="/suppliers/new" className="btn accent">+ Add Supplier</Link>
            </div>
          ) : undefined
        }
      />
      <form className="filterbar" method="get">
        {view && <input type="hidden" name="view" value={view} />}
        <input type="text" name="q" placeholder="Search supplier..." defaultValue={q ?? ""} />
        <button className="btn ghost" type="submit">Search</button>
        <span style={{ alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>{list.length} supplier(s)</span>
      </form>
      {view && (
        <div className="callout">
          {view === "top5" ? "Showing your top 5 suppliers by spend." : "Showing suppliers below 90% quality."}{" "}
          <Link href={q ? `/suppliers?q=${encodeURIComponent(q)}` : "/suppliers"}>Clear filter</Link>
        </div>
      )}
      <div className="callout">
        Spend and payables come from your purchase ledger. Quality and star ratings are computed from actual Goods
        Receiving (GRN) records, so a supplier only gets a rating once you&apos;ve received something from them
        through the system.
      </div>
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Rating</th>
                <th className="right">Total Spend</th>
                <th className="right">Outstanding</th>
                <th className="right">Deliveries</th>
                <th className="right">Quality %</th>
                <th className="right">Avg Lead Time</th>
              </tr>
            </thead>
            <tbody>
              {list.length ? (
                list.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/suppliers/${s.id}`}>{s.name}</Link></td>
                    <td><Stars stars={s.stars} /></td>
                    <td className="mono-r">{s.totalSpend > 0 ? money(s.totalSpend, 0) : "—"}</td>
                    <td className="mono-r">{s.outstanding > 0 ? <span className="tag bad">{fmt(s.outstanding, 0)}</span> : "—"}</td>
                    <td className="mono-r">{s.deliveryCount || "—"}</td>
                    <td className="mono-r">{s.qualityPct != null ? fmt(s.qualityPct, 0) + "%" : "—"}</td>
                    <td className="mono-r">{s.avgLeadTimeDays != null ? fmt(s.avgLeadTimeDays, 1) + "d" : "—"}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={7}>{view ? "No suppliers match this filter." : "No suppliers match this search."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

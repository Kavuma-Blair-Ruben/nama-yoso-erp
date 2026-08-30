import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listMenuCombos } from "@/server/db/queries/recipes";
import { money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

export default async function MenuCombosPage() {
  const session = await requireSection("recipes", "view");
  const combos = await withTimeout(listMenuCombos(), 20000, "This is taking longer than expected — please try again in a moment.");
  const canEdit = hasAccess(session, "recipes", "edit");

  const byCategory = new Map<string, typeof combos>();
  for (const c of combos) byCategory.set(c.section, [...(byCategory.get(c.section) ?? []), c]);
  const groups = [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <>
      <PageHeader
        title="Menu Combos"
        subtitle="Bundles of other dishes — costed and inventory-tracked the same way as any recipe."
        action={canEdit ? <Link href="/recipes/new?type=main&kind=combo" className="btn accent">+ New Combo</Link> : undefined}
      />
      {groups.length === 0 ? (
        <div className="callout">
          No combos yet — create a Main Recipe and check &quot;This is a Combo&quot; in Recipe Costing, or click + New Combo above.
        </div>
      ) : (
        groups.map(([category, items]) => (
          <div key={category} style={{ marginBottom: 24 }}>
            <div className="section-title">{category}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {items.map((c) => (
                <Link key={c.code} href={`/recipes/main/${c.code}`} className="panel" style={{ padding: 0, overflow: "hidden", textDecoration: "none", color: "inherit" }}>
                  <div style={{ height: 100, background: "var(--panel-2, #f2f2f2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {c.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.photoUrl} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 24, opacity: 0.3 }}>🍱</span>
                    )}
                  </div>
                  <div style={{ padding: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>{c.code}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12.5 }}>
                      <span style={{ color: "var(--ink-soft)" }}>Cost {money(c.perUnit, 2)}</span>
                      <span style={{ fontWeight: 600 }}>{c.sellingPrice != null ? money(c.sellingPrice, 2) : "—"}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}

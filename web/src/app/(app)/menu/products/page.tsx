import Link from "next/link";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listMenuProducts } from "@/server/db/queries/recipes";
import { money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

export default async function MenuProductsPage() {
  await requireSection("recipes", "view");
  const groups = await withTimeout(listMenuProducts(), 20000, "This is taking longer than expected — please try again in a moment.");

  return (
    <>
      <PageHeader title="Menu Products" subtitle="Your Main Recipes as customers see them — grouped by category, with live cost and selling price." />
      {groups.length === 0 ? (
        <div className="callout">No main recipes yet — add one from Recipe Costing first.</div>
      ) : (
        groups.map((g) => (
          <div key={g.category} style={{ marginBottom: 24 }}>
            <div className="section-title">{g.category}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {g.items.map((p) => (
                <Link
                  key={p.code}
                  href={`/recipes/main/${p.code}`}
                  className="panel"
                  style={{ padding: 0, overflow: "hidden", textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ height: 120, background: "var(--panel-2, #f2f2f2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photoUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 28, opacity: 0.3 }}>🍽</span>
                    )}
                  </div>
                  <div style={{ padding: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>{p.code}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12.5 }}>
                      <span style={{ color: "var(--ink-soft)" }}>Cost {money(p.perUnit, 2)}</span>
                      <span style={{ fontWeight: 600 }}>{p.sellingPrice != null ? money(p.sellingPrice, 2) : "—"}</span>
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

import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listMenuModifiers } from "@/server/db/queries/recipes";
import { money } from "@/lib/format";
import { withTimeout } from "@/lib/withTimeout";

export default async function MenuModifiersPage() {
  const session = await requireSection("recipes", "view");
  const modifiers = await withTimeout(listMenuModifiers(), 20000, "This is taking longer than expected — please try again in a moment.");
  const canEdit = hasAccess(session, "subrecipes", "edit");

  const byCategory = new Map<string, typeof modifiers>();
  for (const m of modifiers) byCategory.set(m.section, [...(byCategory.get(m.section) ?? []), m]);
  const groups = [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <>
      <PageHeader
        title="Menu Modifiers"
        subtitle="Order-time add-ons — costed and inventory-tracked the same way as any recipe."
        action={canEdit ? <Link href="/recipes/new?type=sub&kind=modifier" className="btn accent">+ New Modifier</Link> : undefined}
      />
      {groups.length === 0 ? (
        <div className="callout">
          No modifiers yet — create a Sub-Recipe and check &quot;This is a Modifier&quot; in Recipe Costing, or click + New Modifier above.
        </div>
      ) : (
        groups.map(([category, items]) => (
          <div key={category} style={{ marginBottom: 24 }}>
            <div className="section-title">{category}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {items.map((m) => (
                <Link key={m.code} href={`/recipes/sub/${m.code}`} className="panel" style={{ padding: 14, textDecoration: "none", color: "inherit" }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>{m.code}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 8 }}>Cost {money(m.perUnit, 2)}</div>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}

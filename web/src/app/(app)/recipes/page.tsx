import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listRecipesWithCost, type RecipeType } from "@/server/db/queries/recipes";
import { RecipesCsvImport } from "@/components/recipes/RecipesCsvImport";
import { fmt, money, pct } from "@/lib/format";

type PageTab = "main" | "sub" | "modifier" | "combo";
const TAB_LABELS: Record<PageTab, string> = { main: "Main Recipes", sub: "Sub-Recipes", modifier: "Modifiers", combo: "Combos" };
// Modifiers/Combos aren't new recipe types — they're existing Main/Sub
// Recipes flagged as order-time add-ons/bundles (see schema.ts isModifier/
// isCombo comments) — this just maps the page's 4 tabs onto the 2 real
// underlying RecipeType values plus the onlyFlagged filter.
function underlyingType(tab: PageTab): RecipeType {
  return tab === "sub" || tab === "modifier" ? "sub" : "main";
}

export default async function RecipesPage({ searchParams }: PageProps<"/recipes">) {
  const session = await requireSection("recipes", "view");
  const sp = await searchParams;
  const tab: PageTab = sp.tab === "sub" || sp.tab === "modifier" || sp.tab === "combo" ? sp.tab : "main";
  const type = underlyingType(tab);
  const onlyFlagged = tab === "modifier" || tab === "combo";
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const section = typeof sp.section === "string" ? sp.section : undefined;

  const { rows, totalCount, sections } = await listRecipesWithCost(type, { q, section, onlyFlagged });
  const unreliableCount = rows.filter((r) => r.unreliableYield).length;
  const canEdit = hasAccess(session, type === "main" ? "recipes" : "subrecipes", "edit");

  return (
    <>
      <PageHeader
        title="Recipe Costing"
        subtitle="Main recipes and sub-recipes, costed live against current ingredient prices."
        action={
          canEdit ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <RecipesCsvImport />
              <Link href={`/recipes/new?type=${type}${onlyFlagged ? `&kind=${tab}` : ""}`} className="btn accent">
                + New {tab === "modifier" ? "Modifier" : tab === "combo" ? "Combo" : tab === "main" ? "Main Recipe" : "Sub-Recipe"}
              </Link>
            </div>
          ) : undefined
        }
      />

      <div className="pill-tabs">
        {(Object.keys(TAB_LABELS) as PageTab[]).map((t) => (
          <Link key={t} href={`/recipes?tab=${t}`} className={`btn ${tab === t ? "" : "ghost"}`} style={{ borderRadius: 20 }}>
            {TAB_LABELS[t]}
          </Link>
        ))}
      </div>

      <form className="filterbar" method="get">
        <input type="hidden" name="tab" value={tab} />
        <input type="text" name="q" placeholder="Search recipe name or code..." defaultValue={q ?? ""} />
        <select name="section" defaultValue={section ?? ""}>
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn ghost" type="submit">Filter</button>
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--ink-soft)" }}>
          {rows.length} of {totalCount}
        </span>
      </form>

      {unreliableCount > 0 && (
        <div className="callout" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad)" }}>
          {unreliableCount} recipe(s) below have a batch yield under 1 piece recorded in the source data — that&apos;s
          not a real portion count, so cost is shown per prep instead.
        </div>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Section</th>
                <th className="right">Final Yield</th>
                <th className="right">Cost / Unit (live)</th>
                {type === "sub" && <th className="right">Cost / KG-LTR</th>}
                <th className="right">Original Cost</th>
                <th className="right">Variance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.code}>
                    <td className="mono-r" style={{ textAlign: "left" }}>
                      <Link href={`/recipes/${type}/${r.code}`}>{r.code}</Link>
                    </td>
                    <td>
                      <Link href={`/recipes/${type}/${r.code}`}>{r.name}</Link>
                      {r.unreliableYield && <span className="tag bad" style={{ marginLeft: 4 }}>yield?</span>}
                    </td>
                    <td>{r.section ?? "-"}</td>
                    <td className="mono-r">{type === "main" ? "1 portion" : r.unreliableYield ? "1 prep" : `${fmt(r.yieldQty, 3)} ${r.yieldUnit ?? ""}`}</td>
                    <td className="mono-r">{money(r.perUnit)}</td>
                    {type === "sub" && <td className="mono-r">{r.perKgLtr != null ? money(r.perKgLtr, 2) : "—"}</td>}
                    <td className="mono-r">{money(r.origPerUnit)}</td>
                    <td className="right">
                      {Math.abs(r.variancePct) > 0.01 ? (
                        <span className={`tag ${r.variancePct >= 0 ? "bad" : "good"}`}>{pct(r.variancePct)}</span>
                      ) : (
                        <span className="tag neutral">—</span>
                      )}
                    </td>
                    <td className="right">{r.missingCount > 0 && <span className="tag bad">{r.missingCount} unlinked</span>}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row">
                  <td colSpan={9}>No recipes match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

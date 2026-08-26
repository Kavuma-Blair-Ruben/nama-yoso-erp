import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductFilters } from "@/components/products/ProductFilters";
import { ScanToProduct } from "@/components/products/ScanToProduct";
import { ProductsCsvImport } from "@/components/products/ProductsCsvImport";
import { listProducts, listCategoriesForFilter, listSubcategoriesForFilter, listSuppliersForFilter, STORAGE_TYPES } from "@/server/db/queries/products";
import { fmt } from "@/lib/format";
import { categorizeUnit, canonicalUnitLabel } from "@/lib/unitMath";

function onHandUnitLabel(issueUnit: string | null) {
  const cat = categorizeUnit(issueUnit);
  return cat === "weight" ? "KG" : cat === "volume" ? "L" : issueUnit ?? "PC";
}

// Produced (sub-recipe) stock items don't have a real supplier pack — their
// purchaseUnit/purchaseRate columns are often leftover/inconsistent labels
// (e.g. "G" next to a rate that's actually per-KG), so their storage-unit
// price falls back to the canonical rate/unit instead of trusting those
// fields verbatim. Same rule as the Stock report's Cost column.
function storageUnitPrice(p: { sourceType: string; purchaseRate: number | null; purchaseUnit: string | null; ratePerKgL: number | null; issueUnit: string | null }) {
  if (p.sourceType === "purchased" && p.purchaseRate != null) {
    return { value: p.purchaseRate, unit: p.purchaseUnit || canonicalUnitLabel(p.issueUnit) };
  }
  return { value: p.ratePerKgL, unit: canonicalUnitLabel(p.issueUnit) };
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const session = await requireSection("items", "view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const category = typeof sp.cat === "string" ? sp.cat : undefined;
  const subcategory = typeof sp.sub === "string" ? sp.sub : undefined;
  const storage = typeof sp.st === "string" ? sp.st : undefined;
  const supplier = typeof sp.sup === "string" ? sp.sup : undefined;

  const [rows, categories, subcategories, suppliers] = await Promise.all([
    listProducts({ q, category, subcategory, storage, supplier }),
    listCategoriesForFilter(),
    listSubcategoriesForFilter(),
    listSuppliersForFilter(),
  ]);
  const canEdit = hasAccess(session, "items", "edit");

  return (
    <>
      <PageHeader
        title="Product Master"
        subtitle="SKUs from your live inventory master — unit conversions, costing, sourcing."
        action={
          canEdit ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <ProductsCsvImport />
              <Link href="/products/new" className="btn accent">+ Add Product</Link>
            </div>
          ) : undefined
        }
      />
      <ScanToProduct />
      <ProductFilters
        categories={categories.map((c) => c.name)}
        subcategories={subcategories.map((s) => s.name)}
        suppliers={suppliers.map((s) => s.name)}
        storageTypes={STORAGE_TYPES}
      />
      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Product</th>
                <th>Category</th>
                <th>Subcategory</th>
                <th>Storage</th>
                <th>Supplier</th>
                <th>Storage Unit</th>
                <th className="right">Storage Unit Price</th>
                <th className="right">Rate / KG·L</th>
                <th className="right">Rate / g·ml</th>
                <th className="right">On Hand</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((p) => (
                  <tr key={p.id}>
                    <td className="mono-r" style={{ textAlign: "left" }}>
                      <Link href={`/products/${p.legacyCode}`}>{p.legacyCode}</Link>
                    </td>
                    <td>
                      <Link href={`/products/${p.legacyCode}`}>{p.name}</Link>
                      {p.priceChangeCount > 0 && <span className="tag good" style={{ marginLeft: 6 }}>edited</span>}
                    </td>
                    <td>{p.category ?? "-"}</td>
                    <td>{p.subcategory ?? "-"}</td>
                    <td>{p.storageType ?? "-"}</td>
                    <td style={{ maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.supplier ?? "-"}</td>
                    <td>{p.sourceType === "purchased" ? (p.purchaseUnit ?? "-") : canonicalUnitLabel(p.issueUnit)}</td>
                    <td className="mono-r">
                      {(() => {
                        const sup = storageUnitPrice(p);
                        return sup.value != null ? `${fmt(sup.value, 2)} / ${sup.unit}` : "-";
                      })()}
                    </td>
                    <td className="mono-r">{p.ratePerKgL != null ? fmt(p.ratePerKgL, 2) : "-"}</td>
                    <td className="mono-r">{p.ratePerGMl != null ? fmt(p.ratePerGMl, 4) : "-"}</td>
                    <td className="mono-r">{fmt(p.qtyOnHand, 2)} {onHandUnitLabel(p.issueUnit)}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row">
                  <td colSpan={11}>No products match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length >= 600 && (
          <div style={{ padding: "10px 18px", fontSize: 11.5, color: "var(--ink-faint)" }}>
            Showing first 600 results — narrow your search to see more.
          </div>
        )}
      </div>
    </>
  );
}

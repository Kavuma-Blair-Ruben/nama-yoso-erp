import Link from "next/link";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductFilters } from "@/components/products/ProductFilters";
import { ScanToProduct } from "@/components/products/ScanToProduct";
import { ProductsCsvImport } from "@/components/products/ProductsCsvImport";
import { listProducts, listCategoriesForFilter, listSubcategoriesForFilter, listSuppliersForFilter, STORAGE_TYPES } from "@/server/db/queries/products";
import { fmt } from "@/lib/format";
import { categorizeUnit } from "@/lib/unitMath";

function onHandUnitLabel(issueUnit: string | null) {
  const cat = categorizeUnit(issueUnit);
  return cat === "weight" ? "KG" : cat === "volume" ? "L" : issueUnit ?? "PC";
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
                <th>Purchase Unit</th>
                <th className="right">Rate</th>
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
                    <td>{p.purchaseUnit ?? "-"}</td>
                    <td className="mono-r">{fmt(p.purchaseRate)}</td>
                    <td className="mono-r">{p.ratePerGMl != null ? fmt(p.ratePerGMl, 4) : "-"}</td>
                    <td className="mono-r">{fmt(p.qtyOnHand, 2)} {onHandUnitLabel(p.issueUnit)}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row">
                  <td colSpan={10}>No products match these filters.</td>
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

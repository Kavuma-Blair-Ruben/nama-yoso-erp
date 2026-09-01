import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProductByCode, listAccountingCategories, listSuppliersForFilter } from "@/server/db/queries/products";
import { UpdateRateForm } from "@/components/products/UpdateRateForm";
import { VariantsPanel } from "@/components/products/VariantsPanel";
import { ItemSetupPanel } from "@/components/products/ItemSetupPanel";
import { fmt, money } from "@/lib/format";
import { categorizeUnit } from "@/lib/unitMath";
import { withTimeout } from "@/lib/withTimeout";

export default async function ProductDetailPage({ params }: PageProps<"/products/[code]">) {
  const session = await requireSection("items", "view");
  const { code } = await params;
  const [data, accountingCategories, supplierOptions] = await withTimeout(Promise.all([
    getProductByCode(code),
    listAccountingCategories(),
    listSuppliersForFilter(),
  ]), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { item, variants, history, usedIn, stockByBranch } = data;
  const canEdit = hasAccess(session, "items", "edit");
  const onHandUnitCat = categorizeUnit(item.issueUnit);
  const onHandUnit = onHandUnitCat === "weight" ? "KG" : onHandUnitCat === "volume" ? "L" : item.issueUnit ?? "PC";
  const totalOnHand = stockByBranch.reduce((s, b) => s + b.qtyOnHand, 0);

  return (
    <>
      <PageHeader
        title={item.name}
        subtitle={`${item.legacyCode} · ${item.category ?? "-"}${item.subcategory ? " · " + item.subcategory : ""}`}
        backHref="/products"
        backLabel="Product Master"
        action={<Link href={`/products/${item.legacyCode}/labels`} className="btn ghost">Print Barcode / Labels</Link>}
      />

      <div className="grid-2">
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head"><h3>Sourcing</h3></div>
            <div className="panel-body">
              <div className="field-row"><span className="k">Supplier</span><span className="v">{item.supplier ?? "-"}</span></div>
              <div className="field-row"><span className="k">Storage location</span><span className="v">{item.storageType ?? "-"}</span></div>
              <div className="field-row"><span className="k">Source</span><span className="v">{item.sourceType === "produced" ? "Produced (sub-recipe)" : "Purchased"}</span></div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head"><h3>Stock on Hand</h3></div>
            <div className="panel-body">
              <div className="field-row"><span className="k"><b>Total</b></span><span className="v tabular"><b>{fmt(totalOnHand, 2)} {onHandUnit}</b></span></div>
              {stockByBranch.length ? (
                stockByBranch.map((b) => (
                  <div className="field-row" key={b.branchId}><span className="k">{b.branchName}</span><span className="v tabular">{fmt(b.qtyOnHand, 2)} {onHandUnit}</span></div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>No GRN receipts or production output recorded for this item yet.</div>
              )}
            </div>
          </div>

          <ItemSetupPanel item={item} accountingCategories={accountingCategories} canEdit={canEdit} />

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head"><h3>Unit Conversion</h3></div>
            <div className="panel-body">
              <div className="field-row"><span className="k">Purchase unit</span><span className="v">{item.purchaseUnit ?? "-"}</span></div>
              <div className="field-row"><span className="k">Recipe/Ingredient unit</span><span className="v">{item.issueUnit ?? "-"}</span></div>
              <div className="field-row"><span className="k">Unit weight</span><span className="v">{fmt(item.unitWeight, 0)} {item.issueUnit ?? ""}</span></div>
              <div className="field-row"><span className="k">Yield %</span><span className="v">{item.yieldPct != null ? fmt(item.yieldPct * 100, 1) + "%" : "-"}</span></div>
              <div className="field-row"><span className="k">Net recovery</span><span className="v">{fmt(item.netRecoveredQty, 0)} {item.issueUnit ?? ""}</span></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Packaging &amp; Supplier Options</h3></div>
            <div className="panel-body">
              <div className="usedin-item" style={{ cursor: "default" }}>
                <span className="name">{item.purchaseUnit ?? "Default"}</span>
                <span className="code">{item.supplier ?? "No supplier set"} &middot; {fmt(item.purchaseRate, 2)}</span>
              </div>
              {canEdit ? (
                <VariantsPanel code={item.legacyCode} stockItemId={item.id} variants={variants} suppliers={supplierOptions.map((s) => s.name)} />
              ) : (
                variants.map((v) => (
                  <div className="usedin-item" key={v.id}>
                    <span className="name">{v.purchaseUnit}</span>
                    <span className="code">{v.supplierName} &middot; {fmt(v.rate, 2)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head"><h3>Costing</h3></div>
            <div className="panel-body">
              <div className="field-row"><span className="k">Rate per purchase unit</span><span className="v">{fmt(item.purchaseRate)}</span></div>
              <div className="field-row"><span className="k">Rate per KG/L</span><span className="v">{fmt(item.ratePerKgL)}</span></div>
              <div className="field-row"><span className="k">Rate per g/ml</span><span className="v">{item.ratePerGMl != null ? fmt(item.ratePerGMl, 4) : "-"}</span></div>
            </div>
          </div>

          {canEdit && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-head"><h3>Update Price</h3></div>
              <div className="panel-body">
                <UpdateRateForm code={item.legacyCode} currentRate={item.purchaseRate} />
              </div>
            </div>
          )}

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head"><h3>Price History</h3></div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="data">
                <tbody>
                  {history.length ? (
                    history.map((h) => (
                      <tr key={h.id}>
                        <td>{h.changedAt.toISOString().slice(0, 10)}</td>
                        <td className="mono-r">{fmt(h.oldRate)} → {fmt(h.newRate)}</td>
                        <td>{h.reason ?? "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="empty-row"><td colSpan={3}>No price changes recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Used In ({usedIn.length})</h3>
              {canEdit && (
                <Link href={`/products/${item.legacyCode}/swap`} className="btn ghost" style={{ fontSize: 11.5 }}>
                  🔁 Replace Everywhere
                </Link>
              )}
            </div>
            <div className="panel-body">
              {usedIn.length ? (
                usedIn.slice(0, 40).map((u) => (
                  <Link key={u.type + u.code} href={`/recipes/${u.type}/${u.code}`} className="usedin-item">
                    <span className="name">{u.name}</span>
                    <span className="code">{u.type === "main" ? "Recipe" : "Sub-recipe"} &middot; {u.code}</span>
                  </Link>
                ))
              ) : (
                <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Not referenced by any recipe on file.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

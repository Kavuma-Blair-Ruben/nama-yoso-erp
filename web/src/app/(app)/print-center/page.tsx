import Link from "next/link";
import { requireAuth } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listProducts } from "@/server/db/queries/products";
import { listGrns } from "@/server/db/queries/grn";
import { listPurchaseOrders } from "@/server/db/queries/purchaseOrders";
import { listRecipesForPrintCenter } from "@/server/db/queries/recipes";
import { listProductionBatches } from "@/server/db/queries/production";

function HiddenFields({ values }: { values: Record<string, string> }) {
  return (
    <>
      {Object.entries(values).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
    </>
  );
}

export default async function PrintCenterPage({ searchParams }: PageProps<"/print-center">) {
  await requireAuth(); // directory of links only — each destination print page enforces its own section gate

  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const pq = str("pq");
  const gq = str("gq");
  const poq = str("poq");
  const rq = str("rq");
  const pbq = str("pbq");
  const otherOf = (skip: string) => ({ pq, gq, poq, rq, pbq, [skip]: "" });

  const [products, grnsAll, posAll, recipes, batchesAll] = await Promise.all([
    pq ? listProducts({ q: pq }) : Promise.resolve([]),
    listGrns({ q: gq || undefined }),
    listPurchaseOrders({ q: poq || undefined }),
    listRecipesForPrintCenter(rq || undefined),
    listProductionBatches({ q: pbq || undefined }),
  ]);

  const grnRows = gq ? grnsAll.slice(0, 30) : grnsAll.slice(0, 15);
  const poRows = poq ? posAll.slice(0, 30) : posAll.slice(0, 15);
  const batchRows = pbq ? batchesAll.slice(0, 30) : batchesAll.slice(0, 15);
  const productRows = products.slice(0, 30);
  const recipeRows = recipes.slice(0, 30);

  return (
    <>
      <PageHeader
        title="Print Center"
        subtitle="Find any product, GRN, purchase order, recipe or production batch and jump straight to its print view — use your browser's Print → Save as PDF from there."
      />

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h3>🏷 Product Barcode Labels</h3></div>
        <div className="panel-body">
          <form className="filterbar" method="get">
            <HiddenFields values={otherOf("pq")} />
            <input type="text" name="pq" placeholder="Search product code or name..." defaultValue={pq} />
            <button className="btn ghost" type="submit">Search</button>
          </form>
          {!pq && <div style={{ fontSize: 12, color: "var(--ink-faint)", padding: "8px 0" }}>Type a product code or name to find its label print page.</div>}
          {pq && (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Code</th><th>Name</th><th></th></tr></thead>
                <tbody>
                  {productRows.length ? (
                    productRows.map((p) => (
                      <tr key={p.id}>
                        <td className="mono-r" style={{ textAlign: "left" }}>{p.legacyCode}</td>
                        <td>{p.name}</td>
                        <td className="right"><Link href={`/products/${p.legacyCode}/labels`} className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }}>Print Labels</Link></td>
                      </tr>
                    ))
                  ) : (
                    <tr className="empty-row"><td colSpan={3}>No products match &quot;{pq}&quot;.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h3>📦 Goods Received Notes &amp; Lot Labels</h3></div>
        <div className="panel-body">
          <form className="filterbar" method="get">
            <HiddenFields values={otherOf("gq")} />
            <input type="text" name="gq" placeholder="Search GRN number or supplier..." defaultValue={gq} />
            <button className="btn ghost" type="submit">Search</button>
          </form>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>GRN #</th><th>Supplier</th><th>Date</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {grnRows.length ? (
                  grnRows.map((g) => (
                    <tr key={g.id}>
                      <td className="mono-r" style={{ textAlign: "left" }}>{g.grnNumber}</td>
                      <td>{g.supplier}</td>
                      <td>{g.receivedDate}</td>
                      <td><span className="tag neutral">{g.status}</span></td>
                      <td className="right" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <Link href={`/grn/${g.id}/print`} className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }}>Print GRN</Link>
                        <Link href={`/grn/${g.id}/lot-labels`} className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }}>Lot Labels</Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="empty-row"><td colSpan={5}>No GRNs match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h3>📄 Local Purchase Orders</h3></div>
        <div className="panel-body">
          <form className="filterbar" method="get">
            <HiddenFields values={otherOf("poq")} />
            <input type="text" name="poq" placeholder="Search LPO number or supplier..." defaultValue={poq} />
            <button className="btn ghost" type="submit">Search</button>
          </form>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>LPO #</th><th>Supplier</th><th>Date</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {poRows.length ? (
                  poRows.map((po) => (
                    <tr key={po.id}>
                      <td className="mono-r" style={{ textAlign: "left" }}>{po.poNumber}</td>
                      <td>{po.supplier}</td>
                      <td>{po.createdDate}</td>
                      <td><span className="tag neutral">{po.status}</span></td>
                      <td className="right"><Link href={`/purchase-orders/${po.id}/print`} className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }}>Print LPO</Link></td>
                    </tr>
                  ))
                ) : (
                  <tr className="empty-row"><td colSpan={5}>No purchase orders match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h3>📖 Recipe Cook Books</h3></div>
        <div className="panel-body">
          <form className="filterbar" method="get">
            <HiddenFields values={otherOf("rq")} />
            <input type="text" name="rq" placeholder="Search recipe code or name..." defaultValue={rq} />
            <button className="btn ghost" type="submit">Search</button>
          </form>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Code</th><th>Name</th><th>Type</th><th></th></tr></thead>
              <tbody>
                {recipeRows.length ? (
                  recipeRows.map((r) => (
                    <tr key={`${r.type}-${r.code}`}>
                      <td className="mono-r" style={{ textAlign: "left" }}>{r.code}</td>
                      <td>{r.name}</td>
                      <td><span className={`tag ${r.type === "sub" ? "neutral" : ""}`}>{r.type === "main" ? "Main" : "Sub"}</span></td>
                      <td className="right"><Link href={`/recipes/${r.type}/${r.code}/print`} className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }}>Print Cook Book</Link></td>
                    </tr>
                  ))
                ) : (
                  <tr className="empty-row"><td colSpan={4}>No recipes match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h3>🧾 Production Receipt Tickets</h3></div>
        <div className="panel-body">
          <form className="filterbar" method="get">
            <HiddenFields values={otherOf("pbq")} />
            <input type="text" name="pbq" placeholder="Search batch number or sub-recipe..." defaultValue={pbq} />
            <button className="btn ghost" type="submit">Search</button>
          </form>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Batch #</th><th>Sub-Recipe</th><th>Produced</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {batchRows.length ? (
                  batchRows.map((b) => (
                    <tr key={b.id}>
                      <td className="mono-r" style={{ textAlign: "left" }}>{b.batchNo}</td>
                      <td>{b.subRecipeName}</td>
                      <td>{b.producedDate}</td>
                      <td><span className="tag neutral">{b.status}</span></td>
                      <td className="right"><Link href={`/production/${b.id}/labels`} className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }}>Print Receipt</Link></td>
                    </tr>
                  ))
                ) : (
                  <tr className="empty-row"><td colSpan={5}>No production batches match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>⚠ Expiry Alert Tickets</h3></div>
        <div className="panel-body">
          <div className="callout">
            These print themselves — no manual step here. The moment a batch or lot crosses into &quot;Already Expired&quot; on Expiry
            Tracking, a ticket prints automatically the next time that page is opened.
          </div>
          <Link href="/expiry" className="btn ghost">Open Expiry Tracking</Link>
        </div>
      </div>
    </>
  );
}

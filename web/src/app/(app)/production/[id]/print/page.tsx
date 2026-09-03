import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { getProductionBatchDetail } from "@/server/db/queries/production";
import { fmt, money } from "@/lib/format";
import { ledgerDisplayUnit, gramsDisplay } from "@/lib/unitMath";
import { Logo } from "@/components/ui/Logo";
import { PrintButton } from "@/components/ui/PrintButton";
import { withTimeout } from "@/lib/withTimeout";

export default async function ProductionPrintPage({ params }: PageProps<"/production/[id]/print">) {
  await requireSection("subrecipes", "view");
  const { id } = await params;
  const data = await withTimeout(getProductionBatchDetail(id), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { batch, ingredients } = data;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }} className="no-print">
        <PrintButton label="Print Production Batch" />
      </div>

      <div className="print-doc" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 16, marginBottom: 20 }}>
          <Logo height={48} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: ".04em" }}>PRODUCTION BATCH</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{batch.batchNo}</div>
            <div style={{ fontSize: 10.5, color: "#888" }}>Lot: {batch.lotNo}</div>
            <div style={{ fontSize: 11.5, color: "#666" }}>Produced: {batch.producedDate}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24, fontSize: 12.5 }}>
          <div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 4 }}>Sub-Recipe</div>
            <div style={{ fontWeight: 700 }}>{batch.subRecipeCode} — {batch.subRecipeName}</div>
            <div>{batch.branchName ?? "-"}</div>
            {batch.expiryDate && <div>Expiry: {batch.expiryDate}</div>}
            {batch.storageInstructions && <div>{batch.storageInstructions}</div>}
          </div>
          <div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 4 }}>Produced By</div>
            <div style={{ fontWeight: 700 }}>{batch.staffName || "-"}</div>
            <div>Scale: ×{fmt(batch.scaleMultiplier, 2)} · Yield: {fmt(batch.yieldQty, 2)} {batch.yieldUnit ?? ""}</div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888" }}>Status: </span>
              <b>{batch.status}</b>
              {batch.status === "CLOSED" && batch.postedByName && (
                <div>Closed by {batch.postedByName}{batch.postedAt ? ` · ${batch.postedAt.toISOString().slice(0, 10)}` : ""}</div>
              )}
            </div>
          </div>
        </div>

        {batch.notes && (
          <div style={{ fontSize: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888" }}>Notes: </span>
            {batch.notes}
          </div>
        )}

        <div className="print-table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, marginBottom: 16, minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid #111" }}>
                <th style={{ textAlign: "left", padding: "6px 3px", width: 20 }}>#</th>
                <th style={{ textAlign: "left", padding: "6px 3px" }}>Ingredient</th>
                <th style={{ textAlign: "right", padding: "6px 3px" }}>Qty</th>
                <th style={{ textAlign: "right", padding: "6px 3px" }}>Rate</th>
                <th style={{ textAlign: "right", padding: "6px 3px" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((i, idx) => {
                const canonicalUnit = ledgerDisplayUnit({ isSub: false, ingredientUnitLabel: i.unitLabel, productIssueUnit: i.issueUnit });
                const display = gramsDisplay(i.qty, canonicalUnit);
                const isFine = display.unit === "G" || display.unit === "ML";
                return (
                  <tr key={i.id} style={{ borderBottom: "1px solid #e5e5e5" }}>
                    <td style={{ padding: "6px 3px", color: "#888" }}>{idx + 1}</td>
                    <td style={{ padding: "6px 3px" }}>{i.legacyCode} — {i.name}</td>
                    <td style={{ textAlign: "right", padding: "6px 3px" }}>{fmt(display.qty, isFine ? 0 : 3)} {display.unit.toLowerCase()}</td>
                    <td style={{ textAlign: "right", padding: "6px 3px" }}>{fmt(i.rateAtProduction ?? 0, 2)}</td>
                    <td style={{ textAlign: "right", padding: "6px 3px" }}>{fmt(i.amountAtProduction, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
          <table style={{ fontSize: 12.5, minWidth: 240 }}>
            <tbody>
              <tr><td style={{ padding: "3px 12px 3px 0" }}>Total Cost</td><td style={{ textAlign: "right", padding: "3px 0" }}>{fmt(batch.totalCost, 2)}</td></tr>
              <tr style={{ borderTop: "1.5px solid #111", fontWeight: 700 }}>
                <td style={{ padding: "6px 12px 3px 0" }}>Cost per {batch.yieldUnit || "unit"}</td>
                <td style={{ textAlign: "right", padding: "6px 0 3px" }}>{money(batch.costPerUnit, 4)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 40, fontSize: 11.5 }}>
          <div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 6 }}>Produced By</div>
          </div>
          <div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 6 }}>Verified By</div>
          </div>
        </div>
      </div>
    </div>
  );
}

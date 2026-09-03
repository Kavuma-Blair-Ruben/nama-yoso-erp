import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { getStockCountDetail } from "@/server/db/queries/stockCount";
import { fmt, money } from "@/lib/format";
import { Logo } from "@/components/ui/Logo";
import { PrintButton } from "@/components/ui/PrintButton";
import { withTimeout } from "@/lib/withTimeout";

export default async function StockCountPrintPage({ params }: PageProps<"/stock-count/[id]/print">) {
  await requireSection("stockcount", "view");
  const { id } = await params;
  const data = await withTimeout(getStockCountDetail(id), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { stockCount, lines } = data;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }} className="no-print">
        <PrintButton label="Print Stock Count" />
      </div>

      <div className="print-doc" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 16, marginBottom: 20 }}>
          <Logo height={48} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: ".04em" }}>STOCK COUNT SHEET</div>
            {stockCount.countType === "SPOT_CHECK" && (
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: "#666", marginTop: 2 }}>SPOT CHECK</div>
            )}
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{stockCount.countNo}</div>
            <div style={{ fontSize: 11.5, color: "#666" }}>Date: {stockCount.countDate}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24, fontSize: 12.5 }}>
          <div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 4 }}>Branch / Sector</div>
            <div style={{ fontWeight: 700 }}>{stockCount.branchName ?? "-"}</div>
            <div>{stockCount.costCenter ?? "-"}</div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 4 }}>Counted By</div>
            <div style={{ fontWeight: 700 }}>{stockCount.staffName ?? "-"}</div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "#888" }}>Status: </span>
              <b>{stockCount.status}</b>
              {stockCount.status === "POSTED" && stockCount.postedByName && (
                <div>Posted by {stockCount.postedByName}{stockCount.postedAt ? ` · ${stockCount.postedAt.toISOString().slice(0, 10)}` : ""}</div>
              )}
            </div>
          </div>
        </div>

        <div className="print-table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, marginBottom: 16, minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid #111" }}>
                <th style={{ textAlign: "left", padding: "6px 3px", width: 20 }}>#</th>
                <th style={{ textAlign: "left", padding: "6px 3px" }}>Item</th>
                <th style={{ textAlign: "right", padding: "6px 3px" }}>System</th>
                <th style={{ textAlign: "right", padding: "6px 3px" }}>Counted</th>
                <th style={{ textAlign: "right", padding: "6px 3px" }}>Variance</th>
                <th style={{ textAlign: "right", padding: "6px 3px" }}>Rate</th>
                <th style={{ textAlign: "right", padding: "6px 3px" }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const variance = l.countedQty != null ? l.countedQty - l.systemQty : null;
                const varianceValue = variance != null ? variance * (l.rateAtCount ?? 0) : null;
                return (
                  <tr key={l.id} style={{ borderBottom: "1px solid #e5e5e5" }}>
                    <td style={{ padding: "6px 3px", color: "#888" }}>{i + 1}</td>
                    <td style={{ padding: "6px 3px" }}>{l.legacyCode} — {l.name}</td>
                    <td style={{ textAlign: "right", padding: "6px 3px" }}>{fmt(l.systemQty, 2)} {l.unitLabel ?? ""}</td>
                    <td style={{ textAlign: "right", padding: "6px 3px" }}>{l.countedQty != null ? `${fmt(l.countedQty, 2)} ${l.unitLabel ?? ""}` : "—"}</td>
                    <td style={{ textAlign: "right", padding: "6px 3px" }}>{variance == null ? "—" : `${variance >= 0 ? "+" : ""}${fmt(variance, 2)}`}</td>
                    <td style={{ textAlign: "right", padding: "6px 3px" }}>{fmt(l.rateAtCount ?? 0, 2)}</td>
                    <td style={{ textAlign: "right", padding: "6px 3px" }}>{varianceValue == null ? "—" : fmt(varianceValue, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
          <table style={{ fontSize: 12.5, minWidth: 240 }}>
            <tbody>
              <tr style={{ borderTop: "1.5px solid #111", fontWeight: 700 }}>
                <td style={{ padding: "6px 12px 3px 0" }}>Total Variance Value</td>
                <td style={{ textAlign: "right", padding: "6px 0 3px" }}>{money(stockCount.totalVarianceValue, 2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 40, fontSize: 11.5 }}>
          <div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 6 }}>Counted By</div>
          </div>
          <div>
            <div style={{ borderTop: "1px solid #111", paddingTop: 6 }}>Verified By</div>
          </div>
        </div>
      </div>
    </div>
  );
}

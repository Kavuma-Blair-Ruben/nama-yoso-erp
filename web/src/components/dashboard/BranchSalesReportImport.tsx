"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importBranchSalesReport, type BranchSalesRow } from "@/server/actions/branchSalesReport";
import { parseCsv, pickField } from "@/lib/csv";
import { todayStr } from "@/lib/format";

export function BranchSalesReportImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(todayStr());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    setInfo(null);
    if (!date) return setError("Pick the date this report covers first.");
    const reader = new FileReader();
    reader.onload = (evt) => {
      const csvRows = parseCsv(String(evt.target?.result ?? ""));
      const rows: BranchSalesRow[] = csvRows
        .map((r) => ({
          branchName: pickField(r, ["branch"]),
          grossAmount: Number(pickField(r, ["gross sales"])) || 0,
          discountAmount: Number(pickField(r, ["discount amount"])) || 0,
          netAmount: Number(pickField(r, ["net sales"])) || 0,
          orderCount: Number(pickField(r, ["order count"])) || 0,
          guestCount: Number(pickField(r, ["guest count"])) || 0,
          tipsAmount: Number(pickField(r, ["tips"])) || 0,
          voidAmount: Number(pickField(r, ["void amount"])) || 0,
          voidQty: Number(pickField(r, ["void quantity"])) || 0,
        }))
        .filter((r) => r.branchName);

      if (rows.length === 0) {
        setError("No valid rows found — expecting Foodics' Sales by Branch Report (Branch, Gross Sales, Net Sales, Order Count, Guest Count, Tips, Void columns).");
        return;
      }
      startTransition(async () => {
        const result = await importBranchSalesReport(rows, date);
        if (result.error) setError(result.error);
        else {
          setInfo(`Imported ${result.imported} branch(es) for ${date}${result.unmatched ? ` — couldn't match: ${result.unmatched.join(", ")}` : ""}. Order count, guest count, and tips are now set from this report.`);
          router.refresh();
        }
      });
    };
    reader.readAsText(file);
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Import Branch Sales Report</h3></div>
      <div className="panel-body">
        <div className="callout">
          Upload Foodics&apos; <b>Sales by Branch Report</b> export — the one with real Order Count, Guest Count, Tips,
          and Void columns per branch. This is the authoritative source for those figures (the per-product sales CSV
          has none of them), and replaces typing guest count/tips in by hand for the date you upload.
        </div>
        <div className="btn-row" style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, alignSelf: "center" }}>Date this report covers</label>
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 160 }} />
        </div>
        <div className="btn-row">
          <button className="btn accent" disabled={pending} onClick={() => fileRef.current?.click()}>
            {pending ? "Importing…" : "Upload Branch Sales Report"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {info && <div className="callout" style={{ marginTop: 10 }}>{info}</div>}
        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  );
}

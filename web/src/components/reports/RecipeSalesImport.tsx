"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importRecipeSales, clearRecipeSales, type SalesImportRow } from "@/server/actions/sales";
import { parseCsv, pickField } from "@/lib/csv";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type Branch = { id: string; name: string };

export function RecipeSalesImport({ hasData, unmatchedCount, branches }: { hasData: boolean; unmatchedCount: number; branches: Branch[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  // A per-product Foodics export (Product/SKU/Gross/Net/Void columns, one
  // row per dish) has no date or branch column of its own — you upload one
  // file per branch per day, so both have to be supplied here instead.
  const [saleDate, setSaleDate] = useState("");
  const [branchId, setBranchId] = useState("");

  function handleFile(file: File) {
    setError(null);
    setInfo(null);
    if (!saleDate) {
      setError("Pick the date this sales file covers first.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const csvRows = parseCsv(String(evt.target?.result ?? ""));
      const rows: SalesImportRow[] = csvRows
        .map((r) => {
          const rowDate = pickField(r, ["date", "sale date", "saledate"]) || saleDate;
          const itemLabel = pickField(r, ["item", "recipe", "item name", "product", "menu item"]);
          const sku = pickField(r, ["sku", "product sku", "code"]) || undefined;
          const qty = Number(pickField(r, ["qty", "quantity", "units sold", "net quantity"])) || 0;
          const revenue = Number(pickField(r, ["revenue", "sales", "amount", "total", "net sales"])) || 0;
          // "Gross Sales" (with tax) is the true top-line figure — "Gross
          // Sales Without Tax" is really just Net Sales plus discount, and
          // ends up numerically identical to Net Sales whenever there's no
          // discount, which silently made Gross == Net and hid the tax
          // entirely from this KPI.
          const grossRevenue = Number(pickField(r, ["gross sales", "gross revenue"])) || undefined;
          const discountAmount = Number(pickField(r, ["discount amount", "discount"])) || undefined;
          const voidAmount = Number(pickField(r, ["void amount"])) || undefined;
          const voidQty = Number(pickField(r, ["void quantity", "void qty"])) || undefined;
          return { saleDate: rowDate, itemLabel, sku, qty, revenue, grossRevenue, discountAmount, voidAmount, voidQty };
        })
        .filter((r) => r.saleDate && r.itemLabel && (r.qty > 0 || (r.voidQty ?? 0) > 0));

      if (rows.length === 0) {
        setError("No valid rows found — expecting columns like Date, Item, Qty, Revenue (or Product/Net Quantity/Net Sales for a Foodics export).");
        return;
      }
      startTransition(async () => {
        const result = await importRecipeSales(rows, branchId || undefined);
        if (result.error) setError(result.error);
        else {
          const stockNote = !branchId
            ? " Pick a branch next time to also deduct ingredient stock — skipped here with no branch selected."
            : ` Stock deducted for ${result.stockDeducted} row(s)${result.stockSkipped ? `, skipped for ${result.stockSkipped} unmatched row(s)` : ""}.`;
          setInfo(`Imported ${result.imported} row(s) — ${result.matched} matched to a recipe automatically, ${result.unmatched} unmatched.${stockNote}`);
          router.refresh();
        }
      });
    };
    reader.readAsText(file);
  }

  function handleClear() {
    setError(null);
    startTransition(async () => {
      const result = await clearRecipeSales();
      if (result.error) setError(result.error);
      else {
        setConfirmingClear(false);
        setInfo("Cleared — import a fresh file to start over.");
        router.refresh();
      }
    });
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Import Sales Data</h3></div>
      <div className="panel-body">
        <div className="callout">
          Upload a CSV export from your POS with columns for Date, Item, Qty, and Revenue — or a per-product Foodics export
          (Product, SKU, Net Quantity, Net Sales, Void columns), which has no date of its own, so pick the date it covers
          below first. Items are matched by SKU/code where the file has one, and by name otherwise — unmatched rows still
          count toward totals but won&apos;t show per-recipe cost/profit. With a branch selected, a matched row also
          deducts that recipe&apos;s ingredients from stock (same logic as a live POS sale) — pick one to keep stock on
          hand accurate until the live Foodics connection is wired up.
        </div>
        <div className="btn-row" style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, alignSelf: "center" }}>Date this file covers</label>
          <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} style={{ maxWidth: 160 }} />
          <label style={{ fontSize: 12, fontWeight: 600, alignSelf: "center", marginLeft: 8 }}>Branch</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">Unassigned / mixed</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="btn-row">
          <button className="btn accent" disabled={pending} onClick={() => fileRef.current?.click()}>
            {pending ? "Importing…" : "Upload Sales CSV"}
          </button>
          {hasData && (
            <button className="btn ghost" disabled={pending} onClick={() => setConfirmingClear(true)}>
              Clear All Sales Data
            </button>
          )}
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
        {hasData && unmatchedCount > 0 && (
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 8 }}>{unmatchedCount} imported item label(s) didn&apos;t match a recipe name — shown as-is in the table below.</div>
        )}
        {info && <div className="callout" style={{ marginTop: 10 }}>{info}</div>}
        {error && <div className="login-error">{error}</div>}
      </div>
      <ConfirmDialog
        open={confirmingClear}
        title="Clear all sales data?"
        body="Every imported sales row will be removed. This can't be undone."
        error={error}
        pending={pending}
        confirmLabel="Clear All Sales Data"
        pendingLabel="Clearing…"
        onCancel={() => setConfirmingClear(false)}
        onConfirm={handleClear}
      />
    </div>
  );
}

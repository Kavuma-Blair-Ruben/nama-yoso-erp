"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importRecipeSales, clearRecipeSales, type SalesImportRow } from "@/server/actions/sales";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const splitRow = (row: string) => row.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)!.map((c) => c.replace(/^,/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
  const header = splitRow(lines[0]);
  return lines.slice(1).map((row) => {
    const cells = splitRow(row);
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    return obj;
  });
}

// Accepts loose header spelling (Date/Sale Date, Item/Recipe/Item Name,
// Qty/Quantity, Revenue/Sales/Amount) since POS exports never agree on
// column names — case-insensitive match against a few likely aliases.
function pickField(row: Record<string, string>, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const key = keys.find((k) => k.trim().toLowerCase() === alias);
    if (key) return row[key];
  }
  return "";
}

export function RecipeSalesImport({ hasData, unmatchedCount }: { hasData: boolean; unmatchedCount: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    setInfo(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const csvRows = parseCsv(String(evt.target?.result ?? ""));
      const rows: SalesImportRow[] = csvRows
        .map((r) => {
          const saleDate = pickField(r, ["date", "sale date", "saledate"]);
          const itemLabel = pickField(r, ["item", "recipe", "item name", "product", "menu item"]);
          const qty = Number(pickField(r, ["qty", "quantity", "units sold"])) || 0;
          const revenue = Number(pickField(r, ["revenue", "sales", "amount", "total"])) || 0;
          return { saleDate, itemLabel, qty, revenue };
        })
        .filter((r) => r.saleDate && r.itemLabel && r.qty > 0);

      if (rows.length === 0) {
        setError("No valid rows found — expecting columns like Date, Item, Qty, Revenue.");
        return;
      }
      startTransition(async () => {
        const result = await importRecipeSales(rows);
        if (result.error) setError(result.error);
        else {
          setInfo(`Imported ${result.imported} row(s) — ${result.matched} matched to a recipe automatically, ${result.unmatched} unmatched.`);
          router.refresh();
        }
      });
    };
    reader.readAsText(file);
  }

  function handleClear() {
    if (!confirm("Remove all imported sales data? This can't be undone.")) return;
    startTransition(async () => {
      const result = await clearRecipeSales();
      if (result.error) setError(result.error);
      else {
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
          Upload a CSV export from your POS with columns for Date, Item, Qty, and Revenue. Item names are matched against your recipe
          list automatically — unmatched rows still count toward totals but won&apos;t show per-recipe cost/profit.
        </div>
        <div className="btn-row">
          <button className="btn accent" disabled={pending} onClick={() => fileRef.current?.click()}>
            {pending ? "Importing…" : "Upload Sales CSV"}
          </button>
          {hasData && (
            <button className="btn ghost" disabled={pending} onClick={handleClear}>
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
    </div>
  );
}

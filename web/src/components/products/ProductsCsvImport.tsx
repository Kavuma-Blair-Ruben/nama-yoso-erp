"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkImportProducts, type ProductImportRow } from "@/server/actions/products";
import { parseCsv, pickField } from "@/lib/csv";

export function ProductsCsvImport() {
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
      const rows: ProductImportRow[] = csvRows
        .map((r) => {
          const storageType = pickField(r, ["storage type"]).trim().toUpperCase();
          const branches = pickField(r, ["branches"]).split(",").map((b) => b.trim()).filter(Boolean);
          return {
            name: pickField(r, ["name", "product", "product name"]),
            category: pickField(r, ["category"]),
            subcategory: pickField(r, ["subcategory"]) || undefined,
            supplier: pickField(r, ["supplier"]) || undefined,
            storageType: storageType === "DRY" || storageType === "CHILLED" || storageType === "FROZEN" ? (storageType as "DRY" | "CHILLED" | "FROZEN") : undefined,
            purchaseUnit: pickField(r, ["purchase unit"]) || undefined,
            issueUnit: pickField(r, ["issue unit"]) || undefined,
            unitWeight: Number(pickField(r, ["unit weight"])) || undefined,
            purchaseRate: Number(pickField(r, ["purchase rate", "rate"])) || 0,
            branches: branches.length ? branches : undefined,
            minLevel: Number(pickField(r, ["min level"])) || undefined,
            parLevel: Number(pickField(r, ["par level"])) || undefined,
          };
        })
        .filter((r) => r.name && r.category);

      if (rows.length === 0) {
        setError("No valid rows found — expecting Name, Category, and Purchase Rate columns.");
        return;
      }
      startTransition(async () => {
        const result = await bulkImportProducts(rows);
        if (result.error) setError(result.error);
        else {
          const skippedMsg = result.skipped?.length ? `, ${result.skipped.length} skipped (already exists): ${result.skipped.map((s) => s.name).join(", ")}` : "";
          setInfo(`Imported ${result.imported} product(s)${skippedMsg}.`);
          router.refresh();
        }
      });
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div className="btn-row" style={{ margin: 0 }}>
        <a href="/products/import-template" className="btn ghost">Download Template</a>
        <button type="button" className="btn ghost" disabled={pending} onClick={() => fileRef.current?.click()}>
          {pending ? "Importing…" : "Import CSV"}
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
      {info && <div className="callout" style={{ fontSize: 12, maxWidth: 420 }}>{info}</div>}
      {error && <div className="login-error" style={{ fontSize: 12, maxWidth: 420 }}>{error}</div>}
    </div>
  );
}

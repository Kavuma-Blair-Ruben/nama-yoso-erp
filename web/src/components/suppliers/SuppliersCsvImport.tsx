"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkImportSuppliers, type SupplierImportRow } from "@/server/actions/suppliers";
import { parseCsv, pickField } from "@/lib/csv";

const FREQUENCIES = ["daily", "weekly", "monthly"] as const;

export function SuppliersCsvImport() {
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
      const rows: SupplierImportRow[] = csvRows
        .map((r) => {
          const orderFreq = pickField(r, ["order limit frequency"]).trim().toLowerCase();
          const receivingFreq = pickField(r, ["receiving limit frequency"]).trim().toLowerCase();
          return {
            name: pickField(r, ["name", "supplier", "supplier name"]),
            trn: pickField(r, ["trn"]) || undefined,
            contactName: pickField(r, ["contact name", "contact"]) || undefined,
            phone: pickField(r, ["phone"]) || undefined,
            email: pickField(r, ["email"]) || undefined,
            paymentTerms: pickField(r, ["payment terms"]) || undefined,
            leadTimeDays: Number(pickField(r, ["lead time days", "lead time"])) || undefined,
            notes: pickField(r, ["notes"]) || undefined,
            orderLimitAmount: Number(pickField(r, ["order limit amount"])) || undefined,
            orderLimitFrequency: (FREQUENCIES as readonly string[]).includes(orderFreq) ? (orderFreq as (typeof FREQUENCIES)[number]) : undefined,
            receivingLimitAmount: Number(pickField(r, ["receiving limit amount"])) || undefined,
            receivingLimitFrequency: (FREQUENCIES as readonly string[]).includes(receivingFreq) ? (receivingFreq as (typeof FREQUENCIES)[number]) : undefined,
          };
        })
        .filter((r) => r.name);

      if (rows.length === 0) {
        setError("No valid rows found — expecting a Name column.");
        return;
      }
      startTransition(async () => {
        const result = await bulkImportSuppliers(rows);
        if (result.error) setError(result.error);
        else {
          const updatedMsg = result.updated ? `, ${result.updated} updated (matched by name)` : "";
          setInfo(`Imported ${result.imported} new supplier(s)${updatedMsg}.`);
          router.refresh();
        }
      });
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div className="btn-row" style={{ margin: 0 }}>
        <a href="/suppliers/import-template" className="btn ghost">Download Template</a>
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

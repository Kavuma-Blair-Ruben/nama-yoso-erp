"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createConsolidatedInvoice } from "@/server/actions/creditNotes";
import { fmt, money, todayStr } from "@/lib/format";

type Grn = { id: string; grnNumber: string; receivedDate: string; total: number };
type SupplierGroup = { supplierId: string; supplierName: string; grns: Grn[] };

export function ConsolidateBuilder({ groups }: { groups: SupplierGroup[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(groups[0]?.supplierId ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [invoiceDate, setInvoiceDate] = useState(todayStr());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const group = groups.find((g) => g.supplierId === supplierId);
  const total = useMemo(() => (group?.grns ?? []).filter((g) => selectedIds.includes(g.id)).reduce((s, g) => s + g.total, 0), [group, selectedIds]);

  function toggleGrn(id: string) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function handleSupplierChange(id: string) {
    setSupplierId(id);
    setSelectedIds([]);
  }

  function handleSubmit() {
    setError(null);
    if (!supplierId) return setError("Select a supplier.");
    if (selectedIds.length === 0) return setError("Select at least one GRN to combine.");
    startTransition(async () => {
      const result = await createConsolidatedInvoice({ supplierId, invoiceDate, grnIds: selectedIds });
      if (result.error) setError(result.error);
      else router.push(`/consolidated-invoices/${result.id}`);
    });
  }

  if (groups.length === 0) {
    return <div className="callout">Every posted GRN is already part of a consolidated invoice — nothing left to combine.</div>;
  }

  return (
    <div className="panel" style={{ maxWidth: 760 }}>
      <div className="panel-head"><h3>New Consolidated Invoice</h3></div>
      <div className="panel-body">
        <div className="form-row">
          <label>Supplier</label>
          <select value={supplierId} onChange={(e) => handleSupplierChange(e.target.value)}>
            {groups.map((g) => (
              <option key={g.supplierId} value={g.supplierId}>
                {g.supplierName} ({g.grns.length} GRN{g.grns.length === 1 ? "" : "s"})
              </option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ maxWidth: 220 }}>
          <label>Invoice date</label>
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </div>

        {group && (
          <>
            <div className="section-title">Select GRNs to Combine</div>
            {group.grns.map((g) => (
              <label
                key={g.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)", cursor: "pointer" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={selectedIds.includes(g.id)} onChange={() => toggleGrn(g.id)} /> {g.grnNumber} — {g.receivedDate}
                </span>
                <span className="mono-r">{fmt(g.total, 2)}</span>
              </label>
            ))}
            <div className="field-row" style={{ fontSize: 14, marginTop: 10 }}>
              <span className="k"><b>Consolidated Total</b></span>
              <span className="v">{money(total, 2)}</span>
            </div>
          </>
        )}

        {error && <div className="login-error">{error}</div>}
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn accent" disabled={pending} onClick={handleSubmit}>
            {pending ? "Creating…" : "Create Consolidated Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

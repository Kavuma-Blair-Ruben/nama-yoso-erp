import { money } from "@/lib/format";

type SupplierReturn = { id: string; number: string; reason: string | null; value: number; createdAt: Date };

export function SupplierReturnSection({ returns }: { returns: SupplierReturn[] }) {
  if (returns.length === 0) return null;

  return (
    <div className="panel" style={{ marginTop: 16, marginBottom: 16 }}>
      <div className="panel-head"><h3>Supplier Returns</h3></div>
      <div className="panel-body">
        {returns.map((r) => (
          <div className="field-row" key={r.id} style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <b>{r.number}</b>
              <span className="tabular">{money(r.value, 2)}</span>
            </div>
            {r.reason && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{r.reason}</div>}
            <div style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>{r.createdAt.toISOString().slice(0, 10)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

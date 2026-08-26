import type { PoApprovalStepProgress } from "@/server/db/queries/purchaseOrders";

export function PoApprovalProgress({ steps }: { steps: PoApprovalStepProgress[] }) {
  if (steps.length === 0) return null;
  const doneCount = steps.filter((s) => s.approvedByName).length;
  const allDone = doneCount === steps.length;

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="section-title">Approval Chain{allDone ? " — Complete" : ` — ${doneCount} of ${steps.length} done`}</div>
      <div className="panel">
        <div className="panel-body">
          {steps.map((s) => (
            <div key={s.stepOrder} className="field-row" style={{ alignItems: "center" }}>
              <span className="k">
                <span className={`tag ${s.approvedByName ? "good" : "neutral"}`} style={{ marginRight: 8 }}>
                  {s.approvedByName ? "✓" : s.stepOrder}
                </span>
                Step {s.stepOrder} — {s.roleName}
              </span>
              <span className="v">
                {s.approvedByName ? `${s.approvedByName} · ${s.approvedAt?.toISOString().slice(0, 10)}` : "Pending"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

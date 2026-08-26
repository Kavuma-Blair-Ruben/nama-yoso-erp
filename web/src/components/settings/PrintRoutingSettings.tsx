"use client";

import { useState, useTransition } from "react";
import { setPrintRoute } from "@/server/actions/printRoutes";

type Branch = { id: string; name: string };
type Device = { id: string; name: string; branchId: string | null; connection: string; isActive: boolean };
type Route = { id: string; branchId: string; documentType: string; deviceId: string };

const DOCUMENT_LABELS: Record<string, string> = {
  expiry_ticket: "Expiry Tickets",
  production_label: "Production Labels",
  wastage_ticket: "Wastage / Scrap Tickets",
  grn_label: "GRN Labels",
  product_label: "Product Labels (manual send)",
};
const REACHABLE_CONNECTIONS = new Set(["network", "printnode"]);

function RouteCell({ branchId, documentType, deviceId, devicesForBranch }: { branchId: string; documentType: string; deviceId: string; devicesForBranch: Device[] }) {
  const [value, setValue] = useState(deviceId);
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    setValue(next);
    startTransition(async () => {
      await setPrintRoute(branchId, documentType, next || null);
    });
  }

  return (
    <select value={value} disabled={pending} onChange={(e) => handleChange(e.target.value)} style={{ minWidth: 200 }}>
      <option value="">— Not routed (no auto-print) —</option>
      {devicesForBranch.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
          {!d.isActive ? " (inactive)" : !REACHABLE_CONNECTIONS.has(d.connection) ? " (not server-reachable)" : ""}
        </option>
      ))}
    </select>
  );
}

// Which registered printer auto-prints each document type, per branch —
// only plain-text ESC/POS tickets are offered here (Expiry/Production/
// Wastage); GRN and product barcode labels deliberately stay on the browser
// print dialog (see print_routes' schema comment for why).
export function PrintRoutingSettings({ branches, devices, routes }: { branches: Branch[]; devices: Device[]; routes: Route[] }) {
  const documentTypes = Object.keys(DOCUMENT_LABELS);

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-head">
        <h3>Print Routing</h3>
        <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>Which printer auto-prints which document, per branch</span>
      </div>
      <div className="panel-body">
        <div className="callout" style={{ marginBottom: 14 }}>
          Expiry Tickets, Production Labels, GRN Labels, and Wastage/Scrap Tickets print automatically the moment the
          real event happens (a GRN closes, a wastage event posts, a production ticket opens) — no one needs to be on
          the page. Product Labels are sent manually instead (a &quot;Send to Printer&quot; button on the item&apos;s
          label page), since printing isn&apos;t tied to a single event for those.
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Document</th>
                {branches.map((b) => (
                  <th key={b.id}>{b.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documentTypes.map((docType) => (
                <tr key={docType}>
                  <td>{DOCUMENT_LABELS[docType]}</td>
                  {branches.map((b) => {
                    const devicesForBranch = devices.filter((d) => d.branchId === b.id || d.branchId === null);
                    const existing = routes.find((r) => r.branchId === b.id && r.documentType === docType);
                    return (
                      <td key={b.id}>
                        <RouteCell branchId={b.id} documentType={docType} deviceId={existing?.deviceId ?? ""} devicesForBranch={devicesForBranch} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

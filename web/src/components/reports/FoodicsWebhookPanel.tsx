"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateFoodicsWebhookUrl,
  fetchAndSeedFoodicsBranches,
  discoverFoodicsItems,
  setPosBranchMapping,
  setPosItemMapping,
} from "@/server/actions/pos";
import { todayStr } from "@/lib/format";
import { ItemSearchSelect } from "@/components/ui/ItemSearchSelect";

type Branch = { id: string; code: string; name: string };
type CostCenter = { id: string; branchId: string; name: string };
type Recipe = { id: string; legacyCode: string; name: string };
type BranchMapping = { id: string; externalBranchId: string; externalBranchName: string | null; branchId: string | null; costCenterId: string | null };
type ItemMapping = { id: string; externalProductId: string; externalProductName: string | null; mainRecipeId: string | null };
type WebhookEvent = { id: string; externalOrderId: string; eventType: string; receivedAt: Date; processedAt: Date | null; processNotes: string | null };

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function BranchMappingRow({ mapping, branches, costCenters }: { mapping: BranchMapping; branches: Branch[]; costCenters: CostCenter[] }) {
  const [pending, startTransition] = useTransition();
  const [branchId, setBranchId] = useState(mapping.branchId ?? "");
  const costCentersForBranch = costCenters.filter((c) => c.branchId === branchId);
  const [costCenterId, setCostCenterId] = useState(mapping.costCenterId ?? "");
  const [error, setError] = useState<string | null>(null);

  function changeBranch(newBranchId: string) {
    setBranchId(newBranchId);
    const stillValid = costCenters.some((c) => c.branchId === newBranchId && c.id === costCenterId);
    setCostCenterId(stillValid ? costCenterId : (costCenters.find((c) => c.branchId === newBranchId)?.id ?? ""));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setPosBranchMapping(mapping.id, branchId, costCenterId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="usedin-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="name" style={{ minWidth: 160 }}>{mapping.externalBranchName ?? mapping.externalBranchId}</span>
        <select value={branchId} onChange={(e) => changeBranch(e.target.value)} style={{ flex: 1 }}>
          <option value="">— Pick branch —</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} style={{ flex: 1 }} disabled={!branchId}>
          <option value="">— Pick sector —</option>
          {costCentersForBranch.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button type="button" className="btn ghost" style={{ padding: "3px 8px", fontSize: 11 }} disabled={pending || !branchId || !costCenterId} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: "var(--bad)" }}>{error}</div>}
    </div>
  );
}

function ItemMappingRow({ mapping, recipes }: { mapping: ItemMapping; recipes: Recipe[] }) {
  const [pending, startTransition] = useTransition();
  const [mainRecipeId, setMainRecipeId] = useState(mapping.mainRecipeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const recipeOptions = useMemo(
    () => [{ value: "", code: "—", label: "Unmapped (no stock deducted)" }, ...recipes.map((r) => ({ value: r.id, code: r.legacyCode, label: r.name }))],
    [recipes]
  );

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setPosItemMapping(mapping.id, mainRecipeId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="usedin-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="name" style={{ minWidth: 200 }}>{mapping.externalProductName ?? mapping.externalProductId}</span>
        <div style={{ flex: 1 }}>
          <ItemSearchSelect options={recipeOptions} value={mainRecipeId} onChange={setMainRecipeId} placeholder="Search recipe or leave unmapped…" />
        </div>
        <button type="button" className="btn ghost" style={{ padding: "3px 8px", fontSize: 11 }} disabled={pending || !mainRecipeId} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: "var(--bad)" }}>{error}</div>}
    </div>
  );
}

export function FoodicsWebhookPanel({
  hasToken,
  webhookConfigured,
  branches,
  costCenters,
  recipes,
  branchMappings,
  itemMappings,
  recentEvents,
}: {
  hasToken: boolean;
  webhookConfigured: boolean;
  branches: Branch[];
  costCenters: CostCenter[];
  recipes: Recipe[];
  branchMappings: BranchMapping[];
  itemMappings: ItemMapping[];
  recentEvents: WebhookEvent[];
}) {
  const router = useRouter();
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [genPending, startGenTransition] = useTransition();
  const [seedBranchesPending, startSeedBranchesTransition] = useTransition();
  const [discoverPending, startDiscoverTransition] = useTransition();
  const [fromDate, setFromDate] = useState(daysAgoStr(30));
  const [toDate, setToDate] = useState(todayStr());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    setInfo(null);
    startGenTransition(async () => {
      const result = await generateFoodicsWebhookUrl();
      if (result.error) setError(result.error);
      else {
        setWebhookUrl(result.url ?? null);
        router.refresh();
      }
    });
  }

  function handleSeedBranches() {
    setError(null);
    setInfo(null);
    startSeedBranchesTransition(async () => {
      const result = await fetchAndSeedFoodicsBranches();
      if (result.error) setError(result.error);
      else {
        setInfo(`Found ${result.count} branch(es) — map each to a branch and sector below.`);
        router.refresh();
      }
    });
  }

  function handleDiscoverItems() {
    setError(null);
    setInfo(null);
    startDiscoverTransition(async () => {
      const result = await discoverFoodicsItems(fromDate, toDate);
      if (result.error) setError(result.error);
      else {
        setInfo(`Found ${result.count} distinct item(s) in that range — map each to a recipe below.`);
        router.refresh();
      }
    });
  }

  if (!hasToken) return null;

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Real-Time Stock Depletion (Webhook)</h3></div>
      <div className="panel-body">
        <div className="callout">
          Instead of clicking Sync Sales, Foodics can call this system the instant an order closes, deducting the sold
          recipe&apos;s ingredients from the right branch and sector automatically. Requires mapping every Foodics branch
          and menu item below first — an unmapped branch holds the whole order, an unmapped item is skipped (its stock
          isn&apos;t touched) but still counted for revenue reporting.
        </div>

        <div className="section-title">Webhook URL</div>
        {webhookConfigured && !webhookUrl && (
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>
            A webhook URL is already generated. Regenerating replaces it — the old URL stops working, so update it with
            Foodics (or support@foodics.com) if you do.
          </div>
        )}
        {webhookUrl && (
          <div className="callout" style={{ marginBottom: 8, fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>
            {webhookUrl}
            <div style={{ fontFamily: "inherit", fontSize: 11, color: "var(--ink-faint)", marginTop: 6 }}>
              Give this exact URL to Foodics — either in your Foodics application&apos;s webhook settings, or by emailing it to
              support@foodics.com and asking them to configure it for order.created events. This is shown once; regenerate
              if you lose it.
            </div>
          </div>
        )}
        <button type="button" className="btn ghost" disabled={genPending} onClick={handleGenerate}>
          {genPending ? "Generating…" : webhookConfigured ? "Regenerate Webhook URL" : "Generate Webhook URL"}
        </button>

        <div className="section-title" style={{ marginTop: 16 }}>Branch Mapping</div>
        <button type="button" className="btn ghost" style={{ marginBottom: 8 }} disabled={seedBranchesPending} onClick={handleSeedBranches}>
          {seedBranchesPending ? "Fetching…" : "Fetch Branches Now"}
        </button>
        {branchMappings.length ? (
          branchMappings.map((m) => <BranchMappingRow key={m.id} mapping={m} branches={branches} costCenters={costCenters} />)
        ) : (
          <div style={{ fontSize: 12, color: "var(--ink-faint)", padding: "6px 0" }}>
            No branches yet — click &quot;Fetch Branches Now&quot;, or one appears automatically the first time an order arrives.
          </div>
        )}

        <div className="section-title" style={{ marginTop: 16 }}>Item Mapping</div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr auto", marginBottom: 8 }}>
          <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" value={toDate} max={todayStr()} onChange={(e) => setToDate(e.target.value)} />
          <button type="button" className="btn ghost" disabled={discoverPending} onClick={handleDiscoverItems}>
            {discoverPending ? "Scanning…" : "Discover Items from Recent Orders"}
          </button>
        </div>
        {itemMappings.length ? (
          itemMappings.map((m) => <ItemMappingRow key={m.id} mapping={m} recipes={recipes} />)
        ) : (
          <div style={{ fontSize: 12, color: "var(--ink-faint)", padding: "6px 0" }}>
            No items yet — discover them from recent orders, or one appears automatically the first time it's sold.
          </div>
        )}

        {recentEvents.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 16 }}>Recent Webhook Deliveries</div>
            <div className="table-wrap" style={{ maxHeight: 240 }}>
              <table className="data">
                <thead><tr><th>Order</th><th>Received</th><th>Status</th></tr></thead>
                <tbody>
                  {recentEvents.map((e) => (
                    <tr key={e.id}>
                      <td className="mono-r" style={{ textAlign: "left" }}>{e.externalOrderId}</td>
                      <td>{e.receivedAt.toLocaleString()}</td>
                      <td>
                        {!e.processedAt ? (
                          <span className="tag neutral">Processing</span>
                        ) : e.processNotes ? (
                          <span className="tag bad" title={e.processNotes}>{e.processNotes}</span>
                        ) : (
                          <span className="tag good">Stock deducted</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {info && <div className="callout" style={{ marginTop: 10 }}>{info}</div>}
        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePosIntegration, testPosConnection, syncFoodicsSales } from "@/server/actions/pos";
import { todayStr } from "@/lib/format";

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function PosIntegrationPanel({ hasToken, lastSyncAt, lastSyncStatus }: { hasToken: boolean; lastSyncAt: string | null; lastSyncStatus: string | null }) {
  const router = useRouter();
  const [tokenInput, setTokenInput] = useState("");
  const [editingToken, setEditingToken] = useState(!hasToken);
  const [fromDate, setFromDate] = useState(daysAgoStr(7));
  const [toDate, setToDate] = useState(todayStr());
  // Separate transitions per action — sharing one `pending` across
  // save/test/sync meant clicking Save Token (which calls router.refresh(),
  // itself a transition) made the Test Connection button briefly render its
  // own "Testing…" label too, since both read the same pending flag.
  const [savePending, startSaveTransition] = useTransition();
  const [testPending, startTestTransition] = useTransition();
  const [syncPending, startSyncTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function handleSaveToken() {
    setError(null);
    startSaveTransition(async () => {
      const result = await savePosIntegration("foodics", tokenInput);
      if (result.error) setError(result.error);
      else {
        setInfo("Token saved.");
        setEditingToken(false);
        setTokenInput("");
        router.refresh();
      }
    });
  }

  function handleTest() {
    setError(null);
    setInfo(null);
    startTestTransition(async () => {
      const result = await testPosConnection("foodics");
      if (result.error) setError(result.error);
      else setInfo(`Connected — found ${result.branchCount} branch(es) on this Foodics account.`);
    });
  }

  function handleSync() {
    setError(null);
    setInfo(null);
    startSyncTransition(async () => {
      const result = await syncFoodicsSales(fromDate, toDate);
      if (result.error) setError(result.error);
      else {
        setInfo(`Scanned ${result.ordersScanned} order(s), found ${result.linesFound} line(s), imported ${result.imported} new, ${result.matched} matched to a recipe.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>POS Integration — Foodics</h3></div>
      <div className="panel-body">
        <div className="callout">
          Pulls real sales straight from Foodics instead of a manual CSV — same recipe-matching, same Recipe Sales Report below.
          This talks to Foodics&apos; own documented API but hasn&apos;t been tested against a real Foodics account yet; use{" "}
          <b>Test Connection</b> after saving a token to confirm it works, and treat the first sync as a check, not a guarantee.
        </div>

        {editingToken ? (
          <div className="line-builder-row" style={{ gridTemplateColumns: "1fr auto", marginBottom: 10 }}>
            <input type="password" placeholder="Foodics API token (Settings → API in Foodics)" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} />
            <button className="btn accent" disabled={savePending} onClick={handleSaveToken}>{savePending ? "Saving…" : "Save Token"}</button>
          </div>
        ) : (
          <div className="btn-row" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>API token saved.</span>
            <button className="btn ghost" onClick={() => setEditingToken(true)}>Change Token</button>
            <button className="btn ghost" disabled={testPending} onClick={handleTest}>{testPending ? "Testing…" : "Test Connection"}</button>
          </div>
        )}

        {hasToken && !editingToken && (
          <>
            <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
              <div>From</div>
              <div>To</div>
              <div></div>
            </div>
            <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr auto", marginBottom: 10 }}>
              <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} />
              <input type="date" value={toDate} max={todayStr()} onChange={(e) => setToDate(e.target.value)} />
              <button className="btn accent" disabled={syncPending} onClick={handleSync}>{syncPending ? "Syncing…" : "Sync Sales"}</button>
            </div>
            {lastSyncAt && <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>Last synced {lastSyncAt} — {lastSyncStatus}</div>}
          </>
        )}

        {info && <div className="callout" style={{ marginTop: 10 }}>{info}</div>}
        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  );
}

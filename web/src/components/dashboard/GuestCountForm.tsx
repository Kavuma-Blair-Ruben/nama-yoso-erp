"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDailyGuestCount, deleteDailyGuestCount } from "@/server/actions/guestCounts";
import { todayStr, fmt, money } from "@/lib/format";

type Row = { date: string; guestCount: number; tipsAmount: number | null; notes: string | null; enteredByName: string | null };

export function GuestCountForm({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [date, setDate] = useState(todayStr());
  const [guestCount, setGuestCount] = useState("");
  const [tips, setTips] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    const n = Number(guestCount);
    if (!date) return setError("Pick a date.");
    if (!guestCount || !Number.isFinite(n) || n < 0) return setError("Enter a valid guest count.");
    const tipsNum = tips.trim() === "" ? undefined : Number(tips);
    if (tipsNum != null && (!Number.isFinite(tipsNum) || tipsNum < 0)) return setError("Enter a valid tips amount.");
    startTransition(async () => {
      const result = await setDailyGuestCount(date, n, tipsNum, notes);
      if (result.error) setError(result.error);
      else {
        setGuestCount("");
        setTips("");
        setNotes("");
        router.refresh();
      }
    });
  }

  function remove(d: string) {
    startTransition(async () => {
      await deleteDailyGuestCount(d);
      router.refresh();
    });
  }

  function edit(row: Row) {
    setDate(row.date);
    setGuestCount(String(row.guestCount));
    setTips(row.tipsAmount != null ? String(row.tipsAmount) : "");
    setNotes(row.notes ?? "");
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Guests &amp; Tips</h3></div>
      <div className="panel-body">
        <div className="callout">
          Neither the sales CSV nor the current POS webhook carries a guest/cover count or tips, so both are logged here
          by hand — used to compute average spend per guest alongside the sales already imported.
        </div>
        <div className="line-builder-row" style={{ gridTemplateColumns: "140px 100px 100px 1fr auto", marginBottom: 8 }}>
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
          <input type="text" inputMode="numeric" placeholder="Guests" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
          <input type="text" inputMode="decimal" placeholder="Tips (AED)" value={tips} onChange={(e) => setTips(e.target.value)} />
          <input type="text" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="btn accent" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
        </div>
        {error && <div className="login-error" style={{ marginBottom: 8 }}>{error}</div>}
        {rows.length > 0 && (
          <div className="table-wrap" style={{ maxHeight: 240 }}>
            <table className="data">
              <thead><tr><th>Date</th><th className="right">Guests</th><th className="right">Tips</th><th>Notes</th><th>By</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date}>
                    <td>{r.date}</td>
                    <td className="mono-r">{fmt(r.guestCount, 0)}</td>
                    <td className="mono-r">{r.tipsAmount != null ? money(r.tipsAmount, 2) : "—"}</td>
                    <td style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{r.notes ?? "—"}</td>
                    <td style={{ fontSize: 11.5 }}>{r.enteredByName ?? "—"}</td>
                    <td>
                      <button className="line-remove" onClick={() => edit(r)} title="Edit" style={{ marginRight: 4 }}>✎</button>
                      <button className="line-remove" onClick={() => remove(r.date)} title="Remove">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

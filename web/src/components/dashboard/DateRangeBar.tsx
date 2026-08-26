// Shared GET-form date-range picker for Dashboard tabs backed by live,
// ongoing data (Menu Engineering, Cost by Sector, Sales Dashboard) — same
// `.daterange` pill pattern as Reports > Variance Analysis, so every
// time-filterable board in the app looks and behaves the same way.
export function DateRangeBar({ tab, from, to }: { tab: string; from: string; to: string }) {
  return (
    <form className="filterbar" method="get" style={{ marginBottom: 16, alignItems: "center" }}>
      <input type="hidden" name="tab" value={tab} />
      <div className="daterange">
        📅
        <input type="date" name="from" defaultValue={from} />
        <span>–</span>
        <input type="date" name="to" defaultValue={to} />
      </div>
      <button className="btn ghost" type="submit">Apply</button>
    </form>
  );
}

// Same .daterange pill markup as DateRangeBar (Dashboard tabs) and Reports,
// but without owning the surrounding <form> — for list pages that already
// have their own filterbar form with other fields (q, status) alongside
// the date range, rather than a tab-only date picker.
export function DateRangeFields({ from, to }: { from: string; to: string }) {
  return (
    <div className="daterange">
      📅
      <input type="date" name="from" defaultValue={from} />
      <span>–</span>
      <input type="date" name="to" defaultValue={to} />
    </div>
  );
}

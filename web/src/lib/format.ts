export function fmt(n: number | null | undefined, d = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function money(n: number | null | undefined, d = 2): string {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : "AED " + fmt(n, d);
}

export function pct(n: number | null | undefined, d = 1): string {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : (n >= 0 ? "+" : "") + fmt(n, d) + "%";
}

// UTC would drift a day behind for part of every night here — Dubai is
// UTC+4, so any time between midnight and 4am local, new Date().toISOString()
// still reports yesterday's date. Every branch is in the UAE (no DST), so
// pinning to Asia/Dubai instead of the server's own UTC clock keeps "today"
// correct for every default date across GRN/wastage/production/reports/etc.
export function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
}

// e.g. 754 -> "12h 34m", 8 -> "8m", 0 -> "0m" — for turnaround-time display
// (production open -> close), never negative since callers pass elapsed time.
export function formatDurationMinutes(totalMinutes: number | null | undefined): string {
  if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(totalMinutes)) return "—";
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
}

// For number-editing inputs: keep the raw text in state while the user is
// typing (so "2." can become "2.5" one keystroke at a time) and only parse
// with this where a number is actually needed — totals, submission, etc.
// Storing Number(raw) straight back into a controlled input's value strips
// an in-progress decimal point on every keystroke, since Number("2.") === 2
// and re-rendering with value={2} silently drops what was just typed.
export function num(s: string): number {
  return Number(s) || 0;
}

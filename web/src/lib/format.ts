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

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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

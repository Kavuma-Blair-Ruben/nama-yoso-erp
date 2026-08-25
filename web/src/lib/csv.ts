// Prefixed with a UTF-8 BOM so Excel (which otherwise guesses the system
// codepage) renders currency symbols and non-ASCII names correctly instead
// of mangling them.
const BOM = "﻿";

function escapeCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(escapeCell).join(","));
  return BOM + lines.join("\r\n");
}

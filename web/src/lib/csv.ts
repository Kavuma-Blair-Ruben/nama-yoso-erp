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

// Regex-based CSV line splitter handling quoted commas/newlines — good
// enough for the Excel-exported and hand-filled CSVs this app reads back
// in (POS exports, filled-in import templates), without a full RFC4180
// parser dependency.
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const splitRow = (row: string) => row.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)!.map((c) => c.replace(/^,/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
  const header = splitRow(lines[0]);
  return lines.slice(1).map((row) => {
    const cells = splitRow(row);
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    return obj;
  });
}

// Loose header matching — a hand-filled template or a POS export never
// agrees on exact column names/casing, so match against a few likely
// aliases (case-insensitive, trimmed) rather than one rigid header string.
export function pickField(row: Record<string, string>, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const key = keys.find((k) => k.trim().toLowerCase() === alias);
    if (key) return row[key];
  }
  return "";
}

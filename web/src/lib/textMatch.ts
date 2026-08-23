// Simple token-overlap fuzzy matching — no external library needed for
// matching a free-text label (an AI-read invoice line, a POS export's item
// name) against a catalog's own names, which already share most of their
// real words when correct. Used both client-side (GRN AI invoice matching)
// and server-side (recipe sales CSV import matching), so it lives here
// without a "use client"/"use server" directive.
function normalizeForMatch(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function matchScore(a: string, b: string): number {
  const wordsA = new Set(normalizeForMatch(a));
  const wordsB = new Set(normalizeForMatch(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.min(wordsA.size, wordsB.size);
}

export function bestTextMatch<T>(query: string, candidates: T[], nameOf: (item: T) => string, threshold = 0.4): T | null {
  let best: T | null = null;
  let bestScore = threshold;
  for (const c of candidates) {
    const score = matchScore(query, nameOf(c));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

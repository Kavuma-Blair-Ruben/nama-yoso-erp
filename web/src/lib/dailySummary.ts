// Plain-logic daily summary — deliberately not an LLM call. Same honest
// framing as the Predictive Orders math: this reads like a short human
// note because it's built from a few conditional sentence fragments, not
// because a model generated it. Free, instant, no API key/credits needed.

export type DailyDigestStats = {
  reorderAlertCount: number;
  salesToday: { qty: number; revenue: number; orderCount: number };
  upcomingPurchases: { count: number; value: number };
  openProductionBatches: number;
  wastageTodayCost: number;
};

function money0(n: number): string {
  return `AED ${Math.round(n).toLocaleString()}`;
}

export function buildDailySummary(stats: DailyDigestStats): string {
  const parts: string[] = [];

  if (stats.reorderAlertCount > 0) {
    parts.push(`${stats.reorderAlertCount} item${stats.reorderAlertCount === 1 ? "" : "s"} need${stats.reorderAlertCount === 1 ? "s" : ""} reordering to stay in stock`);
  } else {
    parts.push("stock coverage looks fine — nothing needs reordering right now");
  }

  if (stats.upcomingPurchases.count > 0) {
    parts.push(`${money0(stats.upcomingPurchases.value)} across ${stats.upcomingPurchases.count} purchase order${stats.upcomingPurchases.count === 1 ? "" : "s"} is on the way`);
  }

  if (stats.salesToday.orderCount > 0) {
    parts.push(`${money0(stats.salesToday.revenue)} in sales so far today across ${stats.salesToday.orderCount} recipe${stats.salesToday.orderCount === 1 ? "" : "s"}`);
  } else {
    parts.push("no sales recorded yet today");
  }

  if (stats.openProductionBatches > 0) {
    parts.push(`${stats.openProductionBatches} production batch${stats.openProductionBatches === 1 ? "" : "es"} still open`);
  }

  if (stats.wastageTodayCost > 0) {
    parts.push(`${money0(stats.wastageTodayCost)} in wastage logged today`);
  }

  // Two short sentences: the reorder/stock line stands alone, everything
  // else joins into one trailing sentence rather than a long comma chain.
  const [lead, ...rest] = parts;
  const sentences = [capitalize(lead), rest.length ? capitalize(rest.join(", ")) : null].filter(Boolean);
  return sentences.map((s) => `${s}.`).join(" ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

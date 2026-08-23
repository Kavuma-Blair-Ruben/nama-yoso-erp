import { money, pct, fmt } from "@/lib/format";

// Chart components are Client Components; pages rendering them are Server
// Components and can't hand down a plain formatter function as a prop
// (Next.js throws "Functions cannot be passed directly to Client
// Components"). Every chart takes this string instead and formats
// internally.
export type ChartValueFormat = "money0" | "money2" | "percent" | "plain";

export function formatChartValue(v: number, format: ChartValueFormat): string {
  switch (format) {
    case "money0":
      return money(v, 0);
    case "money2":
      return money(v, 2);
    case "percent":
      return pct(v);
    default:
      return fmt(v, 0);
  }
}

import Link from "next/link";

type SP = Record<string, string | string[] | undefined>;

const FORWARDED_KEYS = ["minDays", "q", "sector", "status"];

function buildQuery(sp: SP): string {
  const params = new URLSearchParams();
  for (const key of FORWARDED_KEYS) {
    const v = sp[key];
    if (typeof v === "string" && v) params.set(key, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function ReportExportBar({ tab, sp }: { tab: string; sp: SP }) {
  const suffix = buildQuery(sp);

  return (
    <div style={{ display: "flex", gap: 8, margin: "4px 0 16px" }}>
      <Link href={`/reports/${tab}/print${suffix}`} className="btn ghost">Print</Link>
      <Link href={`/reports/${tab}/csv${suffix}`} className="btn ghost">Download CSV</Link>
    </div>
  );
}

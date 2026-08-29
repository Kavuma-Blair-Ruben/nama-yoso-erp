"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Query-aware on top of the original pathname-only check — needed once a
// single page (Dashboard, Reports) has several sidebar entries that all
// share one path and differ only by ?tab=, e.g. /dashboard?tab=purchasing.
// Every query param named in `href` must match the real URL exactly; a
// plain href with no query string falls back to the old pathname-only rule.
export function NavLink({ href, label, ico, viewOnly }: { href: string; label: string; ico: string; viewOnly: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hrefPath, hrefQuery] = href.split("?");
  const pathMatches = pathname === hrefPath || (hrefPath !== "/dashboard" && pathname.startsWith(hrefPath + "/"));
  const hrefParams = new URLSearchParams(hrefQuery ?? "");
  const queryMatches = [...hrefParams.entries()].every(([k, v]) => searchParams.get(k) === v);
  const active = pathMatches && queryMatches;

  return (
    <Link href={href} className={active ? "active" : ""} prefetch={false}>
      <span className="ico">{ico}</span>
      {label}
      {viewOnly && <span className="viewonly-badge">view</span>}
    </Link>
  );
}

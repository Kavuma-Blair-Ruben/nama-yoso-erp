"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  label,
  ico,
  locked,
  viewOnly,
}: {
  href: string;
  label: string;
  ico: string;
  locked: boolean;
  viewOnly: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  return (
    <Link
      href={locked ? "#" : href}
      className={`${active ? "active" : ""} ${locked ? "locked" : ""}`}
      aria-disabled={locked}
      title={locked ? "No access for your current role" : undefined}
      onClick={(e) => locked && e.preventDefault()}
    >
      <span className="ico">{locked ? "🔒" : ico}</span>
      {label}
      {viewOnly && <span className="viewonly-badge">view</span>}
    </Link>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label, ico, viewOnly }: { href: string; label: string; ico: string; viewOnly: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  return (
    <Link href={href} className={active ? "active" : ""}>
      <span className="ico">{ico}</span>
      {label}
      {viewOnly && <span className="viewonly-badge">view</span>}
    </Link>
  );
}

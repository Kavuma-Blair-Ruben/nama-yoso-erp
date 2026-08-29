"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavLink } from "./NavLink";
import { matchesItem } from "./appsConfig";

export type SidebarApp = {
  id: string;
  label: string;
  items: { href: string; label: string; ico: string; viewOnly: boolean }[];
};

// Only ever renders the ONE app the current page belongs to, not every app
// the role can reach — this is the whole point of routing staff through the
// Apps launcher first: once they're inside e.g. Production, the sidebar
// stays scoped to Production instead of surfacing every other module they
// could technically also open, and "All Apps" is the only way back out.
export function SidebarNav({ apps }: { apps: SidebarApp[] }) {
  const pathname = usePathname();
  const currentApp = apps.find((app) => app.items.some((item) => matchesItem(pathname, item.href)));

  return (
    <div className="nav">
      <Link href="/apps" className="nav-all-apps" prefetch={false}>
        <span className="ico">⊞</span>
        All Apps
      </Link>
      {currentApp ? (
        <>
          <div className="nav-label">{currentApp.label}</div>
          {currentApp.items.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} ico={item.ico} viewOnly={item.viewOnly} />
          ))}
        </>
      ) : (
        apps.map((app) => (
          <div key={app.id}>
            <div className="nav-label">{app.label}</div>
            {app.items.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} ico={item.ico} viewOnly={item.viewOnly} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

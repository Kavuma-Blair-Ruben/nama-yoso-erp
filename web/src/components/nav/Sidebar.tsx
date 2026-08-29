import Link from "next/link";
import { getSession, hasAccess } from "@/server/auth/session";
import { logout } from "@/server/actions/auth";
import { SidebarNav, type SidebarApp } from "./SidebarNav";
import { Logo } from "@/components/ui/Logo";
import { APPS } from "./appsConfig";

export async function Sidebar() {
  const session = await getSession();

  // Same "not-yet-resolved session shows everything" fallback the old
  // per-item filter had — the real access boundary is requireSection /
  // assertPermission on each page and action, not this render.
  const visibleApps: SidebarApp[] = APPS.map((app) => {
    const items = app.items
      .filter((item) => !item.section || !session || hasAccess(session, item.section, "view"))
      .map((item) => ({
        href: item.href,
        label: item.label,
        ico: item.ico,
        viewOnly: !!(session && item.section && session.permissions[item.section] === "view"),
      }));
    return items.length ? { id: app.id, label: app.label, items } : null;
  }).filter((a): a is SidebarApp => a !== null);

  return (
    <div className="sidebar">
      <div className="brand">
        <Link href="/apps" className="brand-text" prefetch={false}>
          <Logo height={42} white />
          <span>Inventory Management</span>
        </Link>
      </div>
      <SidebarNav apps={visibleApps} />
      <div className="sidebar-foot">
        {session && (
          <div className="sidebar-user" style={{ marginTop: 10 }}>
            <span>
              <b>{session.profile.name}</b>
              <br />
              {session.role.name}
              <br />
              <Link href="/set-password" style={{ fontSize: 11 }} prefetch={false}>Change Password</Link>
            </span>
            <form action={logout}>
              <button type="submit" className="logout-btn">
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

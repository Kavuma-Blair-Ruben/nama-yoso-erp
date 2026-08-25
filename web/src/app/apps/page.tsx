import Link from "next/link";
import { requireAuth, hasAccess } from "@/server/auth/permissions";
import { logout } from "@/server/actions/auth";
import { Logo } from "@/components/ui/Logo";
import { APPS } from "@/components/nav/appsConfig";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function greetingFor(hour: number): string {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function AppsPage() {
  const session = await requireAuth();

  const visibleTiles = APPS.map((app) => {
    const first = app.items.find((item) => item.section === null || hasAccess(session, item.section, "view"));
    return first ? { ...app, href: first.href } : null;
  }).filter((t): t is (typeof APPS)[number] & { href: string } => t !== null);

  const firstName = session.profile.name.trim().split(/\s+/)[0] ?? session.profile.name;

  return (
    <div className="apps-launcher">
      <div className="apps-launcher-bar">
        <Logo height={32} />
        <div className="apps-launcher-user">
          <div className="apps-launcher-avatar">{initialsOf(session.profile.name)}</div>
          <div className="apps-launcher-user-text">
            <b>{session.profile.name}</b>
            <span>{session.role.name}</span>
          </div>
          <form action={logout}>
            <button type="submit" className="apps-launcher-signout" title="Sign out" aria-label="Sign out">⏻</button>
          </form>
        </div>
      </div>
      <div className="apps-launcher-body">
        <div className="apps-launcher-intro">
          <h1>{greetingFor(new Date().getHours())}, {firstName}</h1>
          <p>Choose where you&apos;d like to go.</p>
        </div>
        <div className="apps-grid">
          {visibleTiles.map((tile, i) => (
            <Link key={tile.id} href={tile.href} className="apps-tile" style={{ animationDelay: `${i * 35}ms` }}>
              <div
                className="apps-tile-icon"
                style={{ background: `linear-gradient(140deg, ${tile.color}, ${tile.colorDark})`, boxShadow: `0 10px 20px -8px ${tile.color}99` }}
              >
                {tile.icon}
              </div>
              <span>{tile.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

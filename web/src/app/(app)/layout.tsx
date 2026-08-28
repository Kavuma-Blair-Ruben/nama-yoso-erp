import { Sidebar } from "@/components/nav/Sidebar";
import { NotificationBell } from "@/components/nav/NotificationBell";
import { ChatAssistant } from "@/components/assistant/ChatAssistant";
import { getSession } from "@/server/auth/session";
import { getNotifications } from "@/server/db/queries/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // This runs on EVERY page via the layout — a non-essential attention feed
  // must never be allowed to crash the entire app if its queries fail (e.g.
  // a DB statement timeout during a degraded/slow database). Degrade to an
  // empty bell rather than an unhandled error taking down every page.
  let notifications: Awaited<ReturnType<typeof getNotifications>> = [];
  if (session) {
    try {
      notifications = await getNotifications(session);
    } catch {
      notifications = [];
    }
  }
  const initials = session
    ? session.profile.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]!.toUpperCase())
        .join("")
    : "";

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        {session && (
          <div className="topbar">
            <form action="/products" method="get" className="topbar-search">
              <span>🔍</span>
              <input type="text" name="q" placeholder="Search items, recipes, suppliers…" />
            </form>
            <div className="topbar-actions">
              <NotificationBell notifications={notifications} />
              <div className="topbar-avatar" title={session.profile.name}>{initials}</div>
            </div>
          </div>
        )}
        <div className="content">{children}</div>
      </div>
      {session && <ChatAssistant />}
    </div>
  );
}

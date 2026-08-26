import { Sidebar } from "@/components/nav/Sidebar";
import { NotificationBell } from "@/components/nav/NotificationBell";
import { ChatAssistant } from "@/components/assistant/ChatAssistant";
import { getSession } from "@/server/auth/session";
import { getNotifications } from "@/server/db/queries/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const notifications = session ? await getNotifications(session) : [];

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        {session && (
          <div className="topbar">
            <NotificationBell notifications={notifications} />
          </div>
        )}
        <div className="content">{children}</div>
      </div>
      {session && <ChatAssistant />}
    </div>
  );
}

"use server";

import { requireAuth } from "@/server/auth/permissions";
import { getNotifications, type Notification } from "@/server/db/queries/notifications";

// Thin client-callable wrapper around getNotifications, for NotificationBell's
// poll loop — the layout's own server-rendered fetch covers the first paint,
// this covers everything after without a full page reload.
export async function fetchNotifications(): Promise<Notification[]> {
  const session = await requireAuth();
  return getNotifications(session);
}

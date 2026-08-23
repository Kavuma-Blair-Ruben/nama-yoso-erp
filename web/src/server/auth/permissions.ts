import "server-only";
import { redirect } from "next/navigation";
import { getSession, hasAccess, type Session } from "./session";
import type { PermissionSectionKey, PermissionLevel } from "@/server/db/schema";

export { hasAccess } from "./session";
export type { Session } from "./session";
export { PERMISSION_SECTION_KEYS } from "@/server/db/schema";
export type { PermissionSectionKey, PermissionLevel };

/** Dashboard-only guard: any authenticated user, no section check (matches index.html's always-open dashboard). */
export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Page-level guard: no session -> /login, insufficient access -> /no-access. */
export async function requireSection(key: PermissionSectionKey, min: PermissionLevel = "view"): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasAccess(session, key, min)) redirect("/no-access");
  return session;
}

/**
 * Server Action guard: throws instead of redirecting. This is the real
 * security boundary — independent of proxy.ts and independent of whatever
 * the calling page's UI does or doesn't render. Always call this at the top
 * of every Server Action that reads or writes data gated by a section.
 */
export async function assertPermission(key: PermissionSectionKey, min: PermissionLevel = "edit"): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated.");
  if (!hasAccess(session, key, min)) {
    throw new Error(`Not authorized: your role does not have ${min} access to "${key}".`);
  }
  return session;
}

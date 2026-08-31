import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { withTimeout } from "@/lib/withTimeout";
import { db } from "@/server/db";
import { profiles, roles, rolePermissions, type PermissionSectionKey, type PermissionLevel } from "@/server/db/schema";

export type Session = {
  userId: string;
  email: string;
  profile: { id: string; name: string; branches: string[]; active: boolean };
  role: { id: string; key: string; name: string };
  permissions: Record<string, PermissionLevel>;
};

// See the comment where this is called, in getSession() below, for why this
// is safe to cache across requests. Keyed by userId via the function
// argument — unstable_cache folds call arguments into the cache key
// automatically, so different users never share an entry.
const getCachedProfileRow = unstable_cache(
  async (userId: string) =>
    db
      .select({
        profileId: profiles.id,
        name: profiles.name,
        branches: profiles.branches,
        active: profiles.active,
        roleId: roles.id,
        roleKey: roles.key,
        roleName: roles.name,
        sectionKey: rolePermissions.sectionKey,
        level: rolePermissions.level,
      })
      .from(profiles)
      .innerJoin(roles, eq(profiles.roleId, roles.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .where(eq(profiles.id, userId)),
  ["session-profile-row-v1"],
  { revalidate: 20 }
);

// Deduped per request render pass — safe to call from many Server Components.
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServerClient();
  // getUser() (not getSession()) — it revalidates the JWT against Supabase
  // Auth rather than trusting a cookie value that could've been tampered with.
  // Timed out rather than left unguarded: with no timeout, a slow/degraded
  // Supabase Auth upstream (e.g. their own connection-pooler incidents) made
  // every single page in the app hang forever with zero feedback, since this
  // runs on every authenticated page load. Falling back to "no session" on
  // timeout means a real session can get bounced to /login during a bad
  // patch — a real (rare) cost, but far better than an infinite frozen page.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
  try {
    const result = await withTimeout(supabase.auth.getUser(), 10000, "TIMEOUT");
    user = result.data.user;
  } catch {
    return null;
  }
  if (!user) return null;

  // Same reasoning as the getUser() call above, and just as critical — this
  // query runs on every authenticated page too, and an unguarded failure
  // here (e.g. a statement-timeout cancellation under a degraded database)
  // was an UNHANDLED error that crashed the entire app, not just one
  // feature: getSession() has no caller that catches it, so it took down
  // every single route through the (app) layout. Falls back to "no
  // session" on failure, same as an empty result already does below.
  //
  // Cached (not just the request-scoped cache() above) — a hard refresh
  // was re-running this join from scratch every time, on top of the
  // getUser() call above, on top of whatever the page itself needs. Safe
  // to cache: keyed by user.id, which only ever gets here after getUser()
  // has ALREADY verified the JWT fresh, above, uncached — so a stale cache
  // entry can only serve a real user their own (briefly stale) profile/
  // role/permissions, never another user's, and never bypass the identity
  // check itself. 20s revalidate, same order of magnitude as the 45s
  // precedent on the Dashboard's own cached queries.
  let rows: Awaited<ReturnType<typeof getCachedProfileRow>>;
  try {
    rows = await withTimeout(getCachedProfileRow(user.id), 10000, "TIMEOUT");
  } catch {
    return null;
  }

  if (rows.length === 0 || !rows[0].active) return null;

  const permissions: Record<string, PermissionLevel> = {};
  rows.forEach((r) => {
    permissions[r.sectionKey] = r.level as PermissionLevel;
  });

  return {
    userId: user.id,
    email: user.email ?? "",
    profile: { id: rows[0].profileId, name: rows[0].name, branches: rows[0].branches, active: rows[0].active },
    role: { id: rows[0].roleId, key: rows[0].roleKey, name: rows[0].roleName },
    permissions,
  };
});

export function hasAccess(session: Session, key: PermissionSectionKey, min: PermissionLevel): boolean {
  const level = session.permissions[key] ?? "none";
  if (level === "none") return false;
  if (min === "view") return level === "view" || level === "edit";
  return level === "edit";
}

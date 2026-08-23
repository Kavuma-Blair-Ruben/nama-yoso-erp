import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { db } from "@/server/db";
import { profiles, roles, rolePermissions, type PermissionSectionKey, type PermissionLevel } from "@/server/db/schema";

export type Session = {
  userId: string;
  email: string;
  profile: { id: string; name: string; branches: string[]; active: boolean };
  role: { id: string; key: string; name: string };
  permissions: Record<string, PermissionLevel>;
};

// Deduped per request render pass — safe to call from many Server Components.
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServerClient();
  // getUser() (not getSession()) — it revalidates the JWT against Supabase
  // Auth rather than trusting a cookie value that could've been tampered with.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const rows = await db
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
    .where(eq(profiles.id, user.id));

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

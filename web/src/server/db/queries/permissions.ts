import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { roles, rolePermissions, profiles, PERMISSION_SECTION_KEYS, type PermissionLevel } from "@/server/db/schema";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function listRolesWithPermissions() {
  const [roleRows, permRows, userCounts] = await Promise.all([
    db.select().from(roles).orderBy(roles.name),
    db.select().from(rolePermissions),
    db
      .select({ roleId: profiles.roleId, count: sql<number>`count(*)::int` })
      .from(profiles)
      .groupBy(profiles.roleId),
  ]);
  const countByRole = new Map(userCounts.map((c) => [c.roleId, c.count]));

  return roleRows.map((r) => {
    const permissions: Record<string, PermissionLevel> = {};
    for (const key of PERMISSION_SECTION_KEYS) permissions[key] = "none";
    for (const p of permRows.filter((p) => p.roleId === r.id)) permissions[p.sectionKey] = p.level as PermissionLevel;
    return { ...r, permissions, userCount: countByRole.get(r.id) ?? 0 };
  });
}

export async function listProfilesWithRole() {
  return db
    .select({
      id: profiles.id,
      name: profiles.name,
      email: profiles.email,
      branches: profiles.branches,
      active: profiles.active,
      roleId: profiles.roleId,
      roleName: roles.name,
    })
    .from(profiles)
    .innerJoin(roles, eq(profiles.roleId, roles.id))
    .orderBy(profiles.name);
}

// Real Supabase Auth accounts that don't yet have a profiles row — the
// linking step below never creates or touches credentials, it only lets an
// admin attach ERP role/branch data to an account that already exists (was
// created via the Supabase dashboard or the account owner's own signup).
export async function listUnlinkedAuthUsers() {
  const existing = await db.select({ id: profiles.id }).from(profiles);
  const existingIds = new Set(existing.map((e) => e.id));
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (error) return [];
  return data.users.filter((u) => !existingIds.has(u.id)).map((u) => ({ id: u.id, email: u.email ?? "" }));
}

export async function getRoleDetail(id: string) {
  const [role] = await db.select().from(roles).where(eq(roles.id, id));
  if (!role) return null;
  const permRows = await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, id));
  const permissions: Record<string, PermissionLevel> = {};
  for (const key of PERMISSION_SECTION_KEYS) permissions[key] = "none";
  for (const p of permRows) permissions[p.sectionKey] = p.level as PermissionLevel;
  return { role, permissions };
}

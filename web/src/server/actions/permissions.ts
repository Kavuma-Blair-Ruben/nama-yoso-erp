"use server";

import { revalidatePath } from "next/cache";
import { eq, and, ne, count } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { roles, rolePermissions, profiles, auditLog, PERMISSION_SECTION_KEYS, type PermissionLevel } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail, isEmailConfigured } from "@/lib/email";

const levelSchema = z.enum(["none", "view", "edit"]);
const permissionsSchema = z.record(z.string(), levelSchema);

export type PermissionsActionResult = { error?: string; id?: string };

export async function saveRole(id: string | null, name: string, permissions: Record<string, PermissionLevel>): Promise<PermissionsActionResult> {
  const session = await assertPermission("permissions", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a role name." };
  const parsedPerms = permissionsSchema.safeParse(permissions);
  if (!parsedPerms.success) return { error: "Invalid permission levels." };

  const rows = PERMISSION_SECTION_KEYS.map((key) => ({ sectionKey: key, level: parsedPerms.data[key] ?? "none" }));

  if (id) {
    const [existing] = await db.select().from(roles).where(eq(roles.id, id));
    if (!existing) return { error: "Role not found." };
    await db.transaction(async (tx) => {
      await tx.update(roles).set({ name: trimmed, updatedAt: new Date() }).where(eq(roles.id, id));
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      await tx.insert(rolePermissions).values(rows.map((r) => ({ roleId: id, ...r })));
    });
    await db.insert(auditLog).values({ actorId: session.profile.id, action: "Updated", entity: "Role", entityLabel: trimmed, detail: "Permissions changed" });
    revalidatePath("/permissions");
    return { id };
  }

  const newId = await db.transaction(async (tx) => {
    const [created] = await tx.insert(roles).values({ key: `role_${Date.now()}`, name: trimmed, isSystem: false }).returning({ id: roles.id });
    await tx.insert(rolePermissions).values(rows.map((r) => ({ roleId: created.id, ...r })));
    return created.id;
  });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Role", entityLabel: trimmed, detail: "New role" });
  revalidatePath("/permissions");
  return { id: newId };
}

export async function deleteRole(id: string): Promise<{ error?: string }> {
  const session = await assertPermission("permissions", "edit");
  const [role] = await db.select().from(roles).where(eq(roles.id, id));
  if (!role) return { error: "Role not found." };
  if (role.isSystem) return { error: "System roles can't be deleted." };
  const [{ value: userCount }] = await db.select({ value: count() }).from(profiles).where(eq(profiles.roleId, id));
  if (userCount > 0) return { error: `${userCount} user(s) still have this role — reassign them first.` };

  await db.delete(roles).where(eq(roles.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Role", entityLabel: role.name });
  revalidatePath("/permissions");
  return {};
}

const profileSchema = z.object({
  name: z.string().min(1),
  roleId: z.string().min(1),
  branches: z.array(z.string()),
  active: z.boolean(),
});

export async function updateProfile(id: string, input: z.infer<typeof profileSchema>): Promise<{ error?: string }> {
  const session = await assertPermission("permissions", "edit");
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a name and pick a role." };

  if (id === session.profile.id && !parsed.data.active) {
    return { error: "You can't deactivate your own account." };
  }
  if (id === session.profile.id && session.role.key === "role_owner" && parsed.data.roleId !== session.role.id) {
    const [{ value: ownerCount }] = await db
      .select({ value: count() })
      .from(profiles)
      .innerJoin(roles, eq(profiles.roleId, roles.id))
      .where(and(eq(roles.key, "role_owner"), ne(profiles.id, session.profile.id)));
    if (ownerCount === 0) return { error: "You're the last Owner / Admin — assign another user that role before changing your own." };
  }

  await db
    .update(profiles)
    .set({ name: parsed.data.name.trim(), roleId: parsed.data.roleId, branches: parsed.data.branches, active: parsed.data.active, updatedAt: new Date() })
    .where(eq(profiles.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Updated", entity: "User", entityLabel: parsed.data.name.trim(), detail: parsed.data.active ? "Active" : "Deactivated" });
  revalidatePath("/permissions");
  return {};
}

const linkSchema = z.object({
  authUserId: z.string().min(1),
  email: z.string().min(1),
  name: z.string().min(1),
  roleId: z.string().min(1),
  branches: z.array(z.string()),
});

// Attaches ERP role/branch data to a Supabase Auth account that already
// exists — never creates or touches a login credential itself. Creating the
// actual account (email/password) stays a manual step via the Supabase
// dashboard or the person's own sign-up, outside this app's action surface.
export async function linkAuthUser(input: z.infer<typeof linkSchema>): Promise<{ error?: string }> {
  const session = await assertPermission("permissions", "edit");
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { error: "Fill in a name and pick a role." };

  const [existing] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, parsed.data.authUserId));
  if (existing) return { error: "That account is already linked to a profile." };

  await db.insert(profiles).values({
    id: parsed.data.authUserId,
    name: parsed.data.name.trim(),
    email: parsed.data.email,
    roleId: parsed.data.roleId,
    branches: parsed.data.branches,
    active: true,
  });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Linked", entity: "User", entityLabel: parsed.data.name.trim(), detail: parsed.data.email });
  revalidatePath("/permissions");
  return {};
}

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  roleId: z.string().min(1),
  branches: z.array(z.string()),
});

// Creates the login itself (via Supabase Admin API) AND the profile/role in
// one step — unlike linkAuthUser, which only attaches a role to an account
// that already exists. This never sets or even sees a password: Supabase
// creates the auth.users row with no password set, we build our own
// verify-then-set-password link from the returned hashed_token (routed
// through /auth/confirm, not Supabase's hosted redirect, so we control the
// whole flow) and email it via Resend — the invitee sets their own password
// on /set-password when they click it.
export async function inviteUser(input: z.infer<typeof inviteSchema>): Promise<{ error?: string }> {
  const session = await assertPermission("permissions", "edit");
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a valid email, name, and role." };
  if (!isEmailConfigured()) return { error: "Email sending isn't configured yet — add RESEND_API_KEY to .env.local." };

  const email = parsed.data.email.trim().toLowerCase();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { name: parsed.data.name.trim() } },
  });
  if (error) return { error: error.message.includes("already been registered") ? "That email already has a login — use \"Link an Existing Login\" below instead." : error.message };

  await db.insert(profiles).values({
    id: data.user.id,
    name: parsed.data.name.trim(),
    email,
    roleId: parsed.data.roleId,
    branches: parsed.data.branches,
    active: true,
  });

  const link = `${siteUrl}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=invite`;
  const sent = await sendEmail({
    to: email,
    subject: "You've been invited to NAMA YOSO Cost Control ERP",
    text: `${parsed.data.name.trim()}, you've been invited to NAMA YOSO Cost Control ERP.\n\nSet your password to get started:\n${link}\n\nThis link is single-use and expires after a while — ask your admin to resend the invite if it's expired.`,
  });
  if (sent.error) {
    // Login + profile were already created — surface the email failure so
    // the admin knows to resend or share the link manually, but don't roll
    // back the account (matches linkAuthUser's "no partial undo" behavior).
    await db.insert(auditLog).values({ actorId: session.profile.id, action: "Invited", entity: "User", entityLabel: parsed.data.name.trim(), detail: `${email} — email failed: ${sent.error}` });
    revalidatePath("/permissions");
    return { error: `Account created, but the invite email failed to send: ${sent.error}` };
  }

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Invited", entity: "User", entityLabel: parsed.data.name.trim(), detail: email });
  revalidatePath("/permissions");
  return {};
}

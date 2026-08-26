"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { locationOrderLimits, branchReceivingLimits, rolePurchaseLimits, policySettings, branches, roles, auditLog, poApprovalSteps } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";

export type PolicyActionResult = { error?: string } | undefined;

const limitSchema = z.object({
  location: z.string().min(1),
  amount: z.coerce.number().positive(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]),
});

export async function saveLocationLimit(_prev: PolicyActionResult, formData: FormData): Promise<PolicyActionResult> {
  const session = await assertPermission("policies", "edit");
  const parsed = limitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid amount." };
  const { location, amount, frequency } = parsed.data;

  await db
    .insert(locationOrderLimits)
    .values({ location, amount, frequency })
    .onConflictDoUpdate({ target: locationOrderLimits.location, set: { amount, frequency } });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Updated", entity: "Location Order Limit", entityLabel: location, detail: `AED ${amount} / ${frequency}` });
  revalidatePath("/policies");
}

export async function removeLocationLimit(location: string): Promise<{ error?: string }> {
  const session = await assertPermission("policies", "edit");
  await db.delete(locationOrderLimits).where(eq(locationOrderLimits.location, location));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Removed", entity: "Location Order Limit", entityLabel: location });
  revalidatePath("/policies");
  return {};
}

const branchLimitSchema = z.object({
  branchId: z.string().min(1),
  amount: z.coerce.number().positive(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]),
});

export async function saveBranchReceivingLimit(_prev: PolicyActionResult, formData: FormData): Promise<PolicyActionResult> {
  const session = await assertPermission("policies", "edit");
  const parsed = branchLimitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid amount." };
  const { branchId, amount, frequency } = parsed.data;

  const [branch] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, branchId));
  if (!branch) return { error: "Branch not found." };

  await db
    .insert(branchReceivingLimits)
    .values({ branchId, amount, frequency })
    .onConflictDoUpdate({ target: branchReceivingLimits.branchId, set: { amount, frequency } });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Updated", entity: "Branch Receiving Limit", entityLabel: branch.name, detail: `AED ${amount} / ${frequency}` });
  revalidatePath("/policies");
}

export async function removeBranchReceivingLimit(branchId: string): Promise<{ error?: string }> {
  const session = await assertPermission("policies", "edit");
  const [branch] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, branchId));
  await db.delete(branchReceivingLimits).where(eq(branchReceivingLimits.branchId, branchId));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Removed", entity: "Branch Receiving Limit", entityLabel: branch?.name ?? branchId });
  revalidatePath("/policies");
  return {};
}

export async function saveRolePurchaseLimit(roleId: string, field: "maxPoAmount" | "maxGrnAmount", value: number | null): Promise<{ error?: string }> {
  const session = await assertPermission("policies", "edit");
  const [role] = await db.select({ name: roles.name }).from(roles).where(eq(roles.id, roleId));
  if (!role) return { error: "Role not found." };

  await db
    .insert(rolePurchaseLimits)
    .values({ roleId, [field]: value })
    .onConflictDoUpdate({ target: rolePurchaseLimits.roleId, set: { [field]: value } });
  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: "Updated",
    entity: "Role Purchase Limit",
    entityLabel: role.name,
    detail: `${field === "maxPoAmount" ? "Max PO" : "Max GRN"} ${value != null ? `AED ${value}` : "unlimited"}`,
  });
  revalidatePath("/policies");
  return {};
}

async function ensurePolicySettingsRow() {
  const [existing] = await db.select().from(policySettings);
  if (existing) return existing;
  const [created] = await db.insert(policySettings).values({}).returning();
  return created;
}

export async function savePolicyPercent(field: "abovePparOverPct" | "receiveAbovePricePct", value: number | null): Promise<{ error?: string }> {
  const session = await assertPermission("policies", "edit");
  await ensurePolicySettingsRow();
  await db.update(policySettings).set({ [field]: value }).where(eq(policySettings.id, "default"));
  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: "Updated",
    entity: "Policy Setting",
    entityLabel: field === "abovePparOverPct" ? "Above Par Order Limit" : "Receive Above Expected Price",
    detail: value != null ? `${value}%` : "Cleared",
  });
  revalidatePath("/policies");
  return {};
}

// poApprovalRoleId (the single-role predecessor of the chain below) is no
// longer set here — the chain in poApprovalSteps is the only thing that can
// gate anything now; this threshold just says at what value the currently
// configured chain, if any, starts applying.
export async function savePoApprovalPolicy(threshold: number | null): Promise<{ error?: string }> {
  const session = await assertPermission("policies", "edit");
  await ensurePolicySettingsRow();
  await db.update(policySettings).set({ poApprovalThreshold: threshold }).where(eq(policySettings.id, "default"));
  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: "Updated",
    entity: "Policy Setting",
    entityLabel: "PO Approval Threshold",
    detail: threshold != null ? `AED ${threshold}+ requires approval` : "Cleared",
  });
  revalidatePath("/policies");
  return {};
}

// Replaces the entire chain in one call rather than add/remove-one-step —
// the UI is always exactly 5 role-picker slots, so "save" naturally means
// "this is the whole chain now". Empty/unselected slots are dropped and the
// remaining steps are renumbered 1..N contiguously, so a gap in the middle
// (e.g. step 2 left blank) doesn't produce a step the enforcement logic can
// never reach.
export async function savePoApprovalSteps(roleIds: (string | null)[]): Promise<{ error?: string }> {
  const session = await assertPermission("policies", "edit");
  const compact = roleIds.filter((id): id is string => !!id).slice(0, 5);

  await db.transaction(async (tx) => {
    await tx.delete(poApprovalSteps);
    if (compact.length > 0) {
      await tx.insert(poApprovalSteps).values(compact.map((roleId, i) => ({ stepOrder: i + 1, roleId })));
    }
  });

  const roleNames = compact.length
    ? (await db.select({ id: roles.id, name: roles.name }).from(roles).where(inArray(roles.id, compact)))
    : [];
  const nameById = new Map(roleNames.map((r) => [r.id, r.name]));
  const detail = compact.length ? compact.map((id, i) => `${i + 1}. ${nameById.get(id) ?? id}`).join(", ") : "Cleared";

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Updated", entity: "Policy Setting", entityLabel: "PO Approval Chain", detail });
  revalidatePath("/policies");
  return {};
}

export async function toggleInternalOnlyLocation(location: string, checked: boolean): Promise<{ error?: string }> {
  const session = await assertPermission("policies", "edit");
  const settings = await ensurePolicySettingsRow();
  const next = checked
    ? [...new Set([...settings.internalOnlyLocations, location])]
    : settings.internalOnlyLocations.filter((l) => l !== location);
  await db.update(policySettings).set({ internalOnlyLocations: next }).where(eq(policySettings.id, "default"));
  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: checked ? "Restricted" : "Unrestricted",
    entity: "Policy Setting",
    entityLabel: "Internal Only Ordering",
    detail: location,
  });
  revalidatePath("/policies");
  return {};
}

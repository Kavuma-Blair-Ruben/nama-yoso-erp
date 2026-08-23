import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { locationOrderLimits, policySettings, roles, branches, branchReceivingLimits, rolePurchaseLimits } from "@/server/db/schema";

export async function listLocationOrderLimits() {
  return db.select().from(locationOrderLimits).orderBy(locationOrderLimits.location);
}

export async function listBranchReceivingLimits() {
  return db
    .select({ branchId: branchReceivingLimits.branchId, branchName: branches.name, amount: branchReceivingLimits.amount, frequency: branchReceivingLimits.frequency })
    .from(branchReceivingLimits)
    .innerJoin(branches, eq(branchReceivingLimits.branchId, branches.id))
    .orderBy(branches.name);
}

// One row per role, even if it has no configured limit yet (maxPoAmount/
// maxGrnAmount both null = unlimited) — the admin UI edits every role's
// caps in place rather than an add/remove list, since the set of roles is
// fixed and small.
export async function listRolePurchaseLimits() {
  const allRoles = await db.select({ id: roles.id, name: roles.name }).from(roles).orderBy(roles.name);
  const limits = await db.select().from(rolePurchaseLimits);
  const byRoleId = new Map(limits.map((l) => [l.roleId, l]));
  return allRoles.map((r) => ({ roleId: r.id, roleName: r.name, maxPoAmount: byRoleId.get(r.id)?.maxPoAmount ?? null, maxGrnAmount: byRoleId.get(r.id)?.maxGrnAmount ?? null }));
}

export async function getPolicySettings() {
  const [row] = await db
    .select({
      id: policySettings.id,
      abovePparOverPct: policySettings.abovePparOverPct,
      receiveAbovePricePct: policySettings.receiveAbovePricePct,
      internalOnlyLocations: policySettings.internalOnlyLocations,
      poApprovalThreshold: policySettings.poApprovalThreshold,
      poApprovalRoleId: policySettings.poApprovalRoleId,
      poApprovalRoleName: roles.name,
    })
    .from(policySettings)
    .leftJoin(roles, eq(policySettings.poApprovalRoleId, roles.id));
  return (
    row ?? {
      id: "default",
      abovePparOverPct: null,
      receiveAbovePricePct: null,
      internalOnlyLocations: [] as string[],
      poApprovalThreshold: null,
      poApprovalRoleId: null,
      poApprovalRoleName: null,
    }
  );
}

export async function listRoles() {
  return db.select({ id: roles.id, name: roles.name }).from(roles).orderBy(roles.name);
}

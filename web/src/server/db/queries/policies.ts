import { eq, and, gte, isNull, desc } from "drizzle-orm";
import { db } from "@/server/db";
import {
  locationOrderLimits,
  policySettings,
  roles,
  branches,
  branchReceivingLimits,
  rolePurchaseLimits,
  poApprovalSteps,
  purchaseLimitApprovers,
  limitOverrideRequests,
  profiles,
} from "@/server/db/schema";

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
    })
    .from(policySettings);
  return (
    row ?? {
      id: "default",
      abovePparOverPct: null,
      receiveAbovePricePct: null,
      internalOnlyLocations: [] as string[],
      poApprovalThreshold: null,
    }
  );
}

export async function listRoles() {
  return db.select({ id: roles.id, name: roles.name }).from(roles).orderBy(roles.name);
}

// The current approval chain, ordered — empty means no chain is configured
// (poApprovalThreshold, if set, then has no effect: nothing to gate on).
export async function listPoApprovalSteps() {
  return db
    .select({ stepOrder: poApprovalSteps.stepOrder, roleId: poApprovalSteps.roleId, roleName: roles.name })
    .from(poApprovalSteps)
    .innerJoin(roles, eq(poApprovalSteps.roleId, roles.id))
    .orderBy(poApprovalSteps.stepOrder);
}

// Named individuals who can approve a one-time exception to a role's PO/GRN
// cap — deliberately by-person, not by role (see schema.ts comment on
// purchaseLimitApprovers).
export async function listLimitApprovers() {
  return db
    .select({ id: purchaseLimitApprovers.id, userId: purchaseLimitApprovers.userId, name: profiles.name, email: profiles.email })
    .from(purchaseLimitApprovers)
    .innerJoin(profiles, eq(purchaseLimitApprovers.userId, profiles.id))
    .orderBy(profiles.name);
}

export async function isDesignatedLimitApprover(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: purchaseLimitApprovers.id }).from(purchaseLimitApprovers).where(eq(purchaseLimitApprovers.userId, userId));
  return !!row;
}

export async function listPendingLimitOverrideRequests() {
  return db
    .select({
      id: limitOverrideRequests.id,
      requestType: limitOverrideRequests.requestType,
      amount: limitOverrideRequests.amount,
      context: limitOverrideRequests.context,
      requestedByName: profiles.name,
      createdAt: limitOverrideRequests.createdAt,
    })
    .from(limitOverrideRequests)
    .innerJoin(profiles, eq(limitOverrideRequests.requestedBy, profiles.id))
    .where(eq(limitOverrideRequests.status, "PENDING"))
    .orderBy(desc(limitOverrideRequests.createdAt));
}

// The requester's own recent requests, so they can see whether theirs was
// approved/denied without needing approver access themselves.
export async function listMyLimitOverrideRequests(userId: string) {
  return db
    .select()
    .from(limitOverrideRequests)
    .where(eq(limitOverrideRequests.requestedBy, userId))
    .orderBy(desc(limitOverrideRequests.createdAt))
    .limit(20);
}

// The most recent APPROVED, not-yet-consumed exception for this requester
// and type that covers at least the amount now being blocked — found and
// atomically claimed (consumedAt set) by the caller inside its own
// transaction, not here, since "found" and "consumed" must be one atomic
// step to avoid two concurrent requests spending the same approval twice.
export async function findUsableLimitOverride(userId: string, requestType: "PO" | "GRN", amount: number) {
  const [row] = await db
    .select()
    .from(limitOverrideRequests)
    .where(
      and(
        eq(limitOverrideRequests.requestedBy, userId),
        eq(limitOverrideRequests.requestType, requestType),
        eq(limitOverrideRequests.status, "APPROVED"),
        isNull(limitOverrideRequests.consumedAt),
        gte(limitOverrideRequests.amount, amount)
      )
    )
    .orderBy(desc(limitOverrideRequests.createdAt))
    .limit(1);
  return row ?? null;
}

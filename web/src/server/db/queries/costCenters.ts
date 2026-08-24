import "server-only";
import { db } from "@/server/db";
import { costCenters } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";

export async function listCostCentersAdmin() {
  return db
    .select({ id: costCenters.id, branchId: costCenters.branchId, name: costCenters.name, isActive: costCenters.isActive })
    .from(costCenters)
    .orderBy(costCenters.name);
}

// Full active list across every branch — for client components that already
// have a branch picker of their own and filter this down themselves as the
// user changes it (Wastage/Stock Count builders), instead of a server round
// trip per branch change.
export async function listAllActiveCostCenters() {
  return db
    .select({ id: costCenters.id, branchId: costCenters.branchId, name: costCenters.name })
    .from(costCenters)
    .where(eq(costCenters.isActive, true))
    .orderBy(costCenters.name);
}

export async function listActiveCostCentersForBranch(branchId: string) {
  return db
    .select({ id: costCenters.id, name: costCenters.name })
    .from(costCenters)
    .where(and(eq(costCenters.branchId, branchId), eq(costCenters.isActive, true)))
    .orderBy(costCenters.name);
}

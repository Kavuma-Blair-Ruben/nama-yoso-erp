import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { costCenters } from "@/server/db/schema";

type Db = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Fallback sector for stock writes that don't yet have their own
// cost-center picker (GRN/Production until that UI lands, CK Sales/Customer
// Returns which never get one) — every branch is seeded with a "General"
// (or "Central Warehouse") sector by the branch-scoping migration.
export async function getDefaultCostCenterId(tx: Db | typeof db, branchId: string, name = "General"): Promise<string> {
  const [row] = await tx.select({ id: costCenters.id }).from(costCenters).where(and(eq(costCenters.branchId, branchId), eq(costCenters.name, name)));
  if (!row) throw new Error(`No "${name}" cost center found for branch ${branchId}.`);
  return row.id;
}

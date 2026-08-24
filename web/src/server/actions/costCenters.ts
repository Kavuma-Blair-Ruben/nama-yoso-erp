"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { costCenters, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";

function revalidateCostCenterPages() {
  revalidatePath("/settings");
}

export async function createCostCenter(branchId: string, name: string): Promise<{ error?: string }> {
  const session = await assertPermission("branchsettings", "edit");
  const trimmed = name.trim();
  if (!branchId) return { error: "Pick a branch." };
  if (!trimmed) return { error: "Enter a sector name." };

  try {
    await db.insert(costCenters).values({ branchId, name: trimmed, isActive: true });
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === "23505") return { error: `A sector named "${trimmed}" already exists at this branch.` };
    throw err;
  }

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Cost Center", entityLabel: trimmed, detail: "Added" });
  revalidateCostCenterPages();
  return {};
}

export async function renameCostCenter(id: string, name: string): Promise<{ error?: string }> {
  const session = await assertPermission("branchsettings", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a sector name." };

  await db.update(costCenters).set({ name: trimmed }).where(eq(costCenters.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Renamed", entity: "Cost Center", entityLabel: trimmed, detail: "Renamed" });
  revalidateCostCenterPages();
  return {};
}

export async function setCostCenterActive(id: string, isActive: boolean): Promise<{ error?: string }> {
  const session = await assertPermission("branchsettings", "edit");
  const [center] = await db.select({ name: costCenters.name }).from(costCenters).where(eq(costCenters.id, id));
  if (!center) return { error: "Sector not found." };

  await db.update(costCenters).set({ isActive }).where(eq(costCenters.id, id));
  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: isActive ? "Activated" : "Deactivated",
    entity: "Cost Center",
    entityLabel: center.name,
    detail: isActive ? "Marked active" : "Marked inactive",
  });
  revalidateCostCenterPages();
  return {};
}

// Cost centers accumulate real transaction history (POs, GRNs, stock
// balances, production, wastage, transfers, stock counts all reference
// cost_center_id with no cascade) — deleting one that's actually been used
// throws a Postgres foreign-key violation (23503), turned into a friendly
// nudge toward deactivating instead, same pattern as deleteBranch.
export async function deleteCostCenter(id: string): Promise<{ error?: string }> {
  const session = await assertPermission("branchsettings", "edit");
  const [center] = await db.select({ name: costCenters.name }).from(costCenters).where(eq(costCenters.id, id));
  if (!center) return { error: "Sector not found." };

  try {
    await db.delete(costCenters).where(eq(costCenters.id, id));
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === "23503") {
      return { error: "This sector has transaction history (orders, stock, wastage, etc.) and can't be deleted — deactivate it instead." };
    }
    throw err;
  }

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Cost Center", entityLabel: center.name, detail: "Removed" });
  revalidateCostCenterPages();
  return {};
}

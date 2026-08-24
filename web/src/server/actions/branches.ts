"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { branches, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";

function revalidateBranchPages() {
  revalidatePath("/settings");
  revalidatePath("/branches");
}

export async function createBranch(code: string, name: string): Promise<{ error?: string }> {
  const session = await assertPermission("branchsettings", "edit");
  const trimmedCode = code.trim().toUpperCase().replace(/\s+/g, "_");
  const trimmedName = name.trim();
  if (!trimmedCode) return { error: "Enter a branch code." };
  if (!trimmedName) return { error: "Enter a branch name." };

  const [existing] = await db.select({ id: branches.id }).from(branches).where(eq(branches.code, trimmedCode));
  if (existing) return { error: `Branch code "${trimmedCode}" already exists.` };

  await db.insert(branches).values({ code: trimmedCode, name: trimmedName });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Branch", entityLabel: trimmedName, detail: `Code ${trimmedCode}` });
  revalidateBranchPages();
  return {};
}

export async function renameBranch(id: string, name: string): Promise<{ error?: string }> {
  const session = await assertPermission("branchsettings", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a branch name." };

  await db.update(branches).set({ name: trimmed }).where(eq(branches.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Renamed", entity: "Branch", entityLabel: trimmed, detail: "Renamed" });
  revalidateBranchPages();
  return {};
}

export async function setBranchActive(id: string, isActive: boolean): Promise<{ error?: string }> {
  const session = await assertPermission("branchsettings", "edit");
  const [branch] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, id));
  if (!branch) return { error: "Branch not found." };

  await db.update(branches).set({ isActive }).where(eq(branches.id, id));
  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: isActive ? "Activated" : "Deactivated",
    entity: "Branch",
    entityLabel: branch.name,
    detail: isActive ? "Marked active" : "Marked inactive — hidden from new transaction branch pickers isn't enforced yet, but it's flagged for whoever builds that next",
  });
  revalidateBranchPages();
  return {};
}

// Branches accumulate real transaction history (POs, GRNs, stock balances,
// production, transfers, stock counts, delivery notes all hold a required
// branch_id FK with no cascade) — deleting one that's actually been used
// throws a Postgres foreign-key violation (23503), which we turn into a
// friendly nudge toward deactivating instead of a raw DB error.
export async function deleteBranch(id: string): Promise<{ error?: string }> {
  const session = await assertPermission("branchsettings", "edit");
  const [branch] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, id));
  if (!branch) return { error: "Branch not found." };

  try {
    await db.delete(branches).where(eq(branches.id, id));
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === "23503") {
      return { error: "This branch has transaction history (orders, GRNs, stock, etc.) and can't be deleted — deactivate it instead." };
    }
    throw err;
  }

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Branch", entityLabel: branch.name, detail: "Removed" });
  revalidateBranchPages();
  return {};
}

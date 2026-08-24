import "server-only";
import { db } from "@/server/db";
import { branches } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function listBranchesAdmin() {
  return db
    .select({ id: branches.id, code: branches.code, name: branches.name, isActive: branches.isActive })
    .from(branches)
    .orderBy(branches.name);
}

export async function listActiveBranches() {
  return db
    .select({ id: branches.id, code: branches.code, name: branches.name })
    .from(branches)
    .where(eq(branches.isActive, true))
    .orderBy(branches.name);
}

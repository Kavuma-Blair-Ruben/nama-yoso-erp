import "server-only";
import { db } from "@/server/db";
import { branches } from "@/server/db/schema";

export async function listBranchesAdmin() {
  return db
    .select({ id: branches.id, code: branches.code, name: branches.name, isActive: branches.isActive })
    .from(branches)
    .orderBy(branches.name);
}

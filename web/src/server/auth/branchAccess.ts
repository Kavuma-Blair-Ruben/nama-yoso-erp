import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { branches } from "@/server/db/schema";
import type { Session } from "@/server/auth/session";

// profiles.branches stores branch CODES ("NAMAYOSO MIRDIFF"), not ids — same
// convention as stockItems.branches/mainRecipes.branches/subRecipes.branches
// (which also key off code, not id). Empty array = all branches (every
// existing real user today), non-empty = restricted to exactly those codes
// (used to confine the demo/trainee account to the Demo Branch).
export function allowedBranchCodes(session: Session): string[] | null {
  return session.profile.branches.length === 0 ? null : session.profile.branches;
}

// Defense-in-depth for the server actions behind every branch-scoped
// builder (GRN, PO, Wastage, Production, Stock Count, Transfers) — the
// dropdown already only offers allowed branches, but a forged/bypassed
// request could still submit an out-of-scope branchId directly. branchId
// here is the real branches.id (every branchId column in the schema is a
// uuid FK), so this does one lookup to translate it to a code before
// checking it against the session's allowed codes.
export async function assertBranchAccess(session: Session, branchId: string): Promise<void> {
  const allowed = allowedBranchCodes(session);
  if (!allowed) return;
  const [branch] = await db.select({ code: branches.code }).from(branches).where(eq(branches.id, branchId));
  if (!branch || !allowed.includes(branch.code)) {
    throw new Error("Not authorized: your account isn't assigned to this branch.");
  }
}

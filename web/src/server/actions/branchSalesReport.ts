"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { posOrders, dailyGuestCounts, branches, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";

export type BranchSalesRow = {
  branchName: string;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  orderCount: number;
  guestCount: number;
  tipsAmount: number;
  voidAmount: number;
  voidQty: number;
};

export type BranchSalesImportResult = { error?: string; imported?: number; unmatched?: string[] };

// Foodics' "Sales by Branch Report" — a genuine order-level daily summary
// per branch (Order Count, Guest Count, Tips, Void), unlike the per-product
// export (which has no concept of an order, guest, or branch at all). This
// is the authoritative source for those figures: importing it writes a real
// posOrders row (so getSalesDashboardStats's POS-sourced branch picks this
// up with a real order count instead of the CSV-fallback's item-count
// approximation) and sets that day's guest count/tips directly, replacing
// the need to type them in by hand.
const BRANCH_KEYWORDS: { keyword: string; branchCode: string }[] = [
  { keyword: "mirdif", branchCode: "NAMAYOSO MIRDIFF" },
  { keyword: "marsa", branchCode: "NAMAYOSO MARSA" },
];

function matchBranchName(foodicsBranchName: string): string | null {
  const norm = foodicsBranchName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const { keyword, branchCode } of BRANCH_KEYWORDS) {
    if (norm.includes(keyword)) return branchCode;
  }
  return null;
}

export async function importBranchSalesReport(rows: BranchSalesRow[], date: string): Promise<BranchSalesImportResult> {
  const session = await assertPermission("reports", "edit");
  if (!date) return { error: "Pick the date this report covers." };
  if (rows.length === 0) return { error: "No rows found — expecting Foodics' Sales by Branch Report format." };

  const allBranches = await db.select({ id: branches.id, code: branches.code }).from(branches);
  const byCode = new Map(allBranches.map((b) => [b.code, b.id]));

  let imported = 0;
  const unmatched: string[] = [];

  for (const r of rows) {
    const branchCode = matchBranchName(r.branchName);
    const branchId = branchCode ? byCode.get(branchCode) : undefined;
    if (!branchId) {
      unmatched.push(r.branchName);
      continue;
    }

    const externalOrderId = `branch-report-${branchCode}-${date}`;
    await db
      .insert(posOrders)
      .values({ provider: "foodics", externalOrderId, branchId, saleDate: date, grossAmount: r.grossAmount, discountAmount: r.discountAmount, netAmount: r.netAmount, orderCount: r.orderCount, voidAmount: r.voidAmount })
      .onConflictDoUpdate({
        target: [posOrders.provider, posOrders.externalOrderId],
        set: { branchId, saleDate: date, grossAmount: r.grossAmount, discountAmount: r.discountAmount, netAmount: r.netAmount, orderCount: r.orderCount, voidAmount: r.voidAmount },
      });

    await db
      .insert(dailyGuestCounts)
      .values({ date, guestCount: r.guestCount, tipsAmount: r.tipsAmount, notes: `${r.branchName} — ${r.orderCount} orders, void ${r.voidAmount.toFixed(2)} (${r.voidQty})`, enteredBy: session.profile.id })
      .onConflictDoUpdate({
        target: dailyGuestCounts.date,
        set: { guestCount: r.guestCount, tipsAmount: r.tipsAmount, notes: `${r.branchName} — ${r.orderCount} orders, void ${r.voidAmount.toFixed(2)} (${r.voidQty})`, enteredBy: session.profile.id, updatedAt: new Date() },
      });

    imported++;
  }

  if (imported === 0) return { error: `Couldn't match any branch name to your system (got: ${rows.map((r) => r.branchName).join(", ")}).`, unmatched };

  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: "Imported",
    entity: "Branch Sales Report",
    entityLabel: date,
    detail: `${imported} branch(es) imported${unmatched.length ? `, ${unmatched.length} unmatched: ${unmatched.join(", ")}` : ""}`,
  });

  revalidatePath("/dashboard");
  return { imported, unmatched: unmatched.length ? unmatched : undefined };
}

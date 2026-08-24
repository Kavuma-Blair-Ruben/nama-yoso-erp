/**
 * One-time migration: turn cost_centers from a single global flat list
 * (Kitchen/Bar/General/Central Warehouse, shared across every branch) into a
 * branch-scoped list — each branch gets its own independent copy of every
 * sector, so NAMAYOSO's Kitchen and THG's Kitchen become genuinely separate
 * rows (and, once the stock ledger picks up cost_center_id, separate stock
 * ledgers).
 *
 * Also repoints wastage_events.costCenter / stock_counts.costCenter (free
 * text today) to the new branch-scoped row via wastage_events.costCenterId /
 * stock_counts.costCenterId, matched by (name, that record's own branchId).
 * The old text columns are left untouched as a safety net.
 *
 * Usage:
 *   npm run tsx scripts/migrate-cost-centers-branch-scope.ts -- --dry-run
 *   npm run tsx scripts/migrate-cost-centers-branch-scope.ts -- --apply
 *
 * Not part of the running app — run manually, once, from a terminal.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, isNull, and, sql as dsql } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { branches, costCenters, wastageEvents, stockCounts } from "../src/server/db/schema";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
if (!APPLY && !args.includes("--dry-run")) {
  console.error("Pass --dry-run or --apply.");
  process.exit(1);
}

const REPORT_DIR = path.resolve(__dirname, "migration-report");
mkdirSync(REPORT_DIR, { recursive: true });

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

async function main() {
  const client = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1, ssl: "require" });
  const db = drizzle(client, { schema });

  const allBranches = await db.select({ id: branches.id, code: branches.code, name: branches.name }).from(branches);
  const globalCostCenters = await db.select({ id: costCenters.id, name: costCenters.name }).from(costCenters).where(isNull(costCenters.branchId));

  if (allBranches.length === 0) {
    console.error("No branches found — nothing to scope cost centers to.");
    process.exit(1);
  }

  if (globalCostCenters.length === 0) {
    console.log("No un-scoped (branchId IS NULL) cost centers found — already migrated. Nothing to do.");
    await client.end();
    return;
  }

  console.log(`Found ${allBranches.length} branch(es) and ${globalCostCenters.length} global cost center(s) to scope.`);
  console.log("Branches:", allBranches.map((b) => b.code).join(", "));
  console.log("Cost centers:", globalCostCenters.map((c) => c.name).join(", "));

  // Plan: branchId -> name -> new row id (only known after insert in --apply;
  // in --dry-run we just report the plan).
  const plannedInserts = allBranches.flatMap((b) => globalCostCenters.map((c) => ({ branchId: b.id, branchCode: b.code, name: c.name })));

  const wastageRows = await db.select({ id: wastageEvents.id, wastageNo: wastageEvents.wastageNo, branchId: wastageEvents.branchId, costCenter: wastageEvents.costCenter }).from(wastageEvents);
  const stockCountRows = await db
    .select({ id: stockCounts.id, countNo: stockCounts.countNo, branchId: stockCounts.branchId, costCenter: stockCounts.costCenter })
    .from(stockCounts)
    .where(and(dsql`${stockCounts.costCenter} is not null`));

  if (!APPLY) {
    const report = [
      `Would insert ${plannedInserts.length} branch-scoped cost center rows:`,
      ...plannedInserts.map((p) => `  ${p.branchCode} / ${p.name}`),
      "",
      `Would delete ${globalCostCenters.length} global cost center row(s).`,
      "",
      `Would repoint ${wastageRows.length} wastage_events row(s) by (name, branchId) match:`,
      ...wastageRows.map((w) => `  ${w.wastageNo}: "${w.costCenter}" @ branch ${w.branchId}`),
      "",
      `Would repoint ${stockCountRows.length} stock_counts row(s) with a non-null costCenter by (name, branchId) match:`,
      ...stockCountRows.map((s) => `  ${s.countNo}: "${s.costCenter}" @ branch ${s.branchId}`),
    ].join("\n");
    writeFileSync(path.join(REPORT_DIR, "cost-center-branch-scope-dry-run.txt"), report);
    console.log(`\nDry run complete — see ${path.join(REPORT_DIR, "cost-center-branch-scope-dry-run.txt")}`);
    await client.end();
    return;
  }

  const unmatchedWastage: string[] = [];
  const unmatchedStockCounts: string[] = [];

  await db.transaction(async (tx) => {
    // Insert the branch-scoped copies first, keeping an in-memory
    // (branchId, normalized name) -> id map to resolve wastage/stock-count
    // rows against right after.
    const idByBranchAndName = new Map<string, string>();
    for (const p of plannedInserts) {
      const [inserted] = await tx.insert(costCenters).values({ branchId: p.branchId, name: p.name, isActive: true }).returning({ id: costCenters.id });
      idByBranchAndName.set(`${p.branchId}::${normalize(p.name)}`, inserted.id);
    }

    // Now that nothing references the old global rows (nothing ever did —
    // wastage/stock-count only stored the name as free text), delete them.
    await tx.delete(costCenters).where(isNull(costCenters.branchId));

    for (const w of wastageRows) {
      const id = idByBranchAndName.get(`${w.branchId}::${normalize(w.costCenter)}`);
      if (id) {
        await tx.update(wastageEvents).set({ costCenterId: id }).where(eq(wastageEvents.id, w.id));
      } else {
        unmatchedWastage.push(`${w.wastageNo}: "${w.costCenter}" @ branch ${w.branchId}`);
      }
    }

    for (const s of stockCountRows) {
      if (!s.costCenter) continue;
      const id = idByBranchAndName.get(`${s.branchId}::${normalize(s.costCenter)}`);
      if (id) {
        await tx.update(stockCounts).set({ costCenterId: id }).where(eq(stockCounts.id, s.id));
      } else {
        unmatchedStockCounts.push(`${s.countNo}: "${s.costCenter}" @ branch ${s.branchId}`);
      }
    }
  });

  const report = [
    `Inserted ${plannedInserts.length} branch-scoped cost center rows.`,
    `Deleted ${globalCostCenters.length} global cost center row(s).`,
    `Repointed ${wastageRows.length - unmatchedWastage.length}/${wastageRows.length} wastage_events row(s).`,
    unmatchedWastage.length ? `Unmatched wastage_events:\n${unmatchedWastage.map((s) => "  " + s).join("\n")}` : "",
    `Repointed ${stockCountRows.length - unmatchedStockCounts.length}/${stockCountRows.length} stock_counts row(s).`,
    unmatchedStockCounts.length ? `Unmatched stock_counts:\n${unmatchedStockCounts.map((s) => "  " + s).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  writeFileSync(path.join(REPORT_DIR, "cost-center-branch-scope-apply.txt"), report);
  console.log("\n" + report);
  console.log(`\nApply complete — see ${path.join(REPORT_DIR, "cost-center-branch-scope-apply.txt")}`);

  if (unmatchedWastage.length || unmatchedStockCounts.length) {
    console.warn("\nWARNING: some rows could not be auto-matched — their costCenterId is still null. Review the report and fix manually.");
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

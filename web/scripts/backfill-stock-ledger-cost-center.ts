/**
 * One-time backfill: every pre-existing stock_balances/stock_movements row
 * (from before the sector dimension existed) gets assigned to its own
 * branch's "General" cost center. Real Kitchen/Bar-specific balances only
 * start accumulating from here forward, as new GRNs/production/wastage/
 * transfers/stock counts post against a real sector.
 *
 * Usage:
 *   npx tsx scripts/backfill-stock-ledger-cost-center.ts -- --dry-run
 *   npx tsx scripts/backfill-stock-ledger-cost-center.ts -- --apply
 *
 * Not part of the running app — run manually, once, from a terminal.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { isNull, sql as dsql } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { branches, costCenters, stockBalances, stockMovements } from "../src/server/db/schema";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
if (!APPLY && !args.includes("--dry-run")) {
  console.error("Pass --dry-run or --apply.");
  process.exit(1);
}

const REPORT_DIR = path.resolve(__dirname, "migration-report");
mkdirSync(REPORT_DIR, { recursive: true });

async function main() {
  const client = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1, ssl: "require" });
  const db = drizzle(client, { schema });

  const allBranches = await db.select({ id: branches.id, code: branches.code }).from(branches);
  const generalByBranch = new Map<string, string>();
  for (const b of allBranches) {
    const [general] = await db.select({ id: costCenters.id }).from(costCenters).where(dsql`${costCenters.branchId} = ${b.id} and ${costCenters.name} = 'General'`);
    if (!general) throw new Error(`No "General" cost center found for branch ${b.code} — run migrate-cost-centers-branch-scope.ts first.`);
    generalByBranch.set(b.id, general.id);
  }

  const [{ count: unbalancedCount }] = await db.select({ count: dsql<number>`count(*)::int` }).from(stockBalances).where(isNull(stockBalances.costCenterId));
  const [{ count: unmovedCount }] = await db.select({ count: dsql<number>`count(*)::int` }).from(stockMovements).where(isNull(stockMovements.costCenterId));

  if (unbalancedCount === 0 && unmovedCount === 0) {
    console.log("No rows with a null cost_center_id — already backfilled. Nothing to do.");
    await client.end();
    return;
  }

  console.log(`stock_balances rows needing backfill: ${unbalancedCount}`);
  console.log(`stock_movements rows needing backfill: ${unmovedCount}`);
  console.log("Every one of them will be assigned to its own branch's General sector.");

  if (!APPLY) {
    const report = [
      `Would backfill ${unbalancedCount} stock_balances row(s) and ${unmovedCount} stock_movements row(s),`,
      `each assigned to its own branch's General cost center:`,
      ...allBranches.map((b) => `  ${b.code} -> General (${generalByBranch.get(b.id)})`),
    ].join("\n");
    writeFileSync(path.join(REPORT_DIR, "stock-ledger-cost-center-backfill-dry-run.txt"), report);
    console.log(`\nDry run complete — see ${path.join(REPORT_DIR, "stock-ledger-cost-center-backfill-dry-run.txt")}`);
    await client.end();
    return;
  }

  let balancesUpdated = 0;
  let movementsUpdated = 0;
  await db.transaction(async (tx) => {
    for (const b of allBranches) {
      const generalId = generalByBranch.get(b.id)!;
      const balRes = await tx.execute(dsql`update stock_balances set cost_center_id = ${generalId} where branch_id = ${b.id} and cost_center_id is null`);
      const movRes = await tx.execute(dsql`update stock_movements set cost_center_id = ${generalId} where branch_id = ${b.id} and cost_center_id is null`);
      balancesUpdated += balRes.count ?? 0;
      movementsUpdated += movRes.count ?? 0;
    }
  });

  const report = `Backfilled ${balancesUpdated} stock_balances row(s) and ${movementsUpdated} stock_movements row(s) into each branch's General sector.`;
  writeFileSync(path.join(REPORT_DIR, "stock-ledger-cost-center-backfill-apply.txt"), report);
  console.log("\n" + report);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

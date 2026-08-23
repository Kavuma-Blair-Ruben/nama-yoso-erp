"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { posIntegrations, recipeSales, mainRecipes, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { bestTextMatch } from "@/lib/textMatch";
import { testFoodicsConnection, fetchFoodicsSales } from "@/lib/pos/foodics";

const BATCH_SIZE = 500;

export async function savePosIntegration(provider: string, apiToken: string): Promise<{ error?: string }> {
  const session = await assertPermission("reports", "edit");
  const trimmed = apiToken.trim();
  if (!trimmed) return { error: "Enter an API token." };

  await db
    .insert(posIntegrations)
    .values({ id: provider, apiToken: trimmed, updatedAt: new Date() })
    .onConflictDoUpdate({ target: posIntegrations.id, set: { apiToken: trimmed, updatedAt: new Date() } });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Updated", entity: "POS Integration", entityLabel: provider, detail: "API token saved" });
  revalidatePath("/reports");
  return {};
}

export async function testPosConnection(provider: string): Promise<{ error?: string; branchCount?: number }> {
  await assertPermission("reports", "edit");
  const [integration] = await db.select().from(posIntegrations).where(eq(posIntegrations.id, provider));
  if (!integration?.apiToken) return { error: "Save an API token first." };
  if (provider !== "foodics") return { error: `${provider} isn't wired up yet.` };

  const result = await testFoodicsConnection(integration.apiToken);
  if (result.error) return { error: result.error };
  return { branchCount: result.branchCount };
}

export type PosSyncResult = { error?: string; ordersScanned?: number; linesFound?: number; imported?: number; matched?: number };

export async function syncFoodicsSales(fromDate: string, toDate: string): Promise<PosSyncResult> {
  const session = await assertPermission("reports", "edit");
  const [integration] = await db.select().from(posIntegrations).where(eq(posIntegrations.id, "foodics"));
  if (!integration?.apiToken) return { error: "Save a Foodics API token first." };
  if (!fromDate || !toDate) return { error: "Choose a date range to sync." };

  const result = await fetchFoodicsSales(integration.apiToken, fromDate, toDate);
  if (result.error) {
    await db.update(posIntegrations).set({ lastSyncAt: new Date(), lastSyncStatus: `Error: ${result.error}` }).where(eq(posIntegrations.id, "foodics"));
    revalidatePath("/reports");
    return { error: result.error };
  }
  const lines = result.lines ?? [];
  if (lines.length === 0) {
    await db.update(posIntegrations).set({ lastSyncAt: new Date(), lastSyncStatus: `No sales found in range (${result.rawOrderCount ?? 0} order(s) scanned)` }).where(eq(posIntegrations.id, "foodics"));
    revalidatePath("/reports");
    return { ordersScanned: result.rawOrderCount, linesFound: 0, imported: 0, matched: 0 };
  }

  const recipes = await db.select({ id: mainRecipes.id, name: mainRecipes.name }).from(mainRecipes);
  let matched = 0;
  const insertRows = lines.map((l) => {
    const match = bestTextMatch(l.productLabel, recipes, (x) => x.name);
    if (match) matched++;
    return { saleDate: l.saleDate, mainRecipeId: match?.id, itemLabel: l.productLabel, qty: l.qty, revenue: l.revenue, source: "foodics", sourceOrderId: l.sourceOrderId, importedBy: session.profile.id };
  });

  let imported = 0;
  for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
    const inserted = await db.insert(recipeSales).values(insertRows.slice(i, i + BATCH_SIZE)).onConflictDoNothing({ target: [recipeSales.source, recipeSales.sourceOrderId] }).returning({ id: recipeSales.id });
    imported += inserted.length;
  }

  const status = `${imported} line(s) imported (${lines.length - imported} already synced), ${matched} matched to a recipe — ${fromDate} to ${toDate}`;
  await db.update(posIntegrations).set({ lastSyncAt: new Date(), lastSyncStatus: status }).where(eq(posIntegrations.id, "foodics"));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Synced", entity: "POS Integration", entityLabel: "foodics", detail: status });

  revalidatePath("/reports");
  return { ordersScanned: result.rawOrderCount, linesFound: lines.length, imported, matched };
}

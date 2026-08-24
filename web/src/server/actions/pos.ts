"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { posIntegrations, posBranchMappings, posItemMappings, recipeSales, mainRecipes, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { bestTextMatch } from "@/lib/textMatch";
import { testFoodicsConnection, fetchFoodicsSales, fetchFoodicsBranches } from "@/lib/pos/foodics";

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

// Generates (or regenerates) the long random token embedded in the webhook
// URL path — the only auth available, since Foodics documents no
// signature/HMAC scheme for webhook requests. Returns the full URL to copy
// into Foodics' application settings or an email to support@foodics.com.
export async function generateFoodicsWebhookUrl(): Promise<{ error?: string; url?: string }> {
  const session = await assertPermission("reports", "edit");
  const [integration] = await db.select().from(posIntegrations).where(eq(posIntegrations.id, "foodics"));
  if (!integration?.apiToken) return { error: "Save a Foodics API token first." };

  const secret = randomBytes(32).toString("base64url");
  await db.update(posIntegrations).set({ webhookSecret: secret, updatedAt: new Date() }).where(eq(posIntegrations.id, "foodics"));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Regenerated", entity: "POS Integration", entityLabel: "foodics", detail: "Webhook URL regenerated — any previous URL on file with Foodics stops working" });
  revalidatePath("/reports");

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return { url: `${siteUrl}/api/webhooks/foodics/${secret}` };
}

// Pulls real branches from Foodics and pre-seeds pos_branch_mappings rows
// (branchId/costCenterId left null) so an admin can map them before the
// first live order arrives, instead of discovering them one at a time from
// real webhook traffic.
export async function fetchAndSeedFoodicsBranches(): Promise<{ error?: string; count?: number }> {
  await assertPermission("reports", "edit");
  const [integration] = await db.select().from(posIntegrations).where(eq(posIntegrations.id, "foodics"));
  if (!integration?.apiToken) return { error: "Save a Foodics API token first." };

  const result = await fetchFoodicsBranches(integration.apiToken);
  if (result.error) return { error: result.error };
  const found = result.branches ?? [];

  for (const b of found) {
    await db
      .insert(posBranchMappings)
      .values({ provider: "foodics", externalBranchId: b.id, externalBranchName: b.name })
      .onConflictDoUpdate({ target: [posBranchMappings.provider, posBranchMappings.externalBranchId], set: { externalBranchName: b.name } });
  }
  revalidatePath("/reports");
  return { count: found.length };
}

// Pulls recent orders purely to enumerate distinct products sold — not to
// import sales — so items can be mapped to recipes before go-live instead
// of trickling in unmapped from real traffic. Reuses the same
// fetchFoodicsSales() the manual reporting sync already uses.
export async function discoverFoodicsItems(fromDate: string, toDate: string): Promise<{ error?: string; count?: number }> {
  await assertPermission("reports", "edit");
  const [integration] = await db.select().from(posIntegrations).where(eq(posIntegrations.id, "foodics"));
  if (!integration?.apiToken) return { error: "Save a Foodics API token first." };
  if (!fromDate || !toDate) return { error: "Choose a date range to scan." };

  const result = await fetchFoodicsSales(integration.apiToken, fromDate, toDate);
  if (result.error) return { error: result.error };

  const seen = new Map<string, string>(); // productId -> label
  for (const l of result.lines ?? []) {
    if (l.productId) seen.set(l.productId, l.productLabel);
  }

  for (const [productId, label] of seen) {
    await db
      .insert(posItemMappings)
      .values({ provider: "foodics", externalProductId: productId, externalProductName: label })
      .onConflictDoUpdate({ target: [posItemMappings.provider, posItemMappings.externalProductId], set: { externalProductName: label } });
  }
  revalidatePath("/reports");
  return { count: seen.size };
}

export async function setPosBranchMapping(id: string, branchId: string, costCenterId: string): Promise<{ error?: string }> {
  const session = await assertPermission("reports", "edit");
  if (!branchId || !costCenterId) return { error: "Pick a branch and a sector." };

  await db.update(posBranchMappings).set({ branchId, costCenterId }).where(eq(posBranchMappings.id, id));
  const [row] = await db.select({ name: posBranchMappings.externalBranchName }).from(posBranchMappings).where(eq(posBranchMappings.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Mapped", entity: "POS Branch", entityLabel: row?.name ?? id, detail: "Branch/sector mapping set" });
  revalidatePath("/reports");
  return {};
}

export async function setPosItemMapping(id: string, mainRecipeId: string): Promise<{ error?: string }> {
  const session = await assertPermission("reports", "edit");
  if (!mainRecipeId) return { error: "Pick a recipe." };

  await db.update(posItemMappings).set({ mainRecipeId }).where(eq(posItemMappings.id, id));
  const [row] = await db.select({ name: posItemMappings.externalProductName }).from(posItemMappings).where(eq(posItemMappings.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Mapped", entity: "POS Item", entityLabel: row?.name ?? id, detail: "Recipe mapping set" });
  revalidatePath("/reports");
  return {};
}

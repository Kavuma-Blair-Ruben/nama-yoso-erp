import "server-only";
import { db } from "@/server/db";
import { posIntegrations, posBranchMappings, posItemMappings, posWebhookEvents } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";

export async function getPosIntegration(provider: string) {
  const [row] = await db.select().from(posIntegrations).where(eq(posIntegrations.id, provider));
  return row ?? null;
}

export async function listPosBranchMappings(provider: string) {
  return db
    .select({
      id: posBranchMappings.id,
      externalBranchId: posBranchMappings.externalBranchId,
      externalBranchName: posBranchMappings.externalBranchName,
      branchId: posBranchMappings.branchId,
      costCenterId: posBranchMappings.costCenterId,
    })
    .from(posBranchMappings)
    .where(eq(posBranchMappings.provider, provider))
    .orderBy(posBranchMappings.externalBranchName);
}

export async function listPosItemMappings(provider: string) {
  return db
    .select({
      id: posItemMappings.id,
      externalProductId: posItemMappings.externalProductId,
      externalProductName: posItemMappings.externalProductName,
      mainRecipeId: posItemMappings.mainRecipeId,
    })
    .from(posItemMappings)
    .where(eq(posItemMappings.provider, provider))
    .orderBy(posItemMappings.externalProductName);
}

// Recent webhook deliveries — lets an admin see what's actually arrived and
// whether it processed cleanly, without digging into the database directly.
export async function listPosWebhookEvents(provider: string, limit = 30) {
  return db
    .select({
      id: posWebhookEvents.id,
      externalOrderId: posWebhookEvents.externalOrderId,
      eventType: posWebhookEvents.eventType,
      receivedAt: posWebhookEvents.receivedAt,
      processedAt: posWebhookEvents.processedAt,
      processNotes: posWebhookEvents.processNotes,
    })
    .from(posWebhookEvents)
    .where(eq(posWebhookEvents.provider, provider))
    .orderBy(desc(posWebhookEvents.receivedAt))
    .limit(limit);
}

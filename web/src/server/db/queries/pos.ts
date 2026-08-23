import "server-only";
import { db } from "@/server/db";
import { posIntegrations } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function getPosIntegration(provider: string) {
  const [row] = await db.select().from(posIntegrations).where(eq(posIntegrations.id, provider));
  return row ?? null;
}

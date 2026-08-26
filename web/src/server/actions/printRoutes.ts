"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { printRoutes, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { DOCUMENT_TYPES } from "@/server/db/queries/printRoutes";

export async function setPrintRoute(branchId: string, documentType: string, deviceId: string | null): Promise<{ error?: string }> {
  const session = await assertPermission("system", "edit");
  if (!(DOCUMENT_TYPES as readonly string[]).includes(documentType)) return { error: "Invalid document type." };

  if (!deviceId) {
    await db.delete(printRoutes).where(and(eq(printRoutes.branchId, branchId), eq(printRoutes.documentType, documentType)));
  } else {
    await db
      .insert(printRoutes)
      .values({ branchId, documentType, deviceId })
      .onConflictDoUpdate({ target: [printRoutes.branchId, printRoutes.documentType], set: { deviceId, updatedAt: new Date() } });
  }
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Print Route Set", entity: "Print Route", entityLabel: documentType, detail: deviceId ? `Routed to device ${deviceId}` : "Cleared" });

  revalidatePath("/devices");
  revalidatePath("/system-settings");
  return {};
}

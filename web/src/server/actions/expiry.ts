"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { grnLines, productionBatches, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { MAX_EXPIRY_EXTENSIONS } from "@/server/db/queries/expiry";

export type ExpirySource = "grn_line" | "production_batch";

export async function extendExpiry(source: ExpirySource, id: string, newExpiryDate: string): Promise<{ error?: string }> {
  const session = await assertPermission("items", "edit");
  const table = source === "grn_line" ? grnLines : productionBatches;

  const [row] = await db.select({ expiryDate: table.expiryDate, extensionCount: table.expiryExtensionCount }).from(table).where(eq(table.id, id));
  if (!row) return { error: "Record not found." };
  if (row.extensionCount >= MAX_EXPIRY_EXTENSIONS) return { error: `This item has already been extended the maximum of ${MAX_EXPIRY_EXTENSIONS} times.` };
  if (!newExpiryDate) return { error: "Choose a new expiry date." };
  if (row.expiryDate && newExpiryDate <= row.expiryDate) return { error: "The new expiry date must be after the current expiry date." };

  await db.update(table).set({ expiryDate: newExpiryDate, expiryExtensionCount: row.extensionCount + 1 }).where(eq(table.id, id));
  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: "Extended Expiry",
    entity: source === "grn_line" ? "GRN Line" : "Production Batch",
    entityLabel: id,
    detail: `${row.expiryDate ?? "?"} → ${newExpiryDate} (extension ${row.extensionCount + 1}/${MAX_EXPIRY_EXTENSIONS})`,
  });
  revalidatePath("/expiry");
  return {};
}

export async function markExpiryTicketsPrinted(items: { source: ExpirySource; id: string }[]): Promise<{ error?: string }> {
  await assertPermission("items", "edit");
  const now = new Date();
  for (const item of items) {
    const table = item.source === "grn_line" ? grnLines : productionBatches;
    await db.update(table).set({ expiryTicketPrintedAt: now }).where(eq(table.id, item.id));
  }
  revalidatePath("/expiry");
  return {};
}

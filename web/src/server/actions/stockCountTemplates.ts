"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { stockCountTemplates, stockCountTemplateItems, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";

export async function createStockCountTemplate(name: string, costCenter: string | null, stockItemIds: string[]): Promise<{ error?: string }> {
  const session = await assertPermission("stockcount", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a template name." };
  if (stockItemIds.length === 0) return { error: "Add items to the count first." };

  const [template] = await db.insert(stockCountTemplates).values({ name: trimmed, costCenter, createdBy: session.profile.id }).returning({ id: stockCountTemplates.id });
  await db.insert(stockCountTemplateItems).values(stockItemIds.map((stockItemId) => ({ templateId: template.id, stockItemId })));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Stock Count Template", entityLabel: trimmed, detail: `${stockItemIds.length} item(s)` });

  revalidatePath("/stock-count/new");
  return {};
}

export async function deleteStockCountTemplate(id: string): Promise<{ error?: string }> {
  const session = await assertPermission("stockcount", "edit");
  const [template] = await db.select({ name: stockCountTemplates.name }).from(stockCountTemplates).where(eq(stockCountTemplates.id, id));
  await db.delete(stockCountTemplates).where(eq(stockCountTemplates.id, id));
  if (template) await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Stock Count Template", entityLabel: template.name, detail: "Removed" });
  revalidatePath("/stock-count/new");
  return {};
}

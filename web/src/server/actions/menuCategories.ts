"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { menuCategories, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";

export async function createMenuCategory(name: string): Promise<{ error?: string }> {
  const session = await assertPermission("recipes", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a category name." };
  const [{ maxOrder }] = await db.select({ maxOrder: sql<number>`coalesce(max(sort_order), 0)` }).from(menuCategories);
  await db.insert(menuCategories).values({ name: trimmed, sortOrder: maxOrder + 1 }).onConflictDoNothing();
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Menu Category", entityLabel: trimmed, detail: "Added" });
  revalidatePath("/menu/categories");
  revalidatePath("/recipes");
  return {};
}

export async function renameMenuCategory(id: string, name: string): Promise<{ error?: string }> {
  const session = await assertPermission("recipes", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a category name." };
  await db.update(menuCategories).set({ name: trimmed }).where(eq(menuCategories.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Renamed", entity: "Menu Category", entityLabel: trimmed, detail: "Renamed" });
  revalidatePath("/menu/categories");
  revalidatePath("/recipes");
  return {};
}

export async function deleteMenuCategory(id: string): Promise<{ error?: string }> {
  const session = await assertPermission("recipes", "edit");
  const [cat] = await db.select({ name: menuCategories.name }).from(menuCategories).where(eq(menuCategories.id, id));
  await db.delete(menuCategories).where(eq(menuCategories.id, id));
  if (cat) await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Menu Category", entityLabel: cat.name, detail: "Removed" });
  revalidatePath("/menu/categories");
  revalidatePath("/recipes");
  return {};
}

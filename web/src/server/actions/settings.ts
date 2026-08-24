"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { categories, subcategories, storageAreas, wastageReasons, unitsOfMeasure, taxRates, systemSettings, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";

export async function createCategory(name: string) {
  const session = await assertPermission("branchsettings", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a category name." };
  const [{ maxOrder }] = await db.select({ maxOrder: sql<number>`coalesce(max(sort_order), 0)` }).from(categories);
  await db.insert(categories).values({ name: trimmed, sortOrder: maxOrder + 1 });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Category", entityLabel: trimmed, detail: "Added" });
  revalidatePath("/settings");
  revalidatePath("/products");
}

export async function renameCategory(id: string, name: string) {
  const session = await assertPermission("branchsettings", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a category name." };
  await db.update(categories).set({ name: trimmed }).where(eq(categories.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Renamed", entity: "Category", entityLabel: trimmed, detail: "Renamed" });
  revalidatePath("/settings");
  revalidatePath("/products");
}

export async function deleteCategory(id: string) {
  const session = await assertPermission("branchsettings", "edit");
  const [cat] = await db.select({ name: categories.name }).from(categories).where(eq(categories.id, id));
  await db.delete(subcategories).where(eq(subcategories.categoryId, id));
  await db.delete(categories).where(eq(categories.id, id));
  if (cat) await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Category", entityLabel: cat.name, detail: "Removed" });
  revalidatePath("/settings");
  revalidatePath("/products");
}

export async function createSubcategory(categoryId: string, name: string) {
  const session = await assertPermission("branchsettings", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a subcategory name." };
  await db.insert(subcategories).values({ categoryId, name: trimmed });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Subcategory", entityLabel: trimmed, detail: "Added" });
  revalidatePath("/settings");
  revalidatePath("/products");
}

export async function renameSubcategory(id: string, name: string) {
  const session = await assertPermission("branchsettings", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a subcategory name." };
  await db.update(subcategories).set({ name: trimmed }).where(eq(subcategories.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Renamed", entity: "Subcategory", entityLabel: trimmed, detail: "Renamed" });
  revalidatePath("/settings");
  revalidatePath("/products");
}

export async function deleteSubcategory(id: string) {
  const session = await assertPermission("branchsettings", "edit");
  const [sub] = await db.select({ name: subcategories.name }).from(subcategories).where(eq(subcategories.id, id));
  await db.delete(subcategories).where(eq(subcategories.id, id));
  if (sub) await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Subcategory", entityLabel: sub.name, detail: "Removed" });
  revalidatePath("/settings");
  revalidatePath("/products");
}

export async function createStorageArea(name: string) {
  const session = await assertPermission("branchsettings", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a storage area name." };
  await db.insert(storageAreas).values({ name: trimmed });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Storage Area", entityLabel: trimmed, detail: "Added" });
  revalidatePath("/settings");
}

export async function deleteStorageArea(id: string) {
  const session = await assertPermission("branchsettings", "edit");
  const [area] = await db.select({ name: storageAreas.name }).from(storageAreas).where(eq(storageAreas.id, id));
  await db.delete(storageAreas).where(eq(storageAreas.id, id));
  if (area) await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Storage Area", entityLabel: area.name, detail: "Removed" });
  revalidatePath("/settings");
}

export async function createWastageReason(name: string, isExpense: boolean) {
  const session = await assertPermission("branchsettings", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a wastage reason name." };
  await db.insert(wastageReasons).values({ name: trimmed, isExpense });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Wastage Reason", entityLabel: trimmed, detail: "Added" });
  revalidatePath("/settings");
}

export async function toggleWastageReasonExpense(id: string, isExpense: boolean) {
  const session = await assertPermission("branchsettings", "edit");
  const [reason] = await db.select({ name: wastageReasons.name }).from(wastageReasons).where(eq(wastageReasons.id, id));
  await db.update(wastageReasons).set({ isExpense }).where(eq(wastageReasons.id, id));
  if (reason) await db.insert(auditLog).values({ actorId: session.profile.id, action: "Updated", entity: "Wastage Reason", entityLabel: reason.name, detail: isExpense ? "Marked as expense (excluded from COGS)" : "Marked as COGS" });
  revalidatePath("/settings");
}

export async function deleteWastageReason(id: string) {
  const session = await assertPermission("branchsettings", "edit");
  const [reason] = await db.select({ name: wastageReasons.name }).from(wastageReasons).where(eq(wastageReasons.id, id));
  await db.delete(wastageReasons).where(eq(wastageReasons.id, id));
  if (reason) await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Wastage Reason", entityLabel: reason.name, detail: "Removed" });
  revalidatePath("/settings");
}

export type UnitInput = { name: string; type: "weight" | "volume" | "count"; factor: number };

// Matches index.html's DEFAULT_UNITS ids — these five rows were seeded by
// the migration and stay editable (in case a factor was mis-seeded) but not
// deletable, since costing code assumes a base g/ml/pc unit always exists.
const DEFAULT_UNIT_CODES = new Set(["u_g", "u_kg", "u_ml", "u_l", "u_pc"]);

export async function createUnit(input: UnitInput) {
  const session = await assertPermission("branchsettings", "edit");
  const trimmed = input.name.trim();
  if (!trimmed) return { error: "Enter a unit name." };
  if (!(input.factor > 0)) return { error: "Enter how many base units this equals." };
  // Auto-derive a stable code from the name — index.html's DEFAULT_UNITS use
  // a similar u_<slug> id, just for uniqueness, never shown to the user.
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const code = `u_${slug}_${Date.now().toString(36)}`;
  await db.insert(unitsOfMeasure).values({ code, name: trimmed, type: input.type, factor: input.factor });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Unit of Measure", entityLabel: trimmed, detail: `${input.type}, 1 = ${input.factor}` });
  revalidatePath("/units");
}

export async function updateUnit(id: string, input: UnitInput) {
  const session = await assertPermission("branchsettings", "edit");
  const trimmed = input.name.trim();
  if (!trimmed) return { error: "Enter a unit name." };
  if (!(input.factor > 0)) return { error: "Enter how many base units this equals." };
  await db.update(unitsOfMeasure).set({ name: trimmed, type: input.type, factor: input.factor }).where(eq(unitsOfMeasure.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Updated", entity: "Unit of Measure", entityLabel: trimmed, detail: `${input.type}, 1 = ${input.factor}` });
  revalidatePath("/units");
}

export async function deleteUnit(id: string) {
  const session = await assertPermission("branchsettings", "edit");
  const [unit] = await db.select({ name: unitsOfMeasure.name, code: unitsOfMeasure.code }).from(unitsOfMeasure).where(eq(unitsOfMeasure.id, id));
  if (unit && DEFAULT_UNIT_CODES.has(unit.code)) {
    return { error: "Standard units can't be deleted." };
  }
  await db.delete(unitsOfMeasure).where(eq(unitsOfMeasure.id, id));
  if (unit) await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Unit of Measure", entityLabel: unit.name, detail: "Removed" });
  revalidatePath("/units");
}

export async function createTaxRate(name: string, pct: number) {
  const session = await assertPermission("system", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a tax rate name." };
  if (pct < 0) return { error: "Enter a valid percentage." };
  await db.insert(taxRates).values({ name: trimmed, pct });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Tax Rate", entityLabel: trimmed, detail: `${pct}%` });
  revalidatePath("/system-settings");
}

export async function deleteTaxRate(id: string) {
  const session = await assertPermission("system", "edit");
  const [rate] = await db.select({ name: taxRates.name }).from(taxRates).where(eq(taxRates.id, id));
  await db.delete(taxRates).where(eq(taxRates.id, id));
  if (rate) await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Tax Rate", entityLabel: rate.name, detail: "Removed" });
  revalidatePath("/system-settings");
}

export async function setCostingMethod(method: "latest" | "moving_average" | "weighted_average") {
  const session = await assertPermission("system", "edit");
  await db
    .insert(systemSettings)
    .values({ id: "default", costingMethod: method })
    .onConflictDoUpdate({ target: systemSettings.id, set: { costingMethod: method } });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Updated", entity: "System Setting", entityLabel: "Costing Method", detail: method });
  revalidatePath("/system-settings");
}

export async function setBlindCounts(enabled: boolean) {
  const session = await assertPermission("system", "edit");
  await db
    .insert(systemSettings)
    .values({ id: "default", blindCounts: enabled })
    .onConflictDoUpdate({ target: systemSettings.id, set: { blindCounts: enabled } });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Updated", entity: "System Setting", entityLabel: "Blind Stock Counts", detail: enabled ? "Enabled" : "Disabled" });
  revalidatePath("/system-settings");
  revalidatePath("/stock-count");
}

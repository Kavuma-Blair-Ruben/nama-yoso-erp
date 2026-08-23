"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { stockItems, categories, subcategories, suppliers, productSupplierPackaging, priceHistory, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextProductCode } from "@/server/db/sequences";

async function findOrCreateCategory(name: string): Promise<string> {
  const trimmed = name.trim();
  const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.name, trimmed));
  if (existing) return existing.id;
  const [{ maxOrder }] = await db.select({ maxOrder: sql<number>`coalesce(max(sort_order), 0)` }).from(categories);
  const [created] = await db.insert(categories).values({ name: trimmed, sortOrder: maxOrder + 1 }).returning({ id: categories.id });
  return created.id;
}

async function findOrCreateSubcategory(categoryId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  const [existing] = await db.select({ id: subcategories.id }).from(subcategories).where(and(eq(subcategories.categoryId, categoryId), eq(subcategories.name, trimmed)));
  if (existing) return existing.id;
  const [created] = await db.insert(subcategories).values({ categoryId, name: trimmed }).returning({ id: subcategories.id });
  return created.id;
}

async function findOrCreateSupplier(name: string): Promise<string> {
  const trimmed = name.trim();
  const [existing] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.name, trimmed));
  if (existing) return existing.id;
  const [created] = await db.insert(suppliers).values({ name: trimmed }).returning({ id: suppliers.id });
  return created.id;
}

const createProductSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().optional(),
  supplier: z.string().optional(),
  storageType: z.enum(["DRY", "CHILLED", "FROZEN", ""]).optional(),
  purchaseUnit: z.string().optional(),
  issueUnit: z.string().optional(),
  unitWeight: z.coerce.number().optional(),
  rate: z.coerce.number().min(0),
});

export type CreateProductState = { error?: string } | undefined;

export async function createProduct(_prev: CreateProductState, formData: FormData): Promise<CreateProductState> {
  const session = await assertPermission("items", "edit");
  const parsed = createProductSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Fill in all required fields." };
  const f = parsed.data;

  const categoryId = await findOrCreateCategory(f.category);
  const subcategoryId = f.subcategory?.trim() ? await findOrCreateSubcategory(categoryId, f.subcategory) : undefined;
  const supplierId = f.supplier?.trim() ? await findOrCreateSupplier(f.supplier) : undefined;
  const ratePerKgL = f.unitWeight ? (f.rate / f.unitWeight) * 1000 : f.rate;

  const legacyCode = await nextProductCode();
  const [created] = await db
    .insert(stockItems)
    .values({
      legacyCode,
      sourceType: "purchased",
      name: f.name,
      categoryId,
      subcategoryId,
      supplierId,
      storageType: f.storageType || undefined,
      purchaseUnit: f.purchaseUnit,
      issueUnit: f.issueUnit,
      unitWeight: f.unitWeight,
      purchaseRate: f.rate,
      ratePerKgL,
      ratePerGMl: ratePerKgL / 1000,
    })
    .returning({ id: stockItems.id, legacyCode: stockItems.legacyCode });

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Product", entityLabel: f.name, detail: `Code ${created.legacyCode}` });
  revalidatePath("/products");
  redirect(`/products/${created.legacyCode}`);
}

const updateRateSchema = z.object({ code: z.string(), newRate: z.coerce.number().min(0), reason: z.string().optional() });

export type UpdateRateState = { error?: string; success?: boolean } | undefined;

export async function updateProductRate(_prev: UpdateRateState, formData: FormData): Promise<UpdateRateState> {
  const session = await assertPermission("items", "edit");
  const parsed = updateRateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid rate." };
  const { code, newRate, reason } = parsed.data;

  const [item] = await db.select().from(stockItems).where(eq(stockItems.legacyCode, code));
  if (!item) return { error: "Product not found." };

  const oldRate = item.purchaseRate;
  if (oldRate === newRate) return { success: true };

  const scale = oldRate && oldRate !== 0 ? newRate / oldRate : 1;
  const newRatePerKgL = item.ratePerKgL != null ? item.ratePerKgL * scale : null;
  const newRatePerGMl = item.ratePerGMl != null ? item.ratePerGMl * scale : null;

  await db
    .update(stockItems)
    .set({ purchaseRate: newRate, ratePerKgL: newRatePerKgL ?? undefined, ratePerGMl: newRatePerGMl ?? undefined, updatedAt: new Date() })
    .where(eq(stockItems.id, item.id));

  await db.insert(priceHistory).values({
    stockItemId: item.id,
    oldRate,
    newRate,
    reason: reason || undefined,
    changedBy: session.profile.id,
    source: "manual",
  });
  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: "Price Update",
    entity: "Product",
    entityLabel: item.name,
    detail: `${oldRate ?? "—"} → ${newRate}${reason ? " (" + reason + ")" : ""}`,
  });

  revalidatePath(`/products/${code}`);
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { success: true };
}

const addVariantSchema = z.object({
  code: z.string(),
  supplier: z.string().min(1),
  purchaseUnit: z.string().min(1),
  unitWeight: z.coerce.number().optional(),
  rate: z.coerce.number().min(0),
  supplierItemName: z.string().optional(),
  supplierItemCode: z.string().optional(),
});

export type AddVariantState = { error?: string } | undefined;

export async function addPackagingVariant(_prev: AddVariantState, formData: FormData): Promise<AddVariantState> {
  const session = await assertPermission("items", "edit");
  const parsed = addVariantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Fill in supplier, packaging, and rate." };
  const f = parsed.data;

  const [item] = await db.select({ id: stockItems.id, name: stockItems.name }).from(stockItems).where(eq(stockItems.legacyCode, f.code));
  if (!item) return { error: "Product not found." };
  const supplierId = await findOrCreateSupplier(f.supplier);

  await db.insert(productSupplierPackaging).values({
    stockItemId: item.id,
    supplierId,
    purchaseUnit: f.purchaseUnit,
    unitWeight: f.unitWeight,
    rate: f.rate,
    supplierItemName: f.supplierItemName,
    supplierItemCode: f.supplierItemCode,
  });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Added Packaging Option", entity: "Product", entityLabel: item.name, detail: `${f.purchaseUnit} — ${f.supplier}` });

  revalidatePath(`/products/${f.code}`);
}

export async function removePackagingVariant(variantId: string, code: string) {
  await assertPermission("items", "edit");
  await db.delete(productSupplierPackaging).where(eq(productSupplierPackaging.id, variantId));
  revalidatePath(`/products/${code}`);
}

export async function setPriorityVariant(variantId: string, stockItemId: string, code: string) {
  await assertPermission("items", "edit");
  await db.update(productSupplierPackaging).set({ isPriority: false }).where(eq(productSupplierPackaging.stockItemId, stockItemId));
  await db.update(productSupplierPackaging).set({ isPriority: true }).where(eq(productSupplierPackaging.id, variantId));
  revalidatePath(`/products/${code}`);
}

const itemSetupSchema = z.object({
  code: z.string(),
  accountingCategory: z.string().optional(),
  secondaryName: z.string().optional(),
  branchNamayoso: z.string().optional(), // checkbox presence
  branchThg: z.string().optional(),
  minLevel: z.string().optional(),
  parLevel: z.string().optional(),
  preferredCountingUnit: z.string().optional(),
  defaultPrepWastagePct: z.string().optional(),
  itemTaxRate: z.string().optional(),
  nonCogs: z.string().optional(),
});

export type ItemSetupState = { error?: string } | undefined;

export async function updateItemSetup(_prev: ItemSetupState, formData: FormData): Promise<ItemSetupState> {
  const session = await assertPermission("items", "edit");
  const parsed = itemSetupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Could not save item setup." };
  const f = parsed.data;

  const [item] = await db.select({ id: stockItems.id, name: stockItems.name }).from(stockItems).where(eq(stockItems.legacyCode, f.code));
  if (!item) return { error: "Product not found." };

  const branches: string[] = [];
  if (f.branchNamayoso) branches.push("NAMAYOSO");
  if (f.branchThg) branches.push("THG");

  await db
    .update(stockItems)
    .set({
      accountingCategory: f.accountingCategory || undefined,
      secondaryName: f.secondaryName || undefined,
      branches,
      minLevel: f.minLevel ? Number(f.minLevel) : undefined,
      parLevel: f.parLevel ? Number(f.parLevel) : undefined,
      preferredCountingUnit: f.preferredCountingUnit || undefined,
      defaultPrepWastagePct: f.defaultPrepWastagePct ? Number(f.defaultPrepWastagePct) : undefined,
      itemTaxRate: f.itemTaxRate ? Number(f.itemTaxRate) : undefined,
      nonCogs: f.nonCogs === "on",
      updatedAt: new Date(),
    })
    .where(eq(stockItems.id, item.id));

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Item Setup Updated", entity: "Product", entityLabel: item.name, detail: `Accounting: ${f.accountingCategory || "-"}` });
  revalidatePath(`/products/${f.code}`);
}

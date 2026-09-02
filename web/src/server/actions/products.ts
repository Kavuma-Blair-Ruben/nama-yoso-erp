"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, sql, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { stockItems, categories, subcategories, suppliers, productSupplierPackaging, priceHistory, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextProductCode } from "@/server/db/sequences";
import { computeRatePerKgL } from "@/lib/unitMath";
import { sendToRoutedPrinter } from "@/lib/printRouting";
import { buildProductLabelEscPos } from "@/lib/escpos";

export async function findOrCreateCategory(name: string): Promise<string> {
  const trimmed = name.trim();
  const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.name, trimmed));
  if (existing) return existing.id;
  const [{ maxOrder }] = await db.select({ maxOrder: sql<number>`coalesce(max(sort_order), 0)` }).from(categories);
  const [created] = await db.insert(categories).values({ name: trimmed, sortOrder: maxOrder + 1 }).returning({ id: categories.id });
  return created.id;
}

export async function findOrCreateSubcategory(categoryId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  const [existing] = await db.select({ id: subcategories.id }).from(subcategories).where(and(eq(subcategories.categoryId, categoryId), eq(subcategories.name, trimmed)));
  if (existing) return existing.id;
  const [created] = await db.insert(subcategories).values({ categoryId, name: trimmed }).returning({ id: subcategories.id });
  return created.id;
}

export async function findOrCreateSupplier(name: string): Promise<string> {
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
  const ratePerKgL = computeRatePerKgL(f.rate, f.unitWeight, f.issueUnit);

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

export type ProductImportRow = {
  code?: string;
  name: string;
  category: string;
  subcategory?: string;
  supplier?: string;
  storageType?: "DRY" | "CHILLED" | "FROZEN";
  purchaseUnit?: string;
  issueUnit?: string;
  unitWeight?: number;
  purchaseRate: number;
  branches?: string[];
  minLevel?: number;
  parLevel?: number;
};

export type BulkImportResult = { error?: string; imported?: number; updated?: number; skipped?: { name: string; reason: string }[] };

// Mirrors createProduct's insert shape exactly, minus the per-row redirect
// (unusable in a batch) — codes are assigned one at a time via
// nextProductCode() sequentially, not Promise.all'd, since it's a
// max(existing)+1 lookup rather than a real DB sequence and concurrent
// calls could collide on the same code.
//
// A row matching an existing product by name (case-insensitive) updates
// that product in place instead of being skipped — this is what lets a
// supplier's refreshed price list be re-imported directly rather than
// requiring a name tweak to get past the duplicate check. A real rate
// change is logged to price_history (source: "bulk") the same way a
// manual rate edit is, so the audit trail doesn't go dark just because
// the update came from a CSV.
export async function bulkImportProducts(rows: ProductImportRow[]): Promise<BulkImportResult> {
  const session = await assertPermission("items", "edit");
  const validRows = rows.filter((r) => r.name.trim() && r.category.trim() && r.purchaseRate >= 0);
  if (validRows.length === 0) return { error: "No valid rows found — Name, Category, and Purchase Rate are required." };

  let imported = 0;
  let updated = 0;

  for (const r of validRows) {
    const code = r.code?.trim() || undefined;
    // A provided code is the authoritative match — it's what the user's
    // own spreadsheet uses to identify the item, more reliable than a name
    // that might have small spelling/formatting differences. Falls back to
    // name-match (old behavior) when no code is given, so existing
    // code-less CSVs keep working unchanged.
    let existing = code ? (await db.select().from(stockItems).where(eq(stockItems.legacyCode, code)))[0] : undefined;
    if (!existing) {
      [existing] = await db.select().from(stockItems).where(ilike(stockItems.name, r.name.trim()));
    }

    const categoryId = await findOrCreateCategory(r.category);
    const subcategoryId = r.subcategory?.trim() ? await findOrCreateSubcategory(categoryId, r.subcategory) : undefined;
    const supplierId = r.supplier?.trim() ? await findOrCreateSupplier(r.supplier) : undefined;
    const ratePerKgL = computeRatePerKgL(r.purchaseRate, r.unitWeight, r.issueUnit);

    if (existing) {
      if (existing.purchaseRate !== r.purchaseRate) {
        await db.insert(priceHistory).values({ stockItemId: existing.id, oldRate: existing.purchaseRate, newRate: r.purchaseRate, changedBy: session.profile.id, source: "bulk" });
      }
      await db
        .update(stockItems)
        .set({
          categoryId,
          subcategoryId,
          supplierId,
          storageType: r.storageType,
          purchaseUnit: r.purchaseUnit,
          issueUnit: r.issueUnit,
          unitWeight: r.unitWeight,
          purchaseRate: r.purchaseRate,
          ratePerKgL,
          ratePerGMl: ratePerKgL / 1000,
          branches: r.branches?.length ? r.branches : undefined,
          minLevel: r.minLevel,
          parLevel: r.parLevel,
          updatedAt: new Date(),
        })
        .where(eq(stockItems.id, existing.id));
      updated++;
      continue;
    }

    const legacyCode = code || (await nextProductCode());
    await db.insert(stockItems).values({
      legacyCode,
      sourceType: "purchased",
      name: r.name.trim(),
      categoryId,
      subcategoryId,
      supplierId,
      storageType: r.storageType,
      purchaseUnit: r.purchaseUnit,
      issueUnit: r.issueUnit,
      unitWeight: r.unitWeight,
      purchaseRate: r.purchaseRate,
      ratePerKgL,
      ratePerGMl: ratePerKgL / 1000,
      branches: r.branches?.length ? r.branches : undefined,
      minLevel: r.minLevel,
      parLevel: r.parLevel,
    });
    imported++;
  }

  if (imported > 0 || updated > 0) {
    const detailParts = [imported > 0 ? `${imported} created` : null, updated > 0 ? `${updated} updated` : null].filter(Boolean);
    await db.insert(auditLog).values({ actorId: session.profile.id, action: "Bulk Imported", entity: "Product", entityLabel: `${imported + updated} product(s)`, detail: detailParts.join(", ") });
    revalidatePath("/products");
  }

  return { imported, updated };
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
  isPackaging: z.string().optional(),
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
  if (f.branchNamayoso) branches.push("NAMAYOSO MIRDIFF");
  if (f.branchThg) branches.push("NAMAYOSO MARSA");

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
      isPackaging: f.isPackaging === "on",
      updatedAt: new Date(),
    })
    .where(eq(stockItems.id, item.id));

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Item Setup Updated", entity: "Product", entityLabel: item.name, detail: `Accounting: ${f.accountingCategory || "-"}` });
  revalidatePath(`/products/${f.code}`);
}

// Manual, one item at a time — a product isn't scoped to a single branch
// (stock_items.branches can span several or be empty = all), so the branch
// to route through is picked explicitly at print time rather than inferred.
export async function sendProductLabelToRoutedPrinter(branchId: string, stockItemId: string, copies: number): Promise<{ error?: string; ok?: boolean; message?: string }> {
  await assertPermission("items", "view");
  const [item] = await db.select({ name: stockItems.name, legacyCode: stockItems.legacyCode, purchaseRate: stockItems.purchaseRate, purchaseUnit: stockItems.purchaseUnit }).from(stockItems).where(eq(stockItems.id, stockItemId));
  if (!item) return { error: "Item not found." };

  const n = Math.max(1, Math.min(50, Math.round(copies) || 1));
  const ticket = buildProductLabelEscPos({ itemName: item.name, itemCode: item.legacyCode, rate: item.purchaseRate, rateUnit: item.purchaseUnit });

  let sent = 0;
  let lastError: string | null = null;
  for (let i = 0; i < n; i++) {
    const result = await sendToRoutedPrinter(branchId, "product_label", ticket);
    if (result.ok) sent++;
    else lastError = result.status;
  }

  if (sent === 0) return { error: lastError ?? "No labels were sent." };
  return { ok: true, message: `Sent ${sent} of ${n} label(s).${sent < n ? ` Last error: ${lastError}` : ""}` };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { suppliers, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";

const blankToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);
const optionalPositiveNumber = z.preprocess(blankToUndefined, z.coerce.number().positive().optional());
const optionalFrequency = z.preprocess(blankToUndefined, z.enum(["daily", "weekly", "monthly"]).optional());

const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  trn: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  paymentTerms: z.string().optional(),
  leadTimeDays: z.coerce.number().optional(),
  notes: z.string().optional(),
  orderLimitAmount: optionalPositiveNumber,
  orderLimitFrequency: optionalFrequency,
  receivingLimitAmount: optionalPositiveNumber,
  receivingLimitFrequency: optionalFrequency,
});

export type SupplierFormState = { error?: string } | undefined;

export async function saveSupplier(_prev: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  const session = await assertPermission("suppliers", "edit");
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a supplier name." };
  const f = parsed.data;

  if (f.id) {
    await db
      .update(suppliers)
      .set({
        name: f.name,
        trn: f.trn,
        contactName: f.contactName,
        phone: f.phone,
        email: f.email,
        paymentTerms: f.paymentTerms,
        leadTimeDays: f.leadTimeDays,
        notes: f.notes,
        orderLimitAmount: f.orderLimitAmount ?? null,
        orderLimitFrequency: f.orderLimitFrequency ?? null,
        receivingLimitAmount: f.receivingLimitAmount ?? null,
        receivingLimitFrequency: f.receivingLimitFrequency ?? null,
        updatedAt: new Date(),
      })
      .where(eq(suppliers.id, f.id));
    await db.insert(auditLog).values({ actorId: session.profile.id, action: "Updated", entity: "Supplier", entityLabel: f.name, detail: "Details changed" });
    revalidatePath(`/suppliers/${f.id}`);
    revalidatePath("/suppliers");
    return;
  }

  const [created] = await db
    .insert(suppliers)
    .values({
      name: f.name,
      trn: f.trn,
      contactName: f.contactName,
      phone: f.phone,
      email: f.email,
      paymentTerms: f.paymentTerms,
      leadTimeDays: f.leadTimeDays,
      notes: f.notes,
      orderLimitAmount: f.orderLimitAmount,
      orderLimitFrequency: f.orderLimitFrequency,
      receivingLimitAmount: f.receivingLimitAmount,
      receivingLimitFrequency: f.receivingLimitFrequency,
    })
    .returning({ id: suppliers.id });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Supplier", entityLabel: f.name, detail: "Added" });
  revalidatePath("/suppliers");
  redirect(`/suppliers/${created.id}`);
}

export type SupplierImportRow = {
  name: string;
  trn?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  paymentTerms?: string;
  leadTimeDays?: number;
  notes?: string;
  orderLimitAmount?: number;
  orderLimitFrequency?: "daily" | "weekly" | "monthly";
  receivingLimitAmount?: number;
  receivingLimitFrequency?: "daily" | "weekly" | "monthly";
};

export type SupplierBulkImportResult = { error?: string; imported?: number; skipped?: string[] };

// Flattest of the bulk importers — no FK lookups. suppliers.name carries a
// real unique constraint, so the duplicate-name skip also doubles as
// avoiding an insert error.
export async function bulkImportSuppliers(rows: SupplierImportRow[]): Promise<SupplierBulkImportResult> {
  const session = await assertPermission("suppliers", "edit");
  const validRows = rows.filter((r) => r.name.trim());
  if (validRows.length === 0) return { error: "No valid rows found — Name is required." };

  const skipped: string[] = [];
  const toInsert: (typeof suppliers.$inferInsert)[] = [];
  for (const r of validRows) {
    const [existing] = await db.select({ id: suppliers.id }).from(suppliers).where(ilike(suppliers.name, r.name.trim()));
    if (existing) {
      skipped.push(r.name);
      continue;
    }
    toInsert.push({
      name: r.name.trim(),
      trn: r.trn,
      contactName: r.contactName,
      phone: r.phone,
      email: r.email,
      paymentTerms: r.paymentTerms,
      leadTimeDays: r.leadTimeDays,
      notes: r.notes,
      orderLimitAmount: r.orderLimitAmount,
      orderLimitFrequency: r.orderLimitFrequency,
      receivingLimitAmount: r.receivingLimitAmount,
      receivingLimitFrequency: r.receivingLimitFrequency,
    });
  }

  if (toInsert.length > 0) {
    await db.insert(suppliers).values(toInsert);
    await db.insert(auditLog).values({ actorId: session.profile.id, action: "Bulk Imported", entity: "Supplier", entityLabel: `${toInsert.length} supplier(s)`, detail: skipped.length ? `${skipped.length} skipped (duplicate name)` : undefined });
    revalidatePath("/suppliers");
  }

  return { imported: toInsert.length, skipped };
}

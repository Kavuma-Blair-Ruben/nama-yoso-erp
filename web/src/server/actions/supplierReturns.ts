"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { grns, grnLines, supplierReturns, supplierReturnLines, stockItems, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextSupplierReturnNumber } from "@/server/db/sequences";
import { recordStockMovement } from "@/server/db/stockLedger";
import { convertQtyToCanonical } from "@/lib/unitMath";

export type SupplierReturnResult = { error?: string; id?: string };

const lineSchema = z.object({ grnLineId: z.string().min(1), qty: z.number().positive() });
const inputSchema = z.object({ grnId: z.string().min(1), reason: z.string().optional(), lines: z.array(lineSchema).min(1) });

export async function createSupplierReturn(input: z.infer<typeof inputSchema>): Promise<SupplierReturnResult> {
  const session = await assertPermission("grn", "edit");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "Select at least one line with a quantity to return." };

  const [grn] = await db.select().from(grns).where(eq(grns.id, parsed.data.grnId));
  if (!grn) return { error: "GRN not found." };
  if (grn.status !== "POSTED") return { error: "Only a posted GRN has stock on hand to return." };

  const grnLineRows = await db.select().from(grnLines).where(eq(grnLines.grnId, parsed.data.grnId));
  const alreadyReturned = await db
    .select({ grnLineId: supplierReturnLines.grnLineId, qty: supplierReturnLines.qty })
    .from(supplierReturnLines)
    .innerJoin(supplierReturns, eq(supplierReturnLines.supplierReturnId, supplierReturns.id))
    .where(eq(supplierReturns.grnId, parsed.data.grnId));
  const returnedByLine = new Map<string, number>();
  for (const r of alreadyReturned) returnedByLine.set(r.grnLineId, (returnedByLine.get(r.grnLineId) ?? 0) + r.qty);

  // Re-clamp server-side (the client only disables/caps the input) so a
  // line that's already fully returned — or a race with a concurrent
  // return — can't push stock negative.
  const selected: { line: (typeof grnLineRows)[number]; qty: number }[] = [];
  for (const l of parsed.data.lines) {
    const grnLine = grnLineRows.find((g) => g.id === l.grnLineId);
    if (!grnLine) continue;
    const remaining = grnLine.receivedQty - (returnedByLine.get(grnLine.id) ?? 0);
    const qty = Math.min(l.qty, remaining);
    if (qty <= 0) continue;
    selected.push({ line: grnLine, qty });
  }
  if (selected.length === 0) return { error: "Select at least one line with a returnable quantity." };

  const value = selected.reduce((s, x) => s + x.qty * x.line.rate, 0);
  const number = await nextSupplierReturnNumber();

  const id = await db.transaction(async (tx) => {
    const [ret] = await tx
      .insert(supplierReturns)
      .values({ number, grnId: grn.id, supplierId: grn.supplierId, reason: parsed.data.reason || undefined, value, createdBy: session.profile.id })
      .returning({ id: supplierReturns.id });

    for (const { line, qty } of selected) {
      const [item] = await tx.select().from(stockItems).where(eq(stockItems.id, line.stockItemId));
      if (!item) continue;
      const amount = qty * line.rate;
      await tx.insert(supplierReturnLines).values({
        supplierReturnId: ret.id,
        grnLineId: line.id,
        stockItemId: line.stockItemId,
        qty,
        unitLabel: line.unitLabel,
        rate: line.rate,
        amount,
      });

      // Same purchase-unit -> canonical conversion GRN receiving uses, just
      // negated — a return removes stock instead of adding it.
      const qtyInIssueUnit = qty * (item.unitWeight ?? 1);
      const canonicalQty = convertQtyToCanonical(qtyInIssueUnit, item.issueUnit);
      await recordStockMovement(tx, {
        stockItemId: item.id,
        branchId: grn.branchId,
        qtyDelta: -canonicalQty,
        unitLabel: item.issueUnit,
        movementType: "SUPPLIER_RETURN",
        refType: "supplier_return",
        refId: ret.id,
        actorId: session.profile.id,
      });
    }

    await tx.insert(auditLog).values({
      actorId: session.profile.id,
      action: "Created",
      entity: "Supplier Return",
      entityLabel: number,
      detail: `Against ${grn.grnNumber} — ${selected.length} line(s), AED ${value.toFixed(2)}`,
    });
    return ret.id;
  });

  revalidatePath(`/grn/${grn.id}`);
  revalidatePath("/grn");
  revalidatePath("/supplier-returns");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { id };
}

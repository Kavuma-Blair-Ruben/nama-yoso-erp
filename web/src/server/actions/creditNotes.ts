"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { grns, grnLines, creditNotes, consolidatedInvoices, consolidatedInvoiceGrns, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextCreditNoteNumber, nextConsolidatedInvoiceNumber } from "@/server/db/sequences";

export type CreditNoteResult = { error?: string; id?: string };

export async function requestCreditNote(grnId: string, reason: string): Promise<CreditNoteResult> {
  const session = await assertPermission("grn", "edit");
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "Enter a reason for the credit/return request." };

  const [grn] = await db.select({ grnNumber: grns.grnNumber, supplierId: grns.supplierId, status: grns.status }).from(grns).where(eq(grns.id, grnId));
  if (!grn) return { error: "GRN not found." };
  if (grn.status !== "POSTED") return { error: "Only a posted GRN can have a credit/return requested against it." };

  const lines = await db.select({ lineAmount: grnLines.lineAmount, taxRate: grnLines.taxRate }).from(grnLines).where(eq(grnLines.grnId, grnId));
  const amount = lines.reduce((s, l) => s + l.lineAmount * (1 + l.taxRate / 100), 0);

  const creditNoteNumber = await nextCreditNoteNumber();
  const [created] = await db
    .insert(creditNotes)
    .values({ creditNoteNumber, grnId, supplierId: grn.supplierId, amount, reason: trimmedReason, createdBy: session.profile.id })
    .returning({ id: creditNotes.id });

  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: "Credit Requested",
    entity: "GRN",
    entityLabel: grn.grnNumber,
    detail: `${creditNoteNumber} — ${trimmedReason}`,
  });

  revalidatePath(`/grn/${grnId}`);
  revalidatePath("/credit-notes");
  return { id: created.id };
}

const statusSchema = z.enum(["REQUESTED", "ISSUED", "REJECTED"]);

export async function updateCreditNoteStatus(id: string, status: z.infer<typeof statusSchema>): Promise<CreditNoteResult> {
  const session = await assertPermission("grn", "edit");
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid status." };

  const [note] = await db.select({ creditNoteNumber: creditNotes.creditNoteNumber, grnId: creditNotes.grnId }).from(creditNotes).where(eq(creditNotes.id, id));
  if (!note) return { error: "Credit note not found." };

  await db.update(creditNotes).set({ status: parsed.data }).where(eq(creditNotes.id, id));
  await db.insert(auditLog).values({
    actorId: session.profile.id,
    action: "Updated",
    entity: "Credit Note",
    entityLabel: note.creditNoteNumber,
    detail: `Status → ${parsed.data}`,
  });

  revalidatePath(`/grn/${note.grnId}`);
  revalidatePath("/credit-notes");
  return { id };
}

const consolidateSchema = z.object({
  supplierId: z.string().min(1),
  invoiceDate: z.string().min(1),
  grnIds: z.array(z.string()).min(1),
});

export async function createConsolidatedInvoice(input: z.infer<typeof consolidateSchema>): Promise<CreditNoteResult> {
  const session = await assertPermission("grn", "edit");
  const parsed = consolidateSchema.safeParse(input);
  if (!parsed.success) return { error: "Select a supplier and at least one GRN." };

  const eligibleGrns = await db
    .select({ id: grns.id, supplierId: grns.supplierId, status: grns.status })
    .from(grns)
    .where(inArray(grns.id, parsed.data.grnIds));
  if (eligibleGrns.length !== parsed.data.grnIds.length) return { error: "One or more selected GRNs no longer exist." };
  if (eligibleGrns.some((g) => g.status !== "POSTED" || g.supplierId !== parsed.data.supplierId)) {
    return { error: "Every GRN must be posted and from the selected supplier." };
  }

  const number = await nextConsolidatedInvoiceNumber();

  const id = await db.transaction(async (tx) => {
    // Re-check inside the transaction that none of these GRNs got consolidated
    // by a concurrent request between the page load and this submit.
    const already = await tx.select({ grnId: consolidatedInvoiceGrns.grnId }).from(consolidatedInvoiceGrns).where(inArray(consolidatedInvoiceGrns.grnId, parsed.data.grnIds));
    if (already.length > 0) throw new Error("ALREADY_CONSOLIDATED");

    const lines = await tx
      .select({ grnId: grnLines.grnId, lineAmount: grnLines.lineAmount, taxRate: grnLines.taxRate, isFoc: grnLines.isFoc })
      .from(grnLines)
      .where(inArray(grnLines.grnId, parsed.data.grnIds));
    const total = lines.reduce((s, l) => s + (l.isFoc ? 0 : l.lineAmount * (1 + l.taxRate / 100)), 0);

    const [ci] = await tx
      .insert(consolidatedInvoices)
      .values({ number, supplierId: parsed.data.supplierId, invoiceDate: parsed.data.invoiceDate, total, createdBy: session.profile.id })
      .returning({ id: consolidatedInvoices.id });

    await tx.insert(consolidatedInvoiceGrns).values(parsed.data.grnIds.map((grnId) => ({ consolidatedInvoiceId: ci.id, grnId })));

    await tx.insert(auditLog).values({
      actorId: session.profile.id,
      action: "Created",
      entity: "Consolidated Invoice",
      entityLabel: number,
      detail: `${parsed.data.grnIds.length} GRN(s), AED ${total.toFixed(2)}`,
    });
    return ci.id;
  }).catch((e) => {
    if (e instanceof Error && e.message === "ALREADY_CONSOLIDATED") return null;
    throw e;
  });

  if (!id) return { error: "One of the selected GRNs was just consolidated elsewhere — refresh and try again." };

  revalidatePath("/consolidated-invoices");
  revalidatePath("/grn");
  return { id };
}

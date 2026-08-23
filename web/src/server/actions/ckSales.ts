"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { customers, priceLists, deliveryNotes, deliveryNoteLines, customerReturns, customerReturnLines, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextDnNumber, nextProNumber, nextReturnNumber } from "@/server/db/sequences";
import { recordStockMovement } from "@/server/db/stockLedger";
import { buildDnPdfBuffer } from "@/server/pdf/deliveryNotePdf";
import { sendEmailWithAttachment } from "@/lib/email";
import { sendWhatsAppDocument, isWhatsAppBusinessConfigured } from "@/lib/whatsappBusiness";
import { uploadPdfBuffer } from "@/lib/supabaseAdmin";

export type CkActionResult = { error?: string; id?: string };

export async function createPriceList(name: string, mode: "cost" | "margin", marginPct: number | null) {
  const session = await assertPermission("ckwarehouse", "edit");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a price list name." };
  if (mode === "margin" && (marginPct == null || marginPct < 0)) return { error: "Enter a valid margin %." };
  await db.insert(priceLists).values({ name: trimmed, mode, marginPct: mode === "margin" ? marginPct : null });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Price List", entityLabel: trimmed, detail: mode === "margin" ? `Margin ${marginPct}%` : "Cost price" });
  revalidatePath("/customers");
}

export async function createCustomer(input: { name: string; group: string; priceListId: string | null; email?: string; phone?: string }) {
  const session = await assertPermission("ckwarehouse", "edit");
  const trimmed = input.name.trim();
  if (!trimmed) return { error: "Enter a customer name." };
  await db.insert(customers).values({ name: trimmed, group: input.group || "General", priceListId: input.priceListId || null, email: input.email, phone: input.phone });
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Customer", entityLabel: trimmed, detail: input.group });
  revalidatePath("/customers");
}

const lineSchema = z.object({ stockItemId: z.string().min(1), qty: z.number().min(0), unitLabel: z.string().optional(), price: z.number().min(0) });

const dnInputSchema = z.object({
  customerId: z.string().min(1),
  docType: z.enum(["DN", "PRO"]),
  branchId: z.string().min(1),
  deliveryDate: z.string().min(1),
  lines: z.array(lineSchema).min(1),
});

// No DRAFT state here on purpose — matches index.html's "Create & Deduct
// Stock" being the only save action for a delivery note/invoice.
export async function createDeliveryNote(input: z.infer<typeof dnInputSchema>): Promise<CkActionResult> {
  const session = await assertPermission("ckwarehouse", "edit");
  const parsed = dnInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one item with a quantity." };

  const number = parsed.data.docType === "PRO" ? await nextProNumber() : await nextDnNumber();
  const total = parsed.data.lines.reduce((s, l) => s + l.qty * l.price, 0);

  const id = await db.transaction(async (tx) => {
    const [dn] = await tx
      .insert(deliveryNotes)
      .values({ number, docType: parsed.data.docType, customerId: parsed.data.customerId, branchId: parsed.data.branchId, deliveryDate: parsed.data.deliveryDate, total, createdBy: session.profile.id })
      .returning({ id: deliveryNotes.id });

    for (const l of parsed.data.lines) {
      if (l.qty <= 0) continue;
      await tx.insert(deliveryNoteLines).values({ deliveryNoteId: dn.id, stockItemId: l.stockItemId, qty: l.qty, unitLabel: l.unitLabel, price: l.price, amount: l.qty * l.price });
      await recordStockMovement(tx, {
        stockItemId: l.stockItemId,
        branchId: parsed.data.branchId,
        qtyDelta: -l.qty,
        unitLabel: l.unitLabel,
        movementType: "CK_SALE",
        refType: "delivery_note",
        refId: dn.id,
        actorId: session.profile.id,
      });
    }

    const [customer] = await tx.select({ name: customers.name }).from(customers).where(eq(customers.id, parsed.data.customerId));
    await tx.insert(auditLog).values({
      actorId: session.profile.id,
      action: "Created",
      entity: "Delivery Note",
      entityLabel: number,
      detail: `${customer?.name ?? ""} — ${parsed.data.lines.length} item(s), ${money(total)}`,
    });
    return dn.id;
  });

  revalidatePath("/ck-sales");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { id };
}

function money(n: number) {
  return "AED " + n.toFixed(2);
}

const returnInputSchema = z.object({
  deliveryNoteId: z.string().min(1),
  reason: z.string().optional(),
  lineIds: z.array(z.string()).min(1),
});

export async function createCustomerReturn(input: z.infer<typeof returnInputSchema>): Promise<CkActionResult> {
  const session = await assertPermission("ckwarehouse", "edit");
  const parsed = returnInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Select at least one line to return." };

  const [dn] = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, parsed.data.deliveryNoteId));
  if (!dn) return { error: "Delivery note not found." };

  const lines = await db
    .select()
    .from(deliveryNoteLines)
    .where(and(eq(deliveryNoteLines.deliveryNoteId, parsed.data.deliveryNoteId)));
  const alreadyReturned = await db
    .select({ deliveryNoteLineId: customerReturnLines.deliveryNoteLineId, qty: customerReturnLines.qty })
    .from(customerReturnLines)
    .innerJoin(customerReturns, eq(customerReturnLines.customerReturnId, customerReturns.id))
    .where(eq(customerReturns.deliveryNoteId, parsed.data.deliveryNoteId));
  const returnedByLine = new Map<string, number>();
  for (const r of alreadyReturned) returnedByLine.set(r.deliveryNoteLineId, (returnedByLine.get(r.deliveryNoteLineId) ?? 0) + r.qty);

  // Re-check server-side (the client only disables the checkbox) so a
  // line already fully returned can't be double-processed.
  const selected = lines.filter((l) => parsed.data.lineIds.includes(l.id) && (returnedByLine.get(l.id) ?? 0) < l.qty);
  if (selected.length === 0) return { error: "Select at least one line that hasn't already been fully returned." };

  const number = await nextReturnNumber();
  const value = selected.reduce((s, l) => s + l.amount, 0);

  const id = await db.transaction(async (tx) => {
    const [ret] = await tx
      .insert(customerReturns)
      .values({ number, deliveryNoteId: dn.id, reason: parsed.data.reason, value, createdBy: session.profile.id })
      .returning({ id: customerReturns.id });

    for (const l of selected) {
      await tx.insert(customerReturnLines).values({ customerReturnId: ret.id, deliveryNoteLineId: l.id, stockItemId: l.stockItemId, qty: l.qty, unitLabel: l.unitLabel, price: l.price, amount: l.amount });
      await recordStockMovement(tx, {
        stockItemId: l.stockItemId,
        branchId: dn.branchId,
        qtyDelta: l.qty,
        unitLabel: l.unitLabel,
        movementType: "CUSTOMER_RETURN",
        refType: "customer_return",
        refId: ret.id,
        actorId: session.profile.id,
      });
    }

    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Created", entity: "Customer Return", entityLabel: number, detail: `Against ${dn.number} — ${selected.length} line(s)` });
    return ret.id;
  });

  revalidatePath("/ck-sales");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { id };
}

export async function sendDeliveryNoteEmail(id: string): Promise<{ error?: string; ok?: boolean }> {
  const session = await assertPermission("ckwarehouse", "edit");
  const { dn, buffer } = await buildDnPdfBuffer(id);
  if (!dn.customerEmail) return { error: "This customer has no email address on file." };

  const docLabel = dn.docType === "PRO" ? "Pro Forma Invoice" : "Delivery Note";
  const result = await sendEmailWithAttachment({
    to: dn.customerEmail,
    subject: `${docLabel} ${dn.number}`,
    text: `Please find attached your ${docLabel.toLowerCase()} ${dn.number} from ${dn.branchName}.`,
    attachment: { filename: `${dn.number}.pdf`, content: buffer },
  });
  if (result.error) return { error: result.error };

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Emailed", entity: "Delivery Note", entityLabel: dn.number, detail: `Sent to ${dn.customerEmail}` });
  return { ok: true };
}

export async function sendDeliveryNoteWhatsApp(id: string): Promise<{ error?: string; ok?: boolean }> {
  const session = await assertPermission("ckwarehouse", "edit");
  if (!isWhatsAppBusinessConfigured()) return { error: "WhatsApp Business API isn't configured yet." };
  const { dn, buffer } = await buildDnPdfBuffer(id);
  if (!dn.customerPhone) return { error: "This customer has no phone number on file." };
  const digitsOnly = dn.customerPhone.replace(/[^0-9]/g, "");

  const documentUrl = await uploadPdfBuffer(`delivery-notes/${dn.number}-${Date.now()}.pdf`, buffer);
  const templateName = process.env.WHATSAPP_DN_TEMPLATE_NAME || "delivery_note_document";
  const result = await sendWhatsAppDocument({
    to: digitsOnly,
    documentUrl,
    filename: `${dn.number}.pdf`,
    templateName,
    templateParams: [dn.number, dn.customerName],
  });
  if (result.error) return { error: result.error };

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "WhatsApp Sent", entity: "Delivery Note", entityLabel: dn.number, detail: `Sent to ${dn.customerPhone}` });
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { purchaseOrders, purchaseOrderLines, suppliers, policySettings, roles, rolePurchaseLimits, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextPoNumber } from "@/server/db/sequences";
import { checkSupplierOrderingLimit, checkLocationOrderLimit, checkAbovePeLimit } from "@/server/policyChecks";
import { buildPoPdfBuffer } from "@/server/pdf/purchaseOrderPdf";
import { sendEmailWithAttachment } from "@/lib/email";
import { sendWhatsAppDocument, isWhatsAppBusinessConfigured } from "@/lib/whatsappBusiness";
import { uploadPdfBuffer } from "@/lib/supabaseAdmin";

const lineSchema = z.object({
  stockItemId: z.string().min(1),
  name: z.string(),
  unitLabel: z.string().optional(),
  qty: z.number().positive(),
  rate: z.number().min(0),
  taxRate: z.number().min(0).default(5),
  supplierId: z.string().nullable(),
});

const createSchema = z.object({
  lines: z.array(lineSchema).min(1),
  branchId: z.string().min(1),
  deliverTo: z.string().optional(),
  fallbackSupplierId: z.string().nullable().optional(),
  notes: z.string().optional(),
});

export type CreatePOResult = { error?: string; createdIds?: string[]; warning?: string };

// Unlike every other check in this file, this is a real block — a role with
// a configured maxPoAmount can't create a single PO over that value, same
// hard-stop precedent as policySettings.poApprovalThreshold. Checked per
// resulting PO (after the supplier split), since "a single PO" is the unit
// that matters here, not the combined multi-supplier submission.
async function checkRolePoCap(roleId: string, total: number): Promise<string | null> {
  const [limit] = await db.select({ maxPoAmount: rolePurchaseLimits.maxPoAmount }).from(rolePurchaseLimits).where(eq(rolePurchaseLimits.roleId, roleId));
  if (limit?.maxPoAmount == null || total <= limit.maxPoAmount) return null;
  return `This PO (AED ${total.toFixed(2)}) is over your role's AED ${limit.maxPoAmount} per-PO limit — ask someone with a higher limit to create it.`;
}

export async function createPurchaseOrders(input: z.infer<typeof createSchema>): Promise<CreatePOResult> {
  const session = await assertPermission("orders", "edit");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one valid line item." };
  const { lines, branchId, deliverTo, fallbackSupplierId, notes } = parsed.data;

  if (deliverTo) {
    const [settings] = await db.select().from(policySettings);
    if (settings?.internalOnlyLocations.includes(deliverTo)) {
      return { error: `${deliverTo} is restricted to internal ordering only — use a Material Request to Central Kitchen/Warehouse instead of an external supplier LPO.` };
    }
  }

  const groups = new Map<string, typeof lines>();
  const unresolved: typeof lines = [];
  for (const line of lines) {
    const supplierId = line.supplierId ?? fallbackSupplierId ?? null;
    if (!supplierId) {
      unresolved.push(line);
      continue;
    }
    const arr = groups.get(supplierId) ?? [];
    arr.push(line);
    groups.set(supplierId, arr);
  }
  if (unresolved.length > 0 && groups.size === 0) {
    return { error: "No supplier could be resolved for any item — set a fallback supplier." };
  }

  const lineTaxedTotal = (l: (typeof lines)[number]) => l.qty * l.rate * (1 + l.taxRate / 100);
  for (const groupLines of groups.values()) {
    const groupTotal = groupLines.reduce((s, l) => s + lineTaxedTotal(l), 0);
    const roleCapBreach = await checkRolePoCap(session.role.id, groupTotal);
    if (roleCapBreach) return { error: roleCapBreach };
  }

  // Non-blocking policy warnings — checked live, same as index.html, but
  // never prevent the order from being created.
  const warnings: string[] = [];
  const allLines = [...groups.values()].flat();
  const aboveParBreach = await checkAbovePeLimit(
    db,
    allLines.map((l) => ({ stockItemId: l.stockItemId, name: l.name, qty: l.qty }))
  );
  if (aboveParBreach) warnings.push(aboveParBreach);
  if (deliverTo) {
    const lineTotalAll = allLines.reduce((s, l) => s + lineTaxedTotal(l), 0);
    const locBreach = await checkLocationOrderLimit(db, deliverTo, lineTotalAll);
    if (locBreach) warnings.push(locBreach);
  }
  for (const [supplierId, groupLines] of groups) {
    const lineTotal = groupLines.reduce((s, l) => s + lineTaxedTotal(l), 0);
    const breach = await checkSupplierOrderingLimit(db, supplierId, lineTotal);
    if (breach) warnings.push(breach);
  }

  const createdIds: string[] = [];
  for (const [supplierId, groupLines] of groups) {
    const poNumber = await nextPoNumber();
    const [supplier] = await db.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, supplierId));
    const [po] = await db
      .insert(purchaseOrders)
      .values({ poNumber, supplierId, branchId, deliverTo, notes, createdBy: session.profile.id })
      .returning({ id: purchaseOrders.id });
    await db.insert(purchaseOrderLines).values(
      groupLines.map((l, i) => ({
        purchaseOrderId: po.id,
        lineNo: i,
        stockItemId: l.stockItemId,
        unitLabel: l.unitLabel,
        qty: l.qty,
        rate: l.rate,
        taxRate: l.taxRate,
      }))
    );
    await db.insert(auditLog).values({
      actorId: session.profile.id,
      action: "Created",
      entity: "Purchase Order",
      entityLabel: poNumber,
      detail: `${supplier?.name ?? "Unknown supplier"} — ${groupLines.length} line(s)`,
    });
    createdIds.push(po.id);
  }

  revalidatePath("/purchase-orders");
  return { createdIds, warning: warnings.length ? warnings.join(" ") : undefined };
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["ORDERED", "CANCELLED"],
  ORDERED: ["CANCELLED"],
  "PARTIALLY RECEIVED": [],
  "FULLY RECEIVED": [],
  CANCELLED: [],
};

export async function updatePOStatus(id: string, newStatus: string): Promise<{ error?: string }> {
  const session = await assertPermission("orders", "edit");
  const [po] = await db.select({ status: purchaseOrders.status, poNumber: purchaseOrders.poNumber }).from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (!po) return { error: "Purchase order not found." };
  if (!STATUS_TRANSITIONS[po.status]?.includes(newStatus)) return { error: `Cannot move from ${po.status} to ${newStatus}.` };

  // Real block, not a warning — every other policy check in this app only
  // ever surfaces a non-blocking message. A configured threshold+role
  // actually prevents DRAFT -> APPROVED unless the acting user holds that role.
  if (po.status === "DRAFT" && newStatus === "APPROVED") {
    const [settings] = await db
      .select({ threshold: policySettings.poApprovalThreshold, roleId: policySettings.poApprovalRoleId })
      .from(policySettings);
    if (settings?.threshold != null && settings.roleId) {
      const lines = await db
        .select({ qty: purchaseOrderLines.qty, rate: purchaseOrderLines.rate, taxRate: purchaseOrderLines.taxRate })
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, id));
      const total = lines.reduce((s, l) => s + l.qty * l.rate * (1 + l.taxRate / 100), 0);
      if (total >= settings.threshold && session.role.id !== settings.roleId) {
        const [role] = await db.select({ name: roles.name }).from(roles).where(eq(roles.id, settings.roleId));
        return {
          error: `This PO (AED ${total.toFixed(2)}) is at or above the AED ${settings.threshold} approval threshold — only ${role?.name ?? "an authorized role"} can approve it.`,
        };
      }
    }
  }

  await db.update(purchaseOrders).set({ status: newStatus, updatedAt: new Date() }).where(eq(purchaseOrders.id, id));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Status Change", entity: "Purchase Order", entityLabel: po.poNumber, detail: `${po.status} → ${newStatus}` });

  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/purchase-orders");
  return {};
}

export async function sendPurchaseOrderEmail(id: string): Promise<{ error?: string; ok?: boolean }> {
  const session = await assertPermission("orders", "edit");
  const { po, buffer } = await buildPoPdfBuffer(id);
  if (!po.supplierEmail) return { error: "This supplier has no email address on file." };

  const result = await sendEmailWithAttachment({
    to: po.supplierEmail,
    subject: `Purchase Order ${po.poNumber}`,
    text: `Please find attached our order ${po.poNumber} for ${po.supplier}.`,
    attachment: { filename: `${po.poNumber}.pdf`, content: buffer },
  });
  if (result.error) return { error: result.error };

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Emailed", entity: "Purchase Order", entityLabel: po.poNumber, detail: `Sent to ${po.supplierEmail}` });
  return { ok: true };
}

export async function sendPurchaseOrderWhatsApp(id: string): Promise<{ error?: string; ok?: boolean }> {
  const session = await assertPermission("orders", "edit");
  if (!isWhatsAppBusinessConfigured()) return { error: "WhatsApp Business API isn't configured yet." };
  const { po, buffer } = await buildPoPdfBuffer(id);
  if (!po.supplierPhone) return { error: "This supplier has no phone number on file." };
  const digitsOnly = po.supplierPhone.replace(/[^0-9]/g, "");

  const documentUrl = await uploadPdfBuffer(`purchase-orders/${po.poNumber}-${Date.now()}.pdf`, buffer);
  const templateName = process.env.WHATSAPP_PO_TEMPLATE_NAME || "purchase_order_document";
  const result = await sendWhatsAppDocument({
    to: digitsOnly,
    documentUrl,
    filename: `${po.poNumber}.pdf`,
    templateName,
    templateParams: [po.poNumber, po.supplier],
  });
  if (result.error) return { error: result.error };

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "WhatsApp Sent", entity: "Purchase Order", entityLabel: po.poNumber, detail: `Sent to ${po.supplierPhone}` });
  return { ok: true };
}

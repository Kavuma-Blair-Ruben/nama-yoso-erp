"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { materialRequests, materialRequestLines, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";
import { nextMrNumber } from "@/server/db/sequences";
import { MR_NEXT_STATUSES, type MrStatus } from "@/server/db/queries/materialRequests";

const lineSchema = z.object({ stockItemId: z.string().min(1), qty: z.number().min(0), unitLabel: z.string().optional() });

const mrInputSchema = z.object({
  fromLocation: z.string().min(1),
  toLocation: z.string().min(1),
  requiredDate: z.string().min(1),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

export type MrActionResult = { error?: string; id?: string };

// No stock ledger involvement here on purpose — a Material Request is an
// approval paper trail between locations, matching index.html: the actual
// physical move is recorded separately as its own GRN or Transfer.
export async function createMaterialRequest(input: z.infer<typeof mrInputSchema>): Promise<MrActionResult> {
  const session = await assertPermission("orders", "edit");
  const parsed = mrInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Add at least one item with a quantity." };
  if (parsed.data.fromLocation === parsed.data.toLocation) return { error: "From and To locations must differ." };

  const mrNumber = await nextMrNumber();
  const id = await db.transaction(async (tx) => {
    const [mr] = await tx
      .insert(materialRequests)
      .values({
        mrNumber,
        fromLocation: parsed.data.fromLocation,
        toLocation: parsed.data.toLocation,
        requiredDate: parsed.data.requiredDate,
        notes: parsed.data.notes,
        status: "PENDING APPROVAL",
        createdBy: session.profile.id,
      })
      .returning({ id: materialRequests.id });

    for (const l of parsed.data.lines) {
      await tx.insert(materialRequestLines).values({ materialRequestId: mr.id, stockItemId: l.stockItemId, qty: l.qty, unitLabel: l.unitLabel });
    }

    await tx.insert(auditLog).values({
      actorId: session.profile.id,
      action: "Created",
      entity: "Material Request",
      entityLabel: mrNumber,
      detail: `${parsed.data.fromLocation} → ${parsed.data.toLocation} — ${parsed.data.lines.length} item(s)`,
    });
    return mr.id;
  });

  revalidatePath("/material-requests");
  return { id };
}

export async function updateMaterialRequestStatus(id: string, newStatus: MrStatus): Promise<MrActionResult> {
  const session = await assertPermission("orders", "edit");

  const [mr] = await db.select().from(materialRequests).where(eq(materialRequests.id, id));
  if (!mr) return { error: "Material request not found." };
  const allowed = MR_NEXT_STATUSES[mr.status as MrStatus] ?? [];
  if (!allowed.includes(newStatus)) return { error: `Can't move from ${mr.status} to ${newStatus}.` };

  await db.transaction(async (tx) => {
    await tx.update(materialRequests).set({ status: newStatus, decidedBy: session.profile.id, decidedAt: new Date() }).where(eq(materialRequests.id, id));
    await tx.insert(auditLog).values({ actorId: session.profile.id, action: "Status Change", entity: "Material Request", entityLabel: mr.mrNumber, detail: `${mr.status} → ${newStatus}` });
  });

  revalidatePath(`/material-requests/${id}`);
  revalidatePath("/material-requests");
  return { id };
}

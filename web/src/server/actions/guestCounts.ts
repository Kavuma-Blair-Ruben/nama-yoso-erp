"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { dailyGuestCounts, auditLog } from "@/server/db/schema";
import { assertPermission } from "@/server/auth/permissions";

export async function setDailyGuestCount(date: string, guestCount: number, tipsAmount?: number, notes?: string): Promise<{ error?: string }> {
  const session = await assertPermission("reports", "edit");
  if (!date) return { error: "Pick a date." };
  if (!Number.isFinite(guestCount) || guestCount < 0) return { error: "Enter a valid guest count." };
  if (tipsAmount != null && (!Number.isFinite(tipsAmount) || tipsAmount < 0)) return { error: "Enter a valid tips amount." };

  await db
    .insert(dailyGuestCounts)
    .values({ date, guestCount, tipsAmount, notes: notes?.trim() || undefined, enteredBy: session.profile.id })
    .onConflictDoUpdate({
      target: dailyGuestCounts.date,
      set: { guestCount, tipsAmount, notes: notes?.trim() || undefined, enteredBy: session.profile.id, updatedAt: new Date() },
    });

  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Set", entity: "Guest Count", entityLabel: date, detail: `${guestCount} guest(s)` });
  revalidatePath("/dashboard");
  return {};
}

export async function deleteDailyGuestCount(date: string): Promise<{ error?: string }> {
  const session = await assertPermission("reports", "edit");
  await db.delete(dailyGuestCounts).where(eq(dailyGuestCounts.date, date));
  await db.insert(auditLog).values({ actorId: session.profile.id, action: "Deleted", entity: "Guest Count", entityLabel: date, detail: "Removed" });
  revalidatePath("/dashboard");
  return {};
}

import "server-only";
import { db } from "@/server/db";
import { dailyGuestCounts, profiles } from "@/server/db/schema";
import { eq, gte, lte, and, desc } from "drizzle-orm";

export async function getGuestCounts(filters: { from?: string; to?: string } = {}) {
  const conditions = [];
  if (filters.from) conditions.push(gte(dailyGuestCounts.date, filters.from));
  if (filters.to) conditions.push(lte(dailyGuestCounts.date, filters.to));
  const rows = await db
    .select({ date: dailyGuestCounts.date, guestCount: dailyGuestCounts.guestCount, tipsAmount: dailyGuestCounts.tipsAmount, notes: dailyGuestCounts.notes, enteredByName: profiles.name, updatedAt: dailyGuestCounts.updatedAt })
    .from(dailyGuestCounts)
    .leftJoin(profiles, eq(dailyGuestCounts.enteredBy, profiles.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(dailyGuestCounts.date));
  const totalGuests = rows.reduce((s, r) => s + r.guestCount, 0);
  const totalTips = rows.reduce((s, r) => s + (r.tipsAmount ?? 0), 0);
  return { rows, totalGuests, totalTips, hasData: rows.length > 0 };
}

import "server-only";
import { db } from "@/server/db";
import { auditLog, profiles } from "@/server/db/schema";
import { and, eq, or, ilike, desc } from "drizzle-orm";

export async function listAuditLog(filters: { q?: string; entity?: string }) {
  const conditions = [];
  if (filters.q) {
    conditions.push(
      or(ilike(auditLog.action, `%${filters.q}%`), ilike(auditLog.entityLabel, `%${filters.q}%`), ilike(auditLog.detail, `%${filters.q}%`))!
    );
  }
  if (filters.entity) conditions.push(eq(auditLog.entity, filters.entity));

  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      entityLabel: auditLog.entityLabel,
      detail: auditLog.detail,
      createdAt: auditLog.createdAt,
      actorName: profiles.name,
    })
    .from(auditLog)
    .leftJoin(profiles, eq(auditLog.actorId, profiles.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(500);
}

export async function listAuditEntityTypes() {
  const rows = await db.selectDistinct({ entity: auditLog.entity }).from(auditLog);
  return rows.map((r) => r.entity).filter((e): e is string => !!e).sort();
}

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { withTimeout } from "@/lib/withTimeout";

// Deliberately public (see proxy.ts's PUBLIC_PATHS) and cheap — a single
// round trip on the shared connection pool. Pinged by keep-alive.yml so the
// pooler always has a warm connection to hand out, instead of every user's
// first request after a gap paying full reconnect cost on top of whatever
// the query itself already costs on a Nano-tier instance.
export async function GET() {
  const start = Date.now();
  try {
    await withTimeout(db.execute(sql`select 1`), 15000, "TIMEOUT");
    return NextResponse.json({ ok: true, ms: Date.now() - start });
  } catch (e) {
    return NextResponse.json({ ok: false, ms: Date.now() - start, error: e instanceof Error ? e.message : "unknown" }, { status: 503 });
  }
}

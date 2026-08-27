import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.local.example to .env.local and fill it in.");
}

// Pooled connection (Supabase transaction pooler, port 6543) for app runtime queries.
// connect_timeout is explicit rather than left at postgres.js's default
// (30s) — during a degraded/slow pooler (e.g. Supabase's own
// connection-pooler incidents), an unbounded wait here is what caused
// Next.js's response stream to hang until the client/proxy gave up and
// disconnected first (seen in production logs as "failed to pipe response"
// / BodyTimeoutError). Failing fast means a page render either succeeds
// quickly or errors out visibly well before that. idle_timeout is
// deliberately left unset — a shorter one would proactively tear down
// perfectly good warm connections during normal gaps between requests,
// forcing more reconnects, not fewer.
const client = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", connect_timeout: 10 });

export const db = drizzle(client, { schema });

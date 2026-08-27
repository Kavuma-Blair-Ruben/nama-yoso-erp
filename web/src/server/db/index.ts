import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.local.example to .env.local and fill it in.");
}

// Pooled connection (Supabase transaction pooler, port 6543) for app runtime queries.
// connect_timeout bounds how long establishing a connection can take;
// statement_timeout (a Postgres session parameter, set per-connection here)
// separately bounds how long an already-connected query is allowed to run —
// the pooler accepting a connection doesn't mean a query on it won't still
// queue/hang server-side during a degraded pooler (e.g. Supabase's own
// connection-pooler incidents). Without both, Next.js's response stream
// hangs until the client/proxy gives up and disconnects first (seen in
// production logs as "failed to pipe response" / BodyTimeoutError, and
// live as a page stuck "Pending" in the Network tab well after sign-in
// itself succeeded). idle_timeout is deliberately left unset — a shorter
// one would proactively tear down perfectly good warm connections during
// normal gaps between requests, forcing more reconnects, not fewer.
const client = postgres(process.env.DATABASE_URL, {
  prepare: false,
  ssl: "require",
  connect_timeout: 10,
  connection: { statement_timeout: 15000 },
});

export const db = drizzle(client, { schema });

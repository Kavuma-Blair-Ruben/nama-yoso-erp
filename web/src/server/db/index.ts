import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// DIRECT_URL (port 5432, straight to Postgres), not DATABASE_URL (port
// 6543, Supabase's Supavisor transaction pooler) — switched after
// confirming live, repeatedly, that queries stalling or outright timing
// out through the pooler (even trivial ones on tiny tables — one case sat
// "active" for 4m48s against a 2-row table) completed in a consistent
// ~225ms every time run directly against the same data, same night, same
// compute tier. The pooler itself, not compute size or query cost, was
// the remaining source of intermittent multi-second/full-timeout stalls.
// Safe to bypass the pooler here specifically because this app is one
// long-lived Node process (not a serverless/edge deployment spinning up
// many short-lived instances, which is what a pooler is for) — `max`
// below bounds this one process to at most 10 real Postgres connections,
// reused across every request, not one-per-request.
//
// Falls back to DATABASE_URL (the pooler) rather than hard-crashing the
// whole app if DIRECT_URL isn't set in this environment — render.yaml
// lists it as an expected env var, but this file has no way to confirm
// it's actually been filled in on Render's dashboard, and a startup
// throw here would take the entire app down rather than just leaving it
// on the (working, if occasionally stalling) pooler it already had.
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Neither DIRECT_URL nor DATABASE_URL is set — copy .env.local.example to .env.local and fill it in.");
}
if (!process.env.DIRECT_URL) {
  console.error("DIRECT_URL is not set — falling back to DATABASE_URL (the pooler). Set DIRECT_URL to get the direct-connection fix.");
}

// connect_timeout bounds how long establishing a connection can take;
// statement_timeout (a Postgres session parameter, set per-connection here)
// separately bounds how long an already-connected query is allowed to run.
// Without both, Next.js's response stream hangs until the client/proxy
// gives up and disconnects first (seen in production logs as "failed to
// pipe response" / BodyTimeoutError, and live as a page stuck "Pending" in
// the Network tab well after sign-in itself succeeded). idle_timeout is
// deliberately left unset — a shorter one would proactively tear down
// perfectly good warm connections during normal gaps between requests,
// forcing more reconnects, not fewer.
const client = postgres(connectionString, {
  max: 10,
  prepare: false,
  ssl: "require",
  connect_timeout: 10,
  connection: { statement_timeout: 15000 },
});

export const db = drizzle(client, { schema });

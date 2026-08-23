import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.local.example to .env.local and fill it in.");
}

// Pooled connection (Supabase transaction pooler, port 6543) for app runtime queries.
const client = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });

export const db = drizzle(client, { schema });

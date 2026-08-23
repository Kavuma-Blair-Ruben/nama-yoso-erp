import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

// Only `drizzle-kit migrate`/`push`/`studio` need a real, reachable DATABASE_URL.
// `generate` just diffs the schema against migration history and doesn't
// connect, so a placeholder here keeps that command usable before real
// Supabase credentials are filled into .env.local.
const DIRECT_URL = process.env.DIRECT_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: DIRECT_URL,
    ssl: "require",
  },
  strict: true,
  verbose: true,
});

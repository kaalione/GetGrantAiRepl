import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Supabase's TLS chain is not in Node's trust store. node-postgres reads TLS
// behavior from the URL's sslmode (an explicit ssl option is ignored when the
// URL carries one), so rewrite require → no-verify: encrypt without CA
// verification. This matches libpq/psycopg2 semantics — the Python scrapers
// keep reading the raw DATABASE_URL with sslmode=require.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL.replace(
    "sslmode=require",
    "sslmode=no-verify"
  ),
});

export const db = drizzle(pool, { schema });

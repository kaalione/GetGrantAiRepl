import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Schema changes (drizzle-kit push) should use the direct connection when
// available — Supabase's transaction pooler (port 6543) does not support the
// prepared statements drizzle-kit relies on. Falls back to DATABASE_URL for
// local development.
const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL (or DATABASE_URL_DIRECT), ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url },
});

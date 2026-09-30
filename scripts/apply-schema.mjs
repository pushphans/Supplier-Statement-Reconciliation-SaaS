/**
 * Apply supabase/schema.sql to a Supabase PostgreSQL database.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres \
 *     node scripts/apply-schema.mjs
 *
 * Falls back to reading SUPABASE_DB_URL from .env.local if not set.
 * Requires the `pg` package (already a devDependency).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  try {
    const env = readFileSync(join(root, ".env.local"), "utf8");
    const match = env.match(/^SUPABASE_DB_URL=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    /* ignore */
  }
  return null;
}

const url = loadEnvUrl();
if (!url) {
  console.error(
    "SUPABASE_DB_URL not set.\n" +
      "Set it in the environment or .env.local, e.g.\n" +
      "  postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres",
  );
  process.exit(1);
}

const sql = readFileSync(join(root, "supabase", "schema.sql"), "utf8");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Connected. Applying supabase/schema.sql …");
  await client.query(sql);
  console.log("Schema applied successfully.");
} catch (err) {
  console.error("Failed to apply schema:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

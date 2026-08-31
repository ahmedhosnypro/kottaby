import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { requireEnv } from "@/backend/lib/env";

const EXTENSIONS_SQL_PATH = resolve("backend/db/migration/1-extensions.sql");

/**
 * Applies `1-extensions.sql` (pg_trgm + is_valid_timezone) before schema push.
 * Drizzle schema CHECK/index definitions depend on these; push alone does not create them.
 */
export async function ensureExtensions(): Promise<void> {
  const connectionString = requireEnv("DATABASE_URL");
  const parsed = new URL(connectionString);
  const requiresSsl = parsed.searchParams.get("sslmode") === "require" || /\.neon\.tech$/i.test(parsed.hostname);

  const pool = new Pool({
    connectionString,
    ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
    max: 1,
  });

  try {
    const sqlText = readFileSync(EXTENSIONS_SQL_PATH, "utf8");
    globalThis.console.log("Ensuring DB extensions (pg_trgm, is_valid_timezone)...");
    await pool.query(sqlText);
    globalThis.console.log("Extensions ready.");
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  ensureExtensions().catch((err: unknown) => {
    globalThis.console.error("Failed to ensure extensions:", err);
    process.exit(1);
  });
}

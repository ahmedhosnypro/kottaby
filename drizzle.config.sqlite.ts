import { defineConfig } from "drizzle-kit";

process.env.DB_PROVIDER = "sqlite";

/**
 * Drizzle Kit configuration for the SQLite (libsql) dialect.
 * Used to generate SQLite-specific migrations:
 *   `bunx drizzle-kit generate --config=drizzle.config.sqlite.ts`
 *
 * The PostgreSQL config lives in `drizzle.config.ts` (unchanged). Keeping the
 * two dialects in separate config files is the officially recommended Drizzle
 * approach for multi-dialect projects.
 */
export default defineConfig({
  out: "./backend/drizzle-sqlite",
  dialect: "sqlite",
  schema: "./backend/db/schema/index.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL?.startsWith("file:")
      ? process.env.DATABASE_URL
      : `file:${process.env.DB_FILE_NAME ?? "./db/app.sqlite"}`,
  },
});

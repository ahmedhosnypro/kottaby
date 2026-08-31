import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for the PostgreSQL dialect.
 *
 * The schema is authored with `pgTable` / `pgEnum` from `drizzle-orm/pg-core`
 * under `backend/db/schema/`. This config generates + pushes PG migrations.
 *
 * The SQLite config lives in `drizzle.config.sqlite.ts` (separate file, separate
 * migrations folder `backend/drizzle-sqlite`) per the official Drizzle multi-dialect
 * recommendation.
 *
 * Usage:
 *   bun db generate            # drizzle-kit generate (interactive menu)
 *   bun db push                # drizzle-kit push (interactive menu)
 *   bunx drizzle-kit generate --config=drizzle.config.ts
 *   bunx drizzle-kit push --force --config=drizzle.config.ts
 */
export default defineConfig({
  out: "./backend/drizzle",
  dialect: "postgresql",
  schema: "./backend/db/schema/index.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres@localhost:5432/kottaby",
  },
});

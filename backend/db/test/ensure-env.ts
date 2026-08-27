/**
 * Test environment loader — preload that ensures env is loaded BEFORE any
 * test imports `@/backend/db`.
 *
 * The `applyDbEnvOverride()` in `backend/lib/env.ts` already force-loads
 * `.env` DB keys over stale OS-env placeholders at module-eval time, but
 * test runners may import `@/backend/db` before `.env` is fully parsed. This
 * preload sets `TEST_SERVER=1` so `logger.debug` is suppressed in tests,
 * and ensures the env loader has run.
 *
 * Loaded by `bunfig.toml` AFTER `logger-mock.ts` (so silenced logs apply
 * before any subsequent module-import noise).
 */
import { ensureEnvironmentValidated } from "@/backend/lib/env";

// Mark this process as a test server — `logger.logDomainError` will route
// to `debug` instead of `warn` (compact test logs).
process.env.TEST_SERVER = "1";

// `NODE_ENV` is typed as read-only in Bun's process types. Use a cast to
// override — this is a test-only preload, and the cast is intentional.
(process.env as { NODE_ENV?: string }).NODE_ENV = "test";

// Ensure DATABASE_URL / DB_PROVIDER / encryption key are present. Throws
// loudly at preload time if `.env` is missing required DB keys (rather than
// producing a confusing connection error deep inside a test).
try {
  ensureEnvironmentValidated();
} catch (error) {
  console.error("[ensure-env] Failed to validate test environment:", error);
  throw error;
}

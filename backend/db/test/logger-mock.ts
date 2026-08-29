/**
 * Logger mock — test preload that silences `console.*` calls so test output
 * stays compact and stray `console.*` calls in production code never leak PII.
 *
 * Loaded by `bunfig.toml` as a test preload (before any test file runs).
 * Replaces the global `console.info/warn/error/debug/log` with no-ops. The
 * real `backend/lib/logger.ts` delegates to `console.*` under the hood, so
 * mocking the globals is sufficient — no module-mock gymnastics needed.
 *
 * Tests that need to inspect log output (e.g. asserting that
 * `logger.logDomainError` was called) should use Bun's `spyOn(logger,
 * "logDomainError")` pattern instead.
 */

/** The original `console` methods (untouched). Exported for opt-in debugging. */
const originalInfo = console.info.bind(console);
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);
const originalDebug = console.debug.bind(console);
const originalLog = console.log.bind(console);

export const originalConsole = {
  info: originalInfo,
  warn: originalWarn,
  error: originalError,
  debug: originalDebug,
  log: originalLog,
};

// No-op replacements — keep the test output clean.
const noop = (): void => {};

// Replace the global console methods. We mutate `globalThis.console` rather
// than re-assigning it (some test runners re-create the object between tests).
console.info = noop;
console.warn = noop;
console.error = noop;
console.debug = noop;
console.log = noop;

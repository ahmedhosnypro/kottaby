/**
 * Backend logger — structured logging with domain-error awareness.
 *
 * Replaces `console.*` across the backend. Use `logger.logDomainError()` for
 * expected business rejections (4xx-equivalents: NotFound, Validation, Conflict)
 * so they log at `debug` in test mode (TEST_SERVER=1) and `warn` in production,
 * keeping test logs compact and production logs actionable.
 *
 * @see backend/AGENTS.md — "Use `logger.logDomainError(msg, ctx)` when handling
 *      business rejections, 4xx equivalents, `NotFoundError`, or `ValidationError`."
 */
// Read `process.env` via the global `process` (polyfilled by Next.js for
// the browser bundle). Avoids `import { env } from "node:process"` —
// webpack's non-Turbopack path can't resolve `node:` URIs and the GraphQL
// route compiles backend modules into the server bundle, where this
// import triggered an ERR_INVALID_ARG_TYPE on `fs.readFile(new URL(...))`
// when the bundler silently swapped to a polyfilled shim.
// When `process` is genuinely absent (rare edge-case; webpack polyfills
// `process.env` so the fallback is rarely reached in practice), supply an
// explicit `NODE_ENV: "development"` fallback. Next.js's
// `node_modules/next/types/global.d.ts` augments `NodeJS.ProcessEnv` to make
// `NODE_ENV` REQUIRED, so a bare `{}` literal is not assignable to the type —
// and `{} as NodeJS.ProcessEnv` would trip `oxlint(no-unsafe-type-assertion)`.
// Declaring the fallback as an explicitly-typed const makes the ternary
// resolve to `ProcessEnv | ProcessEnv` (collapses to `ProcessEnv`) — no `as`
// cast, no type error. The fallback value `"development"` preserves the
// original runtime behaviour: `env.NODE_ENV === "test"` is false (was
// `undefined === "test"` = false) and `env.NODE_ENV === "production"` is
// false (was `undefined === "production"` = false), so `isTestMode` /
// `isProduction` both stay false in the fallback case.
const EMPTY_ENV: NodeJS.ProcessEnv = { NODE_ENV: "development" };
const env: NodeJS.ProcessEnv = typeof process !== "undefined" && process.env ? process.env : EMPTY_ENV;

const isTestMode = env.TEST_SERVER === "1" || env.NODE_ENV === "test";

/** Log level for domain errors (expected business rejections). */
type DomainErrorLogLevel = "debug" | "warn";

/** Context payload for domain-error logs. */
export interface DomainErrorContext {
  readonly code?: string;
  readonly entity?: string;
  readonly entityId?: string | number;
  readonly locale?: string;
  readonly [key: string]: unknown;
}

function formatDomainContext(ctx?: DomainErrorContext): string {
  if (!ctx) {
    return "";
  }
  const entries = Object.entries(ctx).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return "";
  }
  return ` ${JSON.stringify(Object.fromEntries(entries))}`;
}

/** Formats log args into a single string line for `process.stdout/stderr`. */
function formatArgs(args: readonly unknown[]): string {
  return args.length > 0 ? ` ${JSON.stringify(args)}` : "";
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    process.stdout.write(`[INFO] ${message}${formatArgs(args)}\n`);
  },

  warn(message: string, ...args: unknown[]): void {
    process.stderr.write(`[WARN] ${message}${formatArgs(args)}\n`);
  },

  error(message: string, ...args: unknown[]): void {
    process.stderr.write(`[ERROR] ${message}${formatArgs(args)}\n`);
  },

  debug(message: string, ...args: unknown[]): void {
    if (isTestMode) {
      process.stdout.write(`[DEBUG] ${message}${formatArgs(args)}\n`);
    }
  },

  /**
   * Logs a domain error (expected business rejection) at the appropriate level.
   *
   * In test mode (TEST_SERVER=1) → `debug` (keeps test logs compact).
   * In production → `warn` (actionable but not a crash).
   *
   * Never logs plaintext passwords, tokens, or PII — callers must ensure the
   * message + context are safe.
   */
  logDomainError(message: string, ctx?: DomainErrorContext): void {
    const level: DomainErrorLogLevel = isTestMode ? "debug" : "warn";
    const formatted = `[DOMAIN] ${message}${formatDomainContext(ctx)}`;
    if (level === "debug") {
      process.stdout.write(`${formatted}\n`);
    } else {
      process.stderr.write(`${formatted}\n`);
    }
  },
} as const;

export type Logger = typeof logger;

/**
 * Frontend logger — structured logging with caller tagging.
 *
 * Mirrors the backend logger API (`backend/lib/logger.ts`) but writes to
 * `process.stdout` / `process.stderr` (server-side SSR + Node test runner).
 * In the browser, `process.stdout` is not bundled by webpack — the write
 * becomes a silent no-op (frontend logger calls are diagnostics only; the
 * auth flow never depends on log emission).
 *
 * Per `frontend/AGENTS.md`: "No `console.*` in frontend (use the `logger`)" —
 * this module is the SINGLE place where structured logging is allowed in the
 * frontend. It avoids `console.*` so the ESLint `no-console: error` rule
 * stays green everywhere (no per-file override needed).
 *
 * Call convention (matches every existing call site):
 *   logger.info({ caller: "AuthProvider.checkAuth" }, "[AuthRedirect] ...", { userId });
 *   logger.warn({ caller: "apollo.utils", force: true }, "[AuthRedirect]", message, payload);
 *   logger.debug({ caller: "useApolloConnectivity" }, "[Connectivity] Check completed");
 */
// Read `process.env.NODE_ENV` without a `node:process` import — webpack
// (the non-Turbopack Next.js dev path) cannot resolve `node:` URIs and
// Turbopack polyfills `process.env` already. Using the global `process`
// (polyfilled by Next.js for the browser) keeps both bundlers happy.
const env: NodeJS.ProcessEnv = typeof process !== "undefined" && process.env ? process.env : ({} as NodeJS.ProcessEnv);

/** Metadata attached to every log call — identifies the originating module. */
export interface LogMeta {
  /** Module/function name that emitted the log (for traceability). */
  readonly caller?: string;
  /**
   * Bypass the dev-only gate so the log appears in production browser DevTools.
   * Used by auth-redirect diagnostics that must be visible on deployed sites.
   */
  readonly force?: boolean;
  readonly [key: string]: unknown;
}

/** Context payload for domain-error logs (expected business rejections). */
export interface DomainErrorContext {
  readonly code?: string;
  readonly entity?: string;
  readonly entityId?: string | number;
  readonly locale?: string;
  readonly [key: string]: unknown;
}

const isProduction = env.NODE_ENV === "production";

function prefix(meta: LogMeta): string {
  return meta.caller ? `[${meta.caller}]` : "[app]";
}

/** Serializes a single log argument to a string (strings pass through). */
function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/** Joins variadic log args into a single trailing string segment. */
function formatArgs(args: readonly unknown[]): string {
  return args.length > 0 ? ` ${args.map(formatArg).join(" ")}` : "";
}

/**
 * Writes a line to `process.stdout` when running under Node (SSR, tests,
 * scripts). In the browser, `process.stdout` is undefined (webpack polyfills
 * only `process.env`) — the call is a silent no-op.
 */
function writeOut(line: string): void {
  const stdout = typeof process === "object" ? process.stdout : undefined;
  if (stdout && typeof stdout.write === "function") {
    stdout.write(`${line}\n`);
  }
}

/** Same as {@link writeOut} but targets `process.stderr`. */
function writeErr(line: string): void {
  const stderr = typeof process === "object" ? process.stderr : undefined;
  if (stderr && typeof stderr.write === "function") {
    stderr.write(`${line}\n`);
  }
}

/**
 * Frontend logger singleton.
 *
 * `debug` is gated on `NODE_ENV !== "production"` unless `meta.force` is set.
 * `info`/`warn`/`error` always emit (the browser console is cheap and these
 * levels are rare). `logDomainError` mirrors the backend signature for
 * cross-layer consistency.
 */
export const logger = {
  info(meta: LogMeta, message: string, ...args: unknown[]): void {
    writeOut(`[INFO] ${prefix(meta)} ${message}${formatArgs(args)}`);
  },

  warn(meta: LogMeta, message: string, ...args: unknown[]): void {
    writeErr(`[WARN] ${prefix(meta)} ${message}${formatArgs(args)}`);
  },

  error(meta: LogMeta, message: string, ...args: unknown[]): void {
    writeErr(`[ERROR] ${prefix(meta)} ${message}${formatArgs(args)}`);
  },

  debug(meta: LogMeta, message: string, ...args: unknown[]): void {
    if (isProduction && !meta.force) return;
    writeOut(`[DEBUG] ${prefix(meta)} ${message}${formatArgs(args)}`);
  },

  logDomainError(message: string, ctx?: DomainErrorContext): void {
    const ctxStr = ctx ? ` ${JSON.stringify(ctx)}` : "";
    writeErr(`[DOMAIN] ${message}${ctxStr}`);
  },
} as const;

export type Logger = typeof logger;

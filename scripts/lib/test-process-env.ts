/**
 * Test helpers for temporarily changing `process.env`.
 */

/**
 * Unsets env vars using bracket notation so TypeScript accepts deletion
 * of known `process.env` property names.
 */
export function unsetProcessEnvVars(keys: readonly string[]): void {
  for (const key of keys) {
    delete process.env[key];
  }
}

/**
 * Restores `process.env` from a snapshot produced by `{ ...process.env }`.
 */
export function restoreProcessEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

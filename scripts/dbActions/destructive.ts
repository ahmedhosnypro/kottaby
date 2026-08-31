import { assessDestructiveDbCommandSafety, formatDestructiveDbBlockMessage } from "@/scripts/lib/destructiveDbGuard";

/**
 * Actions that are permanently disabled for this repo regardless of environment.
 * "1" = Reset Database, "8" = Clean Generate (reset -> gen -> migrate -> seed)
 * These are permanently disabled for this repo to prevent accidental data loss.
 */
export const PERMANENTLY_DISABLED_ACTION_KEYS = new Set(["1", "8"]);

/**
 * Actions that are blocked in production/cloud environments.
 * "1" = Reset Database, "4" = Drop Drizzle Schema, "8" = Clean Generate
 */
export const DESTRUCTIVE_ACTION_KEYS = new Set(["1", "4", "8"]);
export const DISABLED_ACTION_SUFFIX = " (disabled — cloud/production env)";
export const PERMANENTLY_DISABLED_SUFFIX = " (disabled — repo policy)";

export function isDestructiveActionBlocked(key: string): boolean {
  // Permanently disabled for this repo - blocked regardless of environment
  if (PERMANENTLY_DISABLED_ACTION_KEYS.has(key)) {
    return true;
  }

  // Environment-based blocking for other destructive actions
  if (!DESTRUCTIVE_ACTION_KEYS.has(key)) {
    return false;
  }

  return assessDestructiveDbCommandSafety().blocked;
}

export function isPermanentlyDisabled(key: string): boolean {
  return PERMANENTLY_DISABLED_ACTION_KEYS.has(key);
}

export function getDisabledActionSuffix(key: string): string {
  if (isPermanentlyDisabled(key)) {
    return PERMANENTLY_DISABLED_SUFFIX;
  }
  return DISABLED_ACTION_SUFFIX;
}

export function printDestructiveActionBlock(): void {
  const { reasons } = assessDestructiveDbCommandSafety();
  globalThis.console.error(formatDestructiveDbBlockMessage(reasons));
}

export function printPermanentlyDisabledBlock(key: string): void {
  const actionLabels: Record<string, string> = {
    "1": "Reset Database",
    "8": "Clean Generate (Reset -> Gen -> Migrate -> Seed)",
  };
  const label = actionLabels[key] || key;
  globalThis.console.error(
    `✗ Blocked: "${label}" is permanently disabled for this repository.\n` +
      `  This action is disabled by repository policy to prevent accidental data loss.\n` +
      `  Use a different repository or environment for destructive database operations.`
  );
}

/**
 * Env vars read by {@link assessDestructiveDbCommandSafety}.
 * Cleared before applying a selected db CLI env file so stale values cannot leak across files.
 */
export const DESTRUCTIVE_GUARD_ENV_KEYS = [
  "NODE_ENV",
  "DB_PROVIDER",
  "STORAGE_PROVIDER",
  "REDIS_PROVIDER",
  "DATABASE_URL",
  "UPSTASH_REDIS_REST_URL",
  "GCP_PROJECT_ID",
  "GCP_BUCKET_NAME",
  "BLOB_READ_WRITE_TOKEN",
] as const;

/**
 * Removes destructive-guard env vars from `process.env`.
 *
 * Used when switching db CLI env files so stale cloud/production signals
 * from a previously loaded file cannot leak into safety checks.
 *
 * This does **not** reset the database or change repo policy blocks.
 */
export function clearDestructiveGuardEnvVars(): void {
  for (const key of DESTRUCTIVE_GUARD_ENV_KEYS) {
    delete process.env[key];
  }
}

/**
 * Assessment of whether destructive DB commands are safe to run in the current environment.
 */
export interface DestructiveDbSafetyAssessment {
  blocked: boolean;
  reasons: string[];
}

/**
 * Patterns that match cloud database hostnames.
 */
const MANAGED_DB_HOST_PATTERNS: RegExp[] = [
  /neon\.tech$/i,
  /aws\.neon\.tech$/i,
  /supabase\.co$/i,
  /supabase\.com$/i,
  /rds\.amazonaws\.com$/i,
  /render\.com$/i,
  /railway\.app$/i,
  /cockroachlabs\.cloud$/i,
  /postgres\.database\.azure\.com$/i,
  /digitalocean\.com$/i,
];

/**
 * Patterns that match production hostnames.
 */
const PRODUCTION_HOST_MARKERS: RegExp[] = [/-prod\./i, /\.prod\./i, /-prod-/i, /-production/i, /\.production\./i];

/**
 * Get reasons why destructive DB commands are blocked due to the database URL hostname.
 */
function getDatabaseUrlHostReasons(databaseUrl: string): string[] {
  const reasons: string[] = [];

  try {
    const hostname = new URL(databaseUrl).hostname.toLowerCase();

    for (const pattern of MANAGED_DB_HOST_PATTERNS) {
      if (pattern.test(hostname)) {
        reasons.push(`DATABASE_URL host matches cloud pattern: ${hostname}`);
        return reasons;
      }
    }

    for (const pattern of PRODUCTION_HOST_MARKERS) {
      if (pattern.test(hostname)) {
        reasons.push(`DATABASE_URL host matches production pattern: ${hostname}`);
        return reasons;
      }
    }
  } catch {
    // Invalid URL — skip host-based checks
  }

  return reasons;
}

/**
 * Get reasons why destructive DB commands are blocked in the current environment.
 */
function getCloudProviderReasons(): string[] {
  const reasons: string[] = [];

  if (process.env.NODE_ENV === "production") {
    reasons.push('NODE_ENV is "production"');
  }

  const dbProvider = process.env.DB_PROVIDER ?? "postgres";
  if (dbProvider === "neon") {
    reasons.push('DB_PROVIDER is "neon" (cloud database)');
  }

  const storageProvider = process.env.STORAGE_PROVIDER ?? "local";
  if (storageProvider !== "local") {
    reasons.push(`STORAGE_PROVIDER is "${storageProvider}" (cloud storage)`);
  }

  if (process.env.REDIS_PROVIDER === "upstash") {
    reasons.push('REDIS_PROVIDER is "upstash" (cloud redis)');
  }

  if (process.env.UPSTASH_REDIS_REST_URL) {
    reasons.push("UPSTASH_REDIS_REST_URL is set");
  }

  if (process.env.GCP_PROJECT_ID || process.env.GCP_BUCKET_NAME) {
    reasons.push("GCP storage configuration is set");
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    reasons.push("BLOB_READ_WRITE_TOKEN is set (Vercel Blob)");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    reasons.push(...getDatabaseUrlHostReasons(databaseUrl));
  }

  return reasons;
}

/**
 * Assess whether destructive DB commands (reset, drop, cleanGenerate) are safe to run.
 */
export function assessDestructiveDbCommandSafety(): DestructiveDbSafetyAssessment {
  const reasons = getCloudProviderReasons();
  return {
    blocked: reasons.length > 0,
    reasons,
  };
}

export function formatDestructiveDbBlockMessage(reasons: string[]): string {
  const lines = [
    "✗ Blocked: destructive DB command is disabled for production/cloud environments.",
    "",
    "Detected signals:",
    ...reasons.map(reason => `  - ${reason}`),
    "",
    "Use a local .env (postgres + local storage) for destructive DB workflows.",
  ];
  return lines.join("\n");
}

/**
 * Throws when destructive DB commands must not run in the current environment.
 */
export function assertDestructiveDbCommandAllowed(): void {
  const assessment = assessDestructiveDbCommandSafety();
  if (assessment.blocked) {
    throw new Error(formatDestructiveDbBlockMessage(assessment.reasons));
  }
}

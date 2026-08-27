import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { isTestCi } from "@/backend/lib/test-ci-env";

export const TEST_BUILD_DIST_DIR = ".next-test-prod";
export const TEST_ENV_FILE = ".env.test";

const SYSTEM_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SHELL",
  "TERM",
  "DISPLAY",
  "CI",
] as const;

function getSystemEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of SYSTEM_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

export function loadTestEnvFile(rootDir = process.cwd()): Record<string, string> {
  const envPath = join(rootDir, TEST_ENV_FILE);
  if (!existsSync(envPath)) {
    if (isTestCi()) {
      return {};
    }
    throw new Error(`Could not load ${TEST_ENV_FILE}. Create it from the "Test environment" section in .env.example.`);
  }

  const parsed = config({ path: envPath, processEnv: {} }).parsed;
  if (!parsed) {
    if (isTestCi()) {
      return {};
    }
    throw new Error(`Could not parse ${TEST_ENV_FILE}. Check the file format in the project root.`);
  }
  return parsed;
}

function getParentProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

/**
 * Env for `next build` / `next start` in the UI test production harness.
 *
 * Local: uses `.env.test` only (plus system vars and test overrides) so `.env` /
 * `.env.local` cannot override test config.
 *
 * CI: when `TEST_CI=true`, merges the GitHub Actions job env so workflow-provided
 * values reach `next build` / `next start` (see `.github/workflows/ci.yml`).
 */
export function getTestProductionEnv(
  overrides: Record<string, string> = {},
  rootDir = process.cwd()
): NodeJS.ProcessEnv {
  const ciEnv = isTestCi() ? getParentProcessEnv() : {};

  return Object.assign({}, process.env, getSystemEnv(), loadTestEnvFile(rootDir), ciEnv, overrides, {
    NODE_ENV: "production",
    NEXT_DIST_DIR: TEST_BUILD_DIST_DIR,
    IS_DEMO: "true",
    TEST_SERVER: "1",
    AUTH_COOKIE_SECURE: "false",
    DISABLE_RATE_LIMITING: "true",
  });
}

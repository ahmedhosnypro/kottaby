import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDestructiveActionBlocked, isPermanentlyDisabled } from "@/scripts/dbActions/destructive";
import { applyEnvFile } from "@/scripts/dbActions/envFile";
import { assessDestructiveDbCommandSafety } from "@/scripts/lib";

const LOCAL_ENV = `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kottaby
DB_PROVIDER=postgres
STORAGE_PROVIDER=local
REDIS_PROVIDER=local
NODE_ENV=development
`;

const NEON_ENV = `DATABASE_URL=postgresql://user:pass@ep-example.us-east-1.aws.neon.tech/neondb?sslmode=require
DB_PROVIDER=neon
STORAGE_PROVIDER=local
REDIS_PROVIDER=local
NODE_ENV=development
`;

describe("db action guards after env file selection", () => {
  let tempDir = "";
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kottaby-db-guard-"));
    envSnapshot = { ...process.env };
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("blocks permanently disabled actions after applying a local env file", () => {
    writeFileSync(join(tempDir, ".env"), LOCAL_ENV);
    applyEnvFile(".env", tempDir);

    expect(isPermanentlyDisabled("1")).toBe(true);
    expect(isPermanentlyDisabled("8")).toBe(true);
    expect(isDestructiveActionBlocked("1")).toBe(true);
    expect(isDestructiveActionBlocked("8")).toBe(true);
    expect(assessDestructiveDbCommandSafety().blocked).toBe(false);
  });

  it("blocks env-destructive actions when the selected env file targets cloud", () => {
    writeFileSync(join(tempDir, ".env.cloud"), NEON_ENV);
    applyEnvFile(".env.cloud", tempDir);

    expect(isPermanentlyDisabled("4")).toBe(false);
    expect(isDestructiveActionBlocked("4")).toBe(true);
    expect(assessDestructiveDbCommandSafety().blocked).toBe(true);
  });

  it("allows env-destructive actions when the selected env file is local", () => {
    writeFileSync(join(tempDir, ".env"), LOCAL_ENV);
    applyEnvFile(".env", tempDir);

    expect(isDestructiveActionBlocked("4")).toBe(false);
    expect(assessDestructiveDbCommandSafety().blocked).toBe(false);
  });

  it("clears stale cloud guard vars when switching to a local env file", () => {
    writeFileSync(join(tempDir, ".env"), LOCAL_ENV);
    process.env.BLOB_READ_WRITE_TOKEN = "stale-token-from-auto-loaded-env";

    applyEnvFile(".env", tempDir);

    expect(process.env.BLOB_READ_WRITE_TOKEN).toBeUndefined();
    expect(assessDestructiveDbCommandSafety().blocked).toBe(false);
    expect(isDestructiveActionBlocked("4")).toBe(false);
  });
});

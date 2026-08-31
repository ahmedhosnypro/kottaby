import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapDbCliEnv } from "@/scripts/dbActions/bootstrapEnv";
import { clearSelectedEnvFileForTests, DEFAULT_ENV_FILE, getSelectedEnvFile } from "@/scripts/dbActions/envFile";
import { restoreProcessEnv, unsetProcessEnvVars } from "@/scripts/lib";

const LOCAL_ENV = `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kottaby
DATABASE_ENCRYPTION_KEY=bootstrap-test-key
DB_PROVIDER=postgres
`;

const BOOTSTRAP_CLEAR_ENV_KEYS = ["DATABASE_URL", "DATABASE_ENCRYPTION_KEY"] as const;

describe("bootstrapDbCliEnv", () => {
  let tempDir = "";
  const originalCwd = process.cwd();
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kottaby-db-bootstrap-"));
    process.chdir(tempDir);
    writeFileSync(join(tempDir, DEFAULT_ENV_FILE), LOCAL_ENV);
    envSnapshot = { ...process.env };
    unsetProcessEnvVars(BOOTSTRAP_CLEAR_ENV_KEYS);
  });

  afterEach(() => {
    clearSelectedEnvFileForTests();
    process.chdir(originalCwd);
    restoreProcessEnv(envSnapshot);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads .env by default for non-interactive commands", () => {
    bootstrapDbCliEnv(["migrate"]);

    expect(process.env.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/kottaby");
    expect(process.env.DATABASE_ENCRYPTION_KEY).toBe("bootstrap-test-key");
    expect(getSelectedEnvFile()).toBe(DEFAULT_ENV_FILE);
  });

  it("does not load env for interactive mode", () => {
    bootstrapDbCliEnv([]);

    expect(process.env.DATABASE_URL).toBeUndefined();
    expect(getSelectedEnvFile()).toBeNull();
  });

  it("loads the requested env file for non-interactive commands", () => {
    writeFileSync(join(tempDir, ".env.staging"), LOCAL_ENV.replace("/kottaby", "/kottaby_staging"));

    bootstrapDbCliEnv(["--env-file", ".env.staging", "push"]);

    expect(process.env.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/kottaby_staging");
    expect(getSelectedEnvFile()).toBe(".env.staging");
  });
});

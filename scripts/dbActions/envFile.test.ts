import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyEnvFile,
  discoverEnvFilesWithDatabaseUrl,
  getSelectedEnvFile,
  isValidDatabaseUrl,
  parseDbCliArgs,
  readDatabaseUrlFromEnvFile,
} from "@/scripts/dbActions/envFile";

describe("isValidDatabaseUrl", () => {
  it("accepts postgres and postgresql URLs", () => {
    expect(isValidDatabaseUrl("postgresql://postgres:postgres@localhost:5432/kottaby")).toBe(true);
    expect(isValidDatabaseUrl("postgres://postgres:postgres@127.0.0.1:5432/kottaby")).toBe(true);
  });

  it("rejects placeholders, empty values, and non-postgres protocols", () => {
    expect(isValidDatabaseUrl(undefined)).toBe(false);
    expect(isValidDatabaseUrl("")).toBe(false);
    expect(isValidDatabaseUrl("postgresql://<user>:<password>@localhost:5432/kottaby")).toBe(false);
    expect(isValidDatabaseUrl("mysql://localhost:3306/kottaby")).toBe(false);
    expect(isValidDatabaseUrl("not-a-url")).toBe(false);
  });
});

describe("discoverEnvFilesWithDatabaseUrl", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kottaby-db-env-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns only env files with valid DATABASE_URL values", () => {
    writeFileSync(join(tempDir, ".env"), "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kottaby\n");
    writeFileSync(
      join(tempDir, ".env.test"),
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kottaby_test\n"
    );
    writeFileSync(
      join(tempDir, ".env.example"),
      "DATABASE_URL=postgresql://<user>:<password>@localhost:5432/kottaby\n"
    );
    writeFileSync(join(tempDir, ".env.invalid"), "DATABASE_URL=not-a-url\n");

    const discovered = discoverEnvFilesWithDatabaseUrl(tempDir);

    expect(discovered.map(option => option.fileName)).toEqual([".env", ".env.test"]);
  });

  it("sorts .env first and the rest alphabetically", () => {
    writeFileSync(
      join(tempDir, ".env.staging"),
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/staging\n"
    );
    writeFileSync(join(tempDir, ".env"), "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kottaby\n");
    writeFileSync(join(tempDir, ".env.local"), "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/local\n");

    const discovered = discoverEnvFilesWithDatabaseUrl(tempDir);

    expect(discovered.map(option => option.fileName)).toEqual([".env", ".env.local", ".env.staging"]);
  });
});

describe("applyEnvFile", () => {
  let tempDir = "";
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kottaby-db-env-"));
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads env vars and records the selected env file", () => {
    writeFileSync(
      join(tempDir, ".env.custom"),
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/custom\nDB_PROVIDER=postgres\n"
    );

    applyEnvFile(".env.custom", tempDir);

    expect(process.env.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/custom");
    expect(process.env.DB_PROVIDER).toBe("postgres");
    expect(getSelectedEnvFile()).toBe(".env.custom");
    expect(readDatabaseUrlFromEnvFile(".env.custom", tempDir)).toBe(
      "postgresql://postgres:postgres@localhost:5432/custom"
    );
  });
});

describe("parseDbCliArgs", () => {
  it("extracts --env-file before the action argument", () => {
    expect(parseDbCliArgs(["--env-file", ".env.staging", "push"])).toEqual({
      showHelp: false,
      envFile: ".env.staging",
      actionArg: "push",
    });
  });

  it("supports --env-file=<file> syntax", () => {
    expect(parseDbCliArgs(["migrate", "--env-file=.env.test"])).toEqual({
      showHelp: false,
      envFile: ".env.test",
      actionArg: "migrate",
    });
  });

  it("detects help flags", () => {
    expect(parseDbCliArgs(["--help"])).toEqual({
      showHelp: true,
      envFile: undefined,
      actionArg: undefined,
    });
  });
});

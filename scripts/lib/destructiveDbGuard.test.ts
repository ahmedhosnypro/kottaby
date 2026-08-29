import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { assessDestructiveDbCommandSafety } from "@/scripts/lib/destructiveDbGuard";

const LOCAL_ENV: Record<string, string | undefined> = {
  NODE_ENV: "development",
  DB_PROVIDER: "postgres",
  STORAGE_PROVIDER: "local",
  REDIS_PROVIDER: "local",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/kottaby",
  UPSTASH_REDIS_REST_URL: undefined,
  GCP_PROJECT_ID: undefined,
  GCP_BUCKET_NAME: undefined,
  BLOB_READ_WRITE_TOKEN: undefined,
};

let envSnapshot: Record<string, string | undefined>;

function applyEnv(overrides: Record<string, string | undefined> = {}): void {
  const nextEnv = { ...LOCAL_ENV, ...overrides };

  for (const [key, value] of Object.entries(nextEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeEach(() => {
  envSnapshot = {
    NODE_ENV: process.env.NODE_ENV,
    DB_PROVIDER: process.env.DB_PROVIDER,
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
    REDIS_PROVIDER: process.env.REDIS_PROVIDER,
    DATABASE_URL: process.env.DATABASE_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
    GCP_BUCKET_NAME: process.env.GCP_BUCKET_NAME,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  };

  applyEnv();
});

afterEach(() => {
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("assessDestructiveDbCommandSafety", () => {
  it("allows local development environment", () => {
    const assessment = assessDestructiveDbCommandSafety();

    expect(assessment.blocked).toBe(false);
    expect(assessment.reasons).toEqual([]);
  });

  it("blocks when DB_PROVIDER is neon", () => {
    applyEnv({ DB_PROVIDER: "neon" });

    const assessment = assessDestructiveDbCommandSafety();

    expect(assessment.blocked).toBe(true);
    expect(assessment.reasons).toContain('DB_PROVIDER is "neon" (cloud database)');
  });

  it("blocks when STORAGE_PROVIDER is vercel", () => {
    applyEnv({ STORAGE_PROVIDER: "vercel" });

    const assessment = assessDestructiveDbCommandSafety();

    expect(assessment.blocked).toBe(true);
    expect(assessment.reasons).toContain('STORAGE_PROVIDER is "vercel" (cloud storage)');
  });

  it("blocks when DATABASE_URL points to Neon", () => {
    applyEnv({
      DATABASE_URL: "postgresql://user:password@ep-example-123456.us-east-1.aws.neon.tech/neondb?sslmode=require",
    });

    const assessment = assessDestructiveDbCommandSafety();

    expect(assessment.blocked).toBe(true);
    expect(assessment.reasons.some(reason => reason.includes("neon.tech"))).toBe(true);
  });

  it("blocks when NODE_ENV is production", () => {
    applyEnv({ NODE_ENV: "production" });

    const assessment = assessDestructiveDbCommandSafety();

    expect(assessment.blocked).toBe(true);
    expect(assessment.reasons).toContain('NODE_ENV is "production"');
  });

  it("allows LAN postgres URL without cloud markers", () => {
    applyEnv({
      DATABASE_URL: "postgresql://postgres:postgres@192.168.1.10:5432/kottaby",
    });

    const assessment = assessDestructiveDbCommandSafety();

    expect(assessment.blocked).toBe(false);
    expect(assessment.reasons).toEqual([]);
  });
});

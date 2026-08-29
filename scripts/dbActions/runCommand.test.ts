import { describe, expect, it } from "bun:test";
import { buildBunCommandArgs } from "@/scripts/dbActions/runCommand";

describe("buildBunCommandArgs", () => {
  it("returns args unchanged when no env file is selected", () => {
    expect(buildBunCommandArgs(["run", "backend/db/scripts/migrate.ts"], null)).toEqual([
      "run",
      "backend/db/scripts/migrate.ts",
    ]);
  });

  it("prefixes --no-env-file and equals-form --env-file before subcommands", () => {
    expect(buildBunCommandArgs(["run", "backend/db/scripts/migrate.ts"], ".env.vercel")).toEqual([
      "--no-env-file",
      "--env-file=.env.vercel",
      "run",
      "backend/db/scripts/migrate.ts",
    ]);
  });
});

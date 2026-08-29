import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CliIo,
  EnvTemplateMissingError,
  INVALID_CI_ENV_VALUE_PREFIX,
  InvalidCiEnvValueError,
  materializeEnvTest,
  parseEnvTemplate,
  parseEnvTemplateDetailed,
  RequiredCiEnvMissingError,
  runMaterializeEnvTestCli,
} from "@/scripts/ci/materialize-env-test";

const TEMPLATE_FIXTURE = [
  "# CI test-environment template (fixture mirror)",
  "",
  "TEST_SERVER=1",
  "TEST_CI=1",
  "DATABASE_URL=overridden-by-ci",
  "AUTH_COOKIE_SECURE=false",
  "",
].join("\n");

/** Non-production stand-in for the workflow-supplied ephemeral Postgres URL. */
const FAKE_DB_URL = "postgres://ci-bot:t0p-s3cret-VALUE@db.invalid:5432/kottaby_test";

const OVERRIDES: Record<string, string> = { DATABASE_URL: FAKE_DB_URL };

let sandboxDir = "";

beforeEach(async () => {
  sandboxDir = await mkdtemp(join(tmpdir(), "materialize-env-test-"));
});

afterEach(async () => {
  await rm(sandboxDir, { recursive: true, force: true });
});

function templatePathInSandbox(body: string): Promise<string> {
  const target = join(sandboxDir, ".env.test.ci");
  return writeFile(target, body, "utf8").then(() => target);
}

function outputPathInSandbox(): string {
  return join(sandboxDir, ".env.test");
}

/** Buffers CLI output for assertions without touching real stdio streams. */
function makeCaptures(env: Record<string, string | undefined>) {
  const chunks: { stdout: string[]; stderr: string[] } = { stdout: [], stderr: [] };
  const cliIo: CliIo = {
    env,
    templatePath: join(sandboxDir, ".env.test.ci"),
    outputPath: outputPathInSandbox(),
    writeStdout: text => chunks.stdout.push(text),
    writeStderr: text => chunks.stderr.push(text),
  };
  return {
    cliIo,
    stdoutText: () => chunks.stdout.join(""),
    stderrText: () => chunks.stderr.join(""),
  };
}

describe("Tier 1 — primary paths", () => {
  test("happy path merges template values with CI overrides and writes .env.test", async () => {
    const templatePath = await templatePathInSandbox(TEMPLATE_FIXTURE);
    const outputPath = outputPathInSandbox();

    const result = await materializeEnvTest({ templatePath, outputPath, env: OVERRIDES });

    expect(result.outputPath).toBe(outputPath);
    expect(result.keyNames).toStrictEqual(["TEST_SERVER", "TEST_CI", "DATABASE_URL", "AUTH_COOKIE_SECURE"]);
    expect(result.overriddenKeys).toStrictEqual(["DATABASE_URL"]);

    const written = await readFile(outputPath, "utf8");
    expect(written).toBe(
      ["TEST_SERVER=1", "TEST_CI=1", `DATABASE_URL=${FAKE_DB_URL}`, "AUTH_COOKIE_SECURE=false", ""].join("\n")
    );

    const permissions = (await stat(outputPath)).mode & 0o777;
    expect(permissions).toBe(0o600);
  });

  test("template missing ⇒ named error with exact contract message", async () => {
    let caught: EnvTemplateMissingError | undefined;
    try {
      await materializeEnvTest({
        templatePath: join(sandboxDir, ".env.test.ci"), // never created
        outputPath: outputPathInSandbox(),
        env: OVERRIDES,
      });
    } catch (error) {
      if (error instanceof EnvTemplateMissingError) caught = error;
    }
    expect(caught?.message).toBe("CI env template .env.test.ci missing");
  });

  test("override missing ⇒ named error whose message contains the required string", async () => {
    const templatePath = await templatePathInSandbox(TEMPLATE_FIXTURE);
    let caught: RequiredCiEnvMissingError | undefined;
    try {
      await materializeEnvTest({ templatePath, outputPath: outputPathInSandbox(), env: {} });
    } catch (error) {
      if (error instanceof RequiredCiEnvMissingError) caught = error;
    }
    expect(caught?.message).toContain("missing required CI env variable: DATABASE_URL");
  });

  test("fail-fast reports the FIRST sentinel offender in template order", async () => {
    const templatePath = await templatePathInSandbox(
      ["ALPHA_URL=overridden-by-ci", "BETA_URL=overridden-by-ci"].join("\n")
    );
    let caught: RequiredCiEnvMissingError | undefined;
    try {
      await materializeEnvTest({ templatePath, outputPath: outputPathInSandbox(), env: {} });
    } catch (error) {
      if (error instanceof RequiredCiEnvMissingError) caught = error;
    }
    expect(caught?.message).toContain("missing required CI env variable: ALPHA_URL");
  });

  test("CLI routing: success exits 0 and prints KEY NAMES ONLY to stdout", async () => {
    await templatePathInSandbox(TEMPLATE_FIXTURE);
    const captures = makeCaptures(OVERRIDES);
    const exitCode = await runMaterializeEnvTestCli(captures.cliIo);
    expect(exitCode).toBe(0);
    const stdoutLines = captures.stdoutText().split("\n");
    expect(stdoutLines).toContain("DATABASE_URL");
    expect(stdoutLines.filter(line => line.includes("="))).toStrictEqual([]); // names carry no '='
    expect(captures.stderrText()).toBe("");
  });

  test("CLI routing: template-missing prints exact stderr string and exits 1", async () => {
    // No template written into the sandbox ⇒ ENOENT.
    const captures = makeCaptures(OVERRIDES);
    const exitCode = await runMaterializeEnvTestCli(captures.cliIo);
    expect(exitCode).toBe(1);
    expect(captures.stderrText()).toBe("CI env template .env.test.ci missing\n");
    expect(captures.stdoutText()).toBe("");
  });

  test("CLI routing: override-missing prints exact stderr naming the key, exits 1", async () => {
    await templatePathInSandbox(TEMPLATE_FIXTURE);
    const captures = makeCaptures({});
    const exitCode = await runMaterializeEnvTestCli(captures.cliIo);
    expect(exitCode).toBe(1);
    expect(captures.stderrText()).toBe("missing required CI env variable: DATABASE_URL\n");
  });
});

describe("Tier 2 — template & value boundaries", () => {
  test("comments, blank lines, indentation and CRLF endings are tolerated", async () => {
    const crlfBody = [
      "# leading comment",
      "",
      "   # indented comment",
      "TEST_SERVER=1",
      "",
      "DATABASE_URL=overridden-by-ci",
      "",
    ].join("\r\n");
    const templatePath = await templatePathInSandbox(crlfBody);
    const outputPath = outputPathInSandbox();
    const result = await materializeEnvTest({ templatePath, outputPath, env: OVERRIDES });
    expect(result.keyNames).toStrictEqual(["TEST_SERVER", "DATABASE_URL"]);
    expect(await readFile(outputPath, "utf8")).toBe(`TEST_SERVER=1\nDATABASE_URL=${FAKE_DB_URL}\n`);
  });

  test("extra env vars absent from the template are NOT copied into .env.test", async () => {
    const templatePath = await templatePathInSandbox("ONLY_KEY=solo\n");
    const outputPath = outputPathInSandbox();
    const result = await materializeEnvTest({
      templatePath,
      outputPath,
      env: { EXTRA_NOISE: "leave-me-out", ...OVERRIDES },
    });
    expect(result.keyNames).toStrictEqual(["ONLY_KEY"]);
    expect(await readFile(outputPath, "utf8")).toBe("ONLY_KEY=solo\n");
  });

  test("override values containing '=' survive byte-for-byte", async () => {
    const templatePath = await templatePathInSandbox("DATABASE_URL=overridden-by-ci\n");
    const connectionString = "postgres://u:p@h/db?sslmode=require&application_name=runner=x";
    const outputPath = outputPathInSandbox();
    await materializeEnvTest({ templatePath, outputPath, env: { DATABASE_URL: connectionString } });
    expect(await readFile(outputPath, "utf8")).toBe(`DATABASE_URL=${connectionString}\n`);
  });

  test("template literal values containing '=' are preserved verbatim", async () => {
    const templatePath = await templatePathInSandbox("FIXTURE=a=b=c\n");
    const outputPath = outputPathInSandbox();
    await materializeEnvTest({ templatePath, outputPath, env: {} });
    expect(await readFile(outputPath, "utf8")).toBe("FIXTURE=a=b=c\n");
  });

  test("empty-string override counts as PRESENT (only undefined ⇒ missing)", async () => {
    const templatePath = await templatePathInSandbox("DATABASE_URL=overridden-by-ci\nFLAG=\n");
    const outputPath = outputPathInSandbox();
    const result = await materializeEnvTest({
      templatePath,
      outputPath,
      env: { DATABASE_URL: "", FLAG: "" },
    });
    expect(result.overriddenKeys).toStrictEqual(["DATABASE_URL"]);
    expect(await readFile(outputPath, "utf8")).toBe("DATABASE_URL=\nFLAG=\n");
  });

  test("whitespace around sentinel tokens is normalized before comparison", async () => {
    const templatePath = await templatePathInSandbox("DATABASE_URL=  overridden-by-ci  \n");
    const result = await materializeEnvTest({
      templatePath,
      outputPath: outputPathInSandbox(),
      env: OVERRIDES,
    });
    expect(result.overriddenKeys).toStrictEqual(["DATABASE_URL"]);
  });
});

describe("Tier 3 — chaos / robustness", () => {
  test("missing output DIRECTORY is created recursively", async () => {
    const templatePath = await templatePathInSandbox("ONLY_KEY=solo\n");
    const outputPath = join(sandboxDir, "nested/deeper/.env.test");
    const result = await materializeEnvTest({ templatePath, outputPath, env: {} });
    expect(result.outputPath).toBe(outputPath);
    expect(await readFile(outputPath, "utf8")).toBe("ONLY_KEY=solo\n");
  });

  test("re-run idempotence: second run overwrites tampered output deterministically", async () => {
    const templatePath = await templatePathInSandbox(TEMPLATE_FIXTURE);
    const outputPath = outputPathInSandbox();
    await materializeEnvTest({ templatePath, outputPath, env: OVERRIDES });
    const firstRun = await readFile(outputPath, "utf8");
    await writeFile(outputPath, "TAMPERED=yes\n", "utf8"); // drift between runs
    await materializeEnvTest({ templatePath, outputPath, env: OVERRIDES });
    expect(await readFile(outputPath, "utf8")).toBe(firstRun);
  });

  // Root ignores POSIX permission bits; Windows has no EACCES semantics here.
  const permissionsUnenforceable =
    process.platform === "win32" || (typeof process.getuid === "function" && process.getuid() === 0);

  test.skipIf(permissionsUnenforceable)(
    "unreadable template (EACCES) propagates raw — absence is the only named case",
    async () => {
      const templatePath = await templatePathInSandbox("SECRET_SHAPED=x\n");
      await chmod(templatePath, 0o000);
      let caught: unknown = null;
      try {
        await materializeEnvTest({ templatePath, outputPath: outputPathInSandbox(), env: {} });
      } catch (error) {
        caught = error;
      }
      expect(caught).not.toBeNull();
      expect(caught).not.toBeInstanceOf(EnvTemplateMissingError);
    }
  );
});

describe("Tier 4 — secret hygiene: values never echo to stdout/stderr", () => {
  test("successful CLI run exposes key NAMES but none of the resolved VALUES", async () => {
    const fixtureValue = "fixture-literal-VALUE-do-not-print";
    await templatePathInSandbox(`FIXED=${fixtureValue}\nDATABASE_URL=overridden-by-ci\n`);
    const captures = makeCaptures(OVERRIDES);
    const exitCode = await runMaterializeEnvTestCli(captures.cliIo);
    const stdout = captures.stdoutText();
    const stderr = captures.stderrText();
    expect(exitCode).toBe(0);
    expect(stdout).toContain("DATABASE_URL");
    expect(stdout).toContain("FIXED");
    expect(stdout).not.toContain(FAKE_DB_URL); // override value
    expect(stdout).not.toContain(fixtureValue); // even harmless literal VALUES stay hidden
    expect(stderr).toBe("");
  });

  test("failure paths name the offending KEY, never any value", async () => {
    await templatePathInSandbox("DATABASE_URL=overridden-by-ci\n");
    const captures = makeCaptures({});
    const exitCode = await runMaterializeEnvTestCli(captures.cliIo);
    expect(exitCode).toBe(1);
    const stderr = captures.stderrText();
    expect(stderr).toContain("DATABASE_URL");
    expect(stderr).not.toContain(FAKE_DB_URL);
  });

  test("process.env injection (Bun.env aliasing) is honored by the default env source", async () => {
    const savedDatabaseUrl = process.env.DATABASE_URL;
    const savedProbe = process.env.EXTRA_PROBE_FOR_2B;
    process.env.DATABASE_URL = FAKE_DB_URL;
    process.env.EXTRA_PROBE_FOR_2B = "ignored-extra";
    try {
      const templatePath = await templatePathInSandbox("DATABASE_URL=overridden-by-ci\nONLY_KEY=solo\n");
      const outputPath = outputPathInSandbox();
      // NOTE: no `env` option — the core MUST consult process.env by default.
      const result = await materializeEnvTest({ templatePath, outputPath });
      expect(result.overriddenKeys).toStrictEqual(["DATABASE_URL"]);
      const written = await readFile(outputPath, "utf8");
      expect(written).toContain(`DATABASE_URL=${FAKE_DB_URL}`);
      expect(written).not.toContain("ignored-extra");
    } finally {
      if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = savedDatabaseUrl;
      if (savedProbe === undefined) delete process.env.EXTRA_PROBE_FOR_2B;
      else process.env.EXTRA_PROBE_FOR_2B = savedProbe;
    }
  });
});

describe("parseEnvTemplate — DEFINED parsing behavior", () => {
  test("splits on first '=', trims, skips malformed lines, last duplicate wins", () => {
    const text = [
      "# header",
      "",
      "KEY_A=value-a",
      "broken line without separator",
      "=empty-key-skipped",
      "KEY_B==leading-equals-value",
      "KEY_A=value-a-final",
      "   SPACED = spaced value  ",
    ].join("\n");
    expect(parseEnvTemplate(text)).toStrictEqual([
      { key: "KEY_A", value: "value-a-final" }, // first position kept, LAST value wins
      { key: "KEY_B", value: "=leading-equals-value" },
      { key: "SPACED", value: "spaced value" },
    ]);
  });

  test("CR-only legacy endings and empty input parse deterministically", () => {
    expect(parseEnvTemplate("A=1\rB=2\r")).toStrictEqual([
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ]);
    expect(parseEnvTemplate("")).toStrictEqual([]);
  });
});

/* ==================================================================== */
/* Newline injection, perms TOCTOU, and malformed-line visibility       */
/* ==================================================================== */

describe("newline-bearing override values are rejected before any write", () => {
  const INJECTING_URL = ["postgres://ci-bot@db.invalid:5432/kottaby_test", "INJECTED_KEY=pwn"].join("\n");

  test("LF override ⇒ InvalidCiEnvValueError names the key via the pinned constant", async () => {
    await templatePathInSandbox("DATABASE_URL=overridden-by-ci\n");
    let caught: InvalidCiEnvValueError | undefined;
    try {
      await materializeEnvTest({
        templatePath: join(sandboxDir, ".env.test.ci"),
        outputPath: outputPathInSandbox(),
        env: { DATABASE_URL: INJECTING_URL },
      });
    } catch (error) {
      if (error instanceof InvalidCiEnvValueError) caught = error;
    }
    expect(INVALID_CI_ENV_VALUE_PREFIX).toBe("invalid CI env variable value (newline): ");
    expect(caught?.message).toBe(`${INVALID_CI_ENV_VALUE_PREFIX}DATABASE_URL`);
    // Nothing was persisted to the destination:
    let statError: unknown = null;
    try {
      await stat(outputPathInSandbox());
    } catch (error) {
      statError = error;
    }
    expect(statError).not.toBeNull();
  });

  test("CR override rejected identically (both injection channels covered)", async () => {
    await templatePathInSandbox("DATABASE_URL=overridden-by-ci\n");
    let caught: unknown = null;
    try {
      await materializeEnvTest({
        templatePath: join(sandboxDir, ".env.test.ci"),
        outputPath: outputPathInSandbox(),
        env: { DATABASE_URL: "postgres://h/db\rEXTRA=k" },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidCiEnvValueError);
  });

  test("CLI routing: exact stderr string, exit 1, no partial .env.test anywhere", async () => {
    await templatePathInSandbox(TEMPLATE_FIXTURE);
    const captures = makeCaptures({ DATABASE_URL: INJECTING_URL });
    const exitCode = await runMaterializeEnvTestCli(captures.cliIo);
    expect(exitCode).toBe(1);
    expect(captures.stderrText()).toBe(`${INVALID_CI_ENV_VALUE_PREFIX}DATABASE_URL\n`);
    expect(captures.stdoutText()).toBe(""); // stdout stays silent on failure
    const leftovers = (await readdir(sandboxDir)).filter(name => name.includes(".tmp-"));
    expect(leftovers).toStrictEqual([]); // no temp-file residue even on failure paths
  });

  test("legit punctuated URL values keep passing byte-for-byte (only LF/CR are hostile)", async () => {
    await templatePathInSandbox("DATABASE_URL=overridden-by-ci\n");
    const value = "postgres://u:p%40ss@db.invalid:5432/kottaby?sslmode=require&x=y#frag";
    await materializeEnvTest({
      templatePath: join(sandboxDir, ".env.test.ci"),
      outputPath: outputPathInSandbox(),
      env: { DATABASE_URL: value },
    });
    expect(await readFile(outputPathInSandbox(), "utf8")).toBe(`DATABASE_URL=${value}\n`);
  });
});

describe("mode-before-write + atomic publish", () => {
  test("pre-existing LAX .env.test is tightened to 0600 by atomic replacement", async () => {
    const outputPath = outputPathInSandbox();
    const templatePath = await templatePathInSandbox("ONLY_KEY=solo\n");
    await writeFile(outputPath, "STALE=leak-canary\n");
    await chmod(outputPath, 0o666); // simulate the old lax window's precondition

    await materializeEnvTest({ templatePath, outputPath, env: {} });

    const permissions = (await stat(outputPath)).mode & 0o777;
    expect(permissions).toBe(0o600);
    expect(await readFile(outputPath, "utf8")).toBe("ONLY_KEY=solo\n"); // stale bytes gone
  });

  test("no temp residue survives ANY successful run (publish-or-clean invariant)", async () => {
    const templatePath = await templatePathInSandbox(TEMPLATE_FIXTURE);
    // Exercise several runs over the same directory (reruns reuse no temp state);
    // sequential awaits keep the deterministic write→publish order observable.
    const oneRun = () => materializeEnvTest({ templatePath, outputPath: outputPathInSandbox(), env: OVERRIDES });
    await oneRun();
    await oneRun();
    await oneRun();
    const leftovers = (await readdir(sandboxDir)).filter(name => name.includes(".tmp-"));
    expect(leftovers).toStrictEqual([]);
  });

  // NOTE (documented construction guarantee): the classic TOCTOU watcher test is
  // intentionally NOT implemented — with mode forced to 0600 BEFORE the first
  // write into an unguessable temp inode that is later atomically renamed onto
  // the target, NO observable filesystem state ever pairs lax permissions with
  // real content. The two assertions above pin every externally checkable
  // consequence of that invariant instead.
});

describe("malformed-line visibility (non-fatal diagnostic)", () => {
  test("skipped structural lines are counted and reported exactly once via writeStderr", async () => {
    const templatePath = await templatePathInSandbox(
      ["GOOD=1", "broken line without separator", "=empty-key", "# comment", "", "FINE=2", "\talsobroken"].join("\n")
    );
    const diagnostics: string[] = [];
    const result = await materializeEnvTest({
      templatePath,
      outputPath: outputPathInSandbox(),
      env: {},
      writeStderr: text => diagnostics.push(text),
    });
    expect(result.keyNames).toStrictEqual(["GOOD", "FINE"]);
    expect(diagnostics).toStrictEqual(["template: ignored 3 malformed lines\n"]);
  });

  test("clean templates stay fully silent (stderr untouched)", async () => {
    const templatePath = await templatePathInSandbox(TEMPLATE_FIXTURE);
    const diagnostics: string[] = [];
    await materializeEnvTest({
      templatePath,
      outputPath: outputPathInSandbox(),
      env: OVERRIDES,
      writeStderr: text => diagnostics.push(text),
    });
    expect(diagnostics).toStrictEqual([]);
  });

  test("diagnostic is COUNT-ONLY (no malformed-line content can leak)", async () => {
    // Malformed = structurally unusable (no '=' at all here) — yet the raw line
    // still carries value-shaped text that must never reach any output stream.
    const secretish = "BROKEN_SECRET_LINE t0p-s3cret-SHAPE";
    await templatePathInSandbox(`OK=1\n${secretish}\n`);
    const captures = makeCaptures({});
    const exitCode = await runMaterializeEnvTestCli(captures.cliIo);
    expect(exitCode).toBe(0); // non-fatal: run stays green
    expect(captures.stdoutText()).toContain("OK"); // normal success summary unaffected
    expect(captures.stderrText()).toContain("template: ignored 1 malformed lines");
    expect(captures.stderrText()).not.toContain(secretish); // no value leaks to stderr
    expect(captures.stdoutText()).not.toContain(secretish);
  });

  test("parseEnvTemplateDetailed exposes the counter; legacy view unchanged", () => {
    const detailed = parseEnvTemplateDetailed("A=1\njunk\n=B\nC=3");
    expect(detailed.entries).toStrictEqual(parseEnvTemplate("A=1\njunk\n=B\nC=3"));
    expect(detailed.ignoredMalformedLines).toBe(2);
    expect(parseEnvTemplateDetailed("# only comments\n\n").ignoredMalformedLines).toBe(0);
  });
});

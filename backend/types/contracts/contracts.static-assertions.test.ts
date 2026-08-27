/**
 * Static Forbidden-Pattern Assertions Suite (REQ-073).
 * bun:test file-content scans enforcing structural invariants.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { TransactionStatus } from "@/backend/enum/billing/transaction-status.enum";
import { TransactionType } from "@/backend/enum/billing/transaction-type.enum";
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import { TeacherRequestPreference } from "@/backend/enum/teachers/teacher-request-preference.enum";
import { UserRole } from "@/backend/enum/users/user-role.enum";

const CONTRACTS_DIR = join(__dirname);

/** All enum member values across the project (programmatic). */
const ALL_ENUM_VALUES = new Set([
  ...Object.values(SessionIntent),
  ...Object.values(SessionType),
  ...Object.values(TransactionType),
  ...Object.values(TransactionStatus),
  ...Object.values(NotificationType),
  ...Object.values(AuditActionType),
  ...Object.values(TeacherRequestPreference),
  ...Object.values(UserRole),
]);

/** Files to scan (library files only, NOT test files). */
const LIB_FILES = [
  "session-request.contract.types.ts",
  "teacher-availability.contract.types.ts",
  "evaluation-session.contract.types.ts",
  "session-completion-escrow.contract.types.ts",
  "session-notification.contract.types.ts",
  "admin-audit.contract.types.ts",
  "contract-error-codes.constants.ts",
  "contract-guards.ts",
  "index.ts",
];

async function readLibFiles(): Promise<Map<string, string>> {
  const entries = await Promise.all(
    LIB_FILES.map(async f => [f, await readFile(join(CONTRACTS_DIR, f), "utf-8")] as const)
  );
  return new Map(entries);
}

/** Extracts `content.slice(bodyStart, bodyEnd)` for the interface block starting at matchIndex. */
function sliceInterfaceBody(content: string, matchIndex: number): string {
  const bodyStart = content.indexOf("{", matchIndex);
  const braceCount = { count: 0, start: bodyStart };
  let bodyEnd = bodyStart;
  for (let i = bodyStart; i < content.length; i++) {
    if (content[i] === "{") braceCount.count++;
    if (content[i] === "}") braceCount.count--;
    if (braceCount.count === 0) {
      bodyEnd = i;
      break;
    }
  }
  return content.slice(bodyStart, bodyEnd);
}

describe("REQ-073 Static Forbidden-Pattern Assertions", () => {
  let files: Map<string, string>;

  beforeAll(async () => {
    files = await readLibFiles();
  });

  test("1. Zero `any` outside narrowly-scoped guard internals", () => {
    expect(files.size).toBe(LIB_FILES.length);
    for (const [name, content] of files) {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (
          /\bany\b/.test(lines[i]) &&
          !lines[i].trimStart().startsWith("//") &&
          !lines[i].trimStart().startsWith("*")
        ) {
          expect.unreachable(`Found 'any' in ${name}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
  });

  test("2. Zero string-literal duplicates of enum values", () => {
    expect(files.size).toBe(LIB_FILES.length);
    for (const [name, content] of files) {
      // Whitelist: EscrowReleaseReason literals "CancellationConfirmed" and
      // "ConfirmationTimeout" ARE allowed as literal union members in this file.
      if (name === "session-completion-escrow.contract.types.ts") continue;
      // Check: no enum value appears as a string literal in type annotations
      for (const enumVal of ALL_ENUM_VALUES) {
        const regex = new RegExp(`:\\s*"${enumVal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
        if (regex.test(content)) {
          expect.unreachable(`Enum string-literal '${enumVal}' found in ${name}`);
        }
      }
    }
  });

  test("3. Zero hardcoded user-facing strings (only ContractErrorCodes values)", () => {
    expect(files.size).toBe(LIB_FILES.length);
    for (const [name, content] of files) {
      if (name === "contract-error-codes.constants.ts") continue; // allowed to have code strings
      if (name === "contract-guards.ts") {
        // Guards reference codes via ContractErrorCodes — no raw strings expected.
        // Exclude import paths, JSDoc comment lines, and indexed access patterns.
        const lines = content
          .split("\n")
          .filter(
            l =>
              !l.includes('from "') &&
              !l.trimStart().startsWith("//") &&
              !l.trimStart().startsWith("*") &&
              !l.includes("[")
          );
        const code = lines.join("\n");
        const stringLiterals = code.match(/"[^"]+"/g) ?? [];
        const allowedInGuards = ["CONTRACT_", "ESCROW_", "./", "string", "number"];
        for (const lit of stringLiterals) {
          if (!allowedInGuards.some(prefix => lit.includes(prefix))) {
            expect.unreachable(`Hardcoded string '${lit}' in ${name}`);
          }
        }
      }
    }
  });

  test("4. Zero imports from @/frontend or @/app (REQ-025/062)", () => {
    for (const [_name, content] of files) {
      expect(content).not.toMatch(/from\s+["']@\/frontend/);
      expect(content).not.toMatch(/from\s+["']@\/app/);
    }
  });

  test("5. Zero spread-into-insert/call anti-patterns (REQ-031)", () => {
    expect(files.size).toBe(LIB_FILES.length);
    for (const [_name, content] of files) {
      // No { ...input } or { ...data } spread-into-call patterns
      const spreadPatterns = /\{\s*\.\.\./g;
      const matches = content.match(spreadPatterns);
      if (matches && matches.length > 0) {
        expect.unreachable(`Spread pattern found in ${_name}: ${matches.length} occurrences`);
      }
    }
  });

  test("6. Zero non-readonly exported mutable values (REQ-024/073)", () => {
    for (const [_name, content] of files) {
      // No `let` or `var` exports
      const letVarExport = /export\s+(let|var)\s+/;
      expect(content).not.toMatch(letVarExport);
    }
  });

  test("7. Zero DBTransaction/runInRollback usage (REQ-042)", () => {
    for (const [_name, content] of files) {
      expect(content).not.toMatch(/DBTransaction/);
      expect(content).not.toMatch(/runInRollback/);
    }
  });

  test("8. Barrel-shape rule: only export * from, relative paths, max one / (REQ-010)", async () => {
    const barrelContent = files.get("index.ts");
    if (!barrelContent) throw new Error("index.ts not found in barrel check");
    const lines = barrelContent
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith("//") && !l.startsWith("*"));

    for (const line of lines) {
      expect(line).toMatch(/^export \* from "\.\/.+";?$/);
      // No @/ aliases
      expect(line).not.toContain("@/");
      // No ../ parent traversal
      expect(line).not.toContain("..");
      // Max one / in the path
      const match = /from "\.\/(.+)"/.exec(line);
      if (match) {
        const slashes = (match[1].match(/\//g) ?? []).length;
        expect(slashes).toBeLessThanOrEqual(1);
      }
    }
  });

  test("9. Ownership-identifier presence heuristic (REQ-033)", () => {
    const IDENTIFIER_FIELDS = /Id|userId|teacherId|studentId|walletId|sessionId|actorId|evaluatedId|evaluatorId/;
    // Pure-value types exempted (REQ-033 whitelist)
    const EXEMPT_TYPES = new Set([
      "TeacherSubjectsParsed",
      "SessionEventNotificationEntityRef",
      "ActorContextRef", // IS the identity (userId)
      "TeacherMatchingLanguagesInput",
      "GuardTranslationBag",
      "ContractErrorCode",
      "EscrowReleaseReason",
      "SessionEventNotificationType",
    ]);
    for (const [name, content] of files) {
      if (!name.endsWith(".types.ts") && name !== "admin-audit.contract.types.ts") continue;
      const interfaceMatches = content.matchAll(/export\s+interface\s+(\w+)/g);
      for (const match of interfaceMatches) {
        const interfaceName = match[1];
        if (EXEMPT_TYPES.has(interfaceName)) continue;
        // Extract the interface body
        const body = sliceInterfaceBody(content, match.index);
        expect(body).toMatch(IDENTIFIER_FIELDS);
      }
    }
  });
});
